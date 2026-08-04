// Google-retirement notice campaign (docs/analysis/google-oauth-removal-impact.md §6).
// Contract under test: admin-only, DRY RUN BY DEFAULT, idempotent, marks only after a
// successful send, and never leaks plaintext member email.
jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/app/api/v1/users/model", () => ({
    __esModule: true,
    default: { getGoogleIdentityUsers: jest.fn(), updateUser: jest.fn() },
}));
jest.mock("@/app/api/auth/[...nextauth]/service", () => ({
    __esModule: true,
    default: { decryptEmail: jest.fn((v) => (v || "").replace("enc:", "")) },
}));
jest.mock("@/app/utils/email.util", () => ({ sendGoogleRetirementEmail: jest.fn() }));
jest.mock("@/lib/rateLimit", () => ({ rateLimit: jest.fn(() => ({ allowed: true, retryAfterMs: 0 })) }));
jest.mock("@/lib/audit", () => ({ auditLog: jest.fn() }));

import { POST } from "@/app/api/v1/admin/google-retirement-notice/route";
import { runGoogleRetirementNotice, maskEmail } from "@/app/api/v1/admin/google-retirement-notice/service";
import { auth } from "@/auth";
import UserModel from "@/app/api/v1/users/model";
import { sendGoogleRetirementEmail } from "@/app/utils/email.util";
import { rateLimit } from "@/lib/rateLimit";
import { auditLog } from "@/lib/audit";

const googleOnly = (n) => ({
    userID: `u-${n}`, googleId: `g-${n}`, discordId: "", password: "no password",
    email: `enc:user${n}@example.org`, firstName: `User${n}`,
});
const req = (body) => ({ json: async () => body });

beforeEach(() => {
    jest.clearAllMocks();
    UserModel.updateUser.mockResolvedValue({});
    sendGoogleRetirementEmail.mockResolvedValue();
    rateLimit.mockReturnValue({ allowed: true, retryAfterMs: 0 });
});

describe("route authorization", () => {
    test("anonymous -> 401 and nothing is queried", async () => {
        auth.mockResolvedValue(null);
        expect((await POST(req({}))).status).toBe(401);
        expect(UserModel.getGoogleIdentityUsers).not.toHaveBeenCalled();
    });

    test("non-admin member -> 403 and nothing is sent", async () => {
        auth.mockResolvedValue({ user: { userID: "u-9", role: "user" } });
        expect((await POST(req({ send: true }))).status).toBe(403);
        expect(sendGoogleRetirementEmail).not.toHaveBeenCalled();
    });
});

describe("route send-gating", () => {
    beforeEach(() => auth.mockResolvedValue({ user: { userID: "admin-1", role: "admin" } }));

    test("REGRESSION: defaults to a dry run — an empty body sends nothing", async () => {
        UserModel.getGoogleIdentityUsers.mockResolvedValue([googleOnly(1)]);
        const body = await (await POST(req({}))).json();
        expect(body.dryRun).toBe(true);
        expect(body.cohort).toBe(1);
        expect(sendGoogleRetirementEmail).not.toHaveBeenCalled();
    });

    test("REGRESSION: truthy-but-not-true send values do NOT send", async () => {
        UserModel.getGoogleIdentityUsers.mockResolvedValue([googleOnly(1)]);
        for (const v of ["true", 1, "yes", {}]) {
            const body = await (await POST(req({ send: v }))).json();
            expect(body.dryRun).toBe(true);
        }
        expect(sendGoogleRetirementEmail).not.toHaveBeenCalled();
    });

    test("send:true actually sends", async () => {
        UserModel.getGoogleIdentityUsers.mockResolvedValue([googleOnly(1)]);
        const body = await (await POST(req({ send: true }))).json();
        expect(body.sent).toBe(1);
        expect(sendGoogleRetirementEmail).toHaveBeenCalledTimes(1);
    });

    test("a malformed body is treated as a dry run, not an error", async () => {
        UserModel.getGoogleIdentityUsers.mockResolvedValue([googleOnly(1)]);
        const res = await POST({ json: async () => { throw new Error("bad json"); } });
        expect(res.status).toBe(200);
        expect((await res.json()).dryRun).toBe(true);
    });

    test("never returns plaintext member email", async () => {
        UserModel.getGoogleIdentityUsers.mockResolvedValue([googleOnly(1)]);
        const raw = JSON.stringify(await (await POST(req({ send: true }))).json());
        expect(raw).not.toContain("user1@example.org");
        expect(raw).toContain("u****@example.org");
    });
});

describe("cohort selection + idempotency", () => {
    test("only googleOnly accounts are contacted", async () => {
        UserModel.getGoogleIdentityUsers.mockResolvedValue([
            googleOnly(1),
            { ...googleOnly(2), discordId: "d-2" },              // has Discord
            { ...googleOnly(3), password: "$2b$10$realhash" },    // has a password
        ]);
        const r = await runGoogleRetirementNotice({ send: true });
        expect(r.candidates).toBe(3);
        expect(r.cohort).toBe(1);
        expect(r.sent).toBe(1);
    });

    test("REGRESSION: already-notified accounts are skipped (no spam on re-run)", async () => {
        UserModel.getGoogleIdentityUsers.mockResolvedValue([
            { ...googleOnly(1), googleRetirementNoticeSentAt: new Date("2026-07-01") },
            googleOnly(2),
        ]);
        const r = await runGoogleRetirementNotice({ send: true });
        expect(r.alreadyNotified).toBe(1);
        expect(r.sent).toBe(1);
        expect(sendGoogleRetirementEmail).toHaveBeenCalledTimes(1);
    });

    test("force:true re-sends to already-notified accounts (reminder pass)", async () => {
        UserModel.getGoogleIdentityUsers.mockResolvedValue([
            { ...googleOnly(1), googleRetirementNoticeSentAt: new Date("2026-07-01") },
        ]);
        const r = await runGoogleRetirementNotice({ send: true, force: true });
        expect(r.sent).toBe(1);
        expect(r.alreadyNotified).toBe(0);
    });

    test("limit caps recipients", async () => {
        UserModel.getGoogleIdentityUsers.mockResolvedValue([googleOnly(1), googleOnly(2), googleOnly(3)]);
        const r = await runGoogleRetirementNotice({ send: true, limit: 2 });
        expect(r.sent).toBe(2);
    });
});

describe("failure handling", () => {
    test("REGRESSION: a failed send is NOT marked as notified (so it retries)", async () => {
        UserModel.getGoogleIdentityUsers.mockResolvedValue([googleOnly(1)]);
        sendGoogleRetirementEmail.mockRejectedValue(new Error("smtp down"));
        const r = await runGoogleRetirementNotice({ send: true });
        expect(r.failed).toBe(1);
        expect(r.sent).toBe(0);
        expect(UserModel.updateUser).not.toHaveBeenCalled();
    });

    test("one failure does not abort the rest of the cohort", async () => {
        UserModel.getGoogleIdentityUsers.mockResolvedValue([googleOnly(1), googleOnly(2)]);
        sendGoogleRetirementEmail.mockRejectedValueOnce(new Error("smtp blip")).mockResolvedValueOnce();
        const r = await runGoogleRetirementNotice({ send: true });
        expect(r.failed).toBe(1);
        expect(r.sent).toBe(1);
    });

    test("undecryptable email is counted, never mailed", async () => {
        UserModel.getGoogleIdentityUsers.mockResolvedValue([{ ...googleOnly(1), email: "enc:garbage-no-at" }]);
        const r = await runGoogleRetirementNotice({ send: true });
        expect(r.undecryptable).toBe(1);
        expect(sendGoogleRetirementEmail).not.toHaveBeenCalled();
    });

    test("empty cohort is a no-op", async () => {
        UserModel.getGoogleIdentityUsers.mockResolvedValue([]);
        const r = await runGoogleRetirementNotice({ send: true });
        expect(r).toMatchObject({ candidates: 0, cohort: 0, sent: 0 });
    });
});

describe("maskEmail", () => {
    test("keeps the domain, hides the local part", () => {
        expect(maskEmail("ada@example.org")).toBe("a**@example.org");
        expect(maskEmail("a@x.io")).toBe("a*@x.io");
    });
    test("malformed input does not throw or echo", () => {
        expect(maskEmail("not-an-email")).toBe("<malformed>");
    });
});

// The cohort count IS the cutover gate ("drive googleOnly to 0"), so a failed query must
// never look like an all-clear — that false 0 would authorise locking these members out.
describe("fails closed on a broken cohort query", () => {
    test("REGRESSION: query error propagates as 500, never as cohort:0", async () => {
        auth.mockResolvedValue({ user: { userID: "admin-1", role: "admin" } });
        UserModel.getGoogleIdentityUsers.mockRejectedValue(new Error("mongo down"));
        const res = await POST(req({ send: true }));
        expect(res.status).toBe(500);
        const body = await res.json();
        expect(body).not.toHaveProperty("cohort");
        expect(sendGoogleRetirementEmail).not.toHaveBeenCalled();
    });

    test("REGRESSION: the service surfaces the error rather than an empty summary", async () => {
        UserModel.getGoogleIdentityUsers.mockRejectedValue(new Error("mongo down"));
        await expect(runGoogleRetirementNotice({ send: true })).rejects.toThrow("mongo down");
    });
});

describe("stamp failure is not a send failure", () => {
    test("REGRESSION: delivered-but-unstamped is counted separately, not as failed", async () => {
        UserModel.getGoogleIdentityUsers.mockResolvedValue([googleOnly(1)]);
        UserModel.updateUser.mockRejectedValue(new Error("No user found to update."));
        const r = await runGoogleRetirementNotice({ send: true });
        expect(r.sent).toBe(1);
        expect(r.failed).toBe(0);
        expect(r.sentButUnstamped).toBe(1);
    });

    test("an SMTP failure is still left unstamped for retry", async () => {
        UserModel.getGoogleIdentityUsers.mockResolvedValue([googleOnly(1)]);
        sendGoogleRetirementEmail.mockRejectedValue(new Error("smtp down"));
        const r = await runGoogleRetirementNotice({ send: true });
        expect(r.failed).toBe(1);
        expect(r.sentButUnstamped).toBe(0);
        expect(UserModel.updateUser).not.toHaveBeenCalled();
    });
});

// A provider:'google' record whose googleId was never backfilled has no usable credential
// at all: already locked out, and invisible to the googleOnly rule. "cohort: 0" only means
// "nobody is locked out" if this is 0 too.
describe("stranded accounts are surfaced", () => {
    test("counts candidates with no usable sign-in method", async () => {
        UserModel.getGoogleIdentityUsers.mockResolvedValue([
            googleOnly(1),
            { userID: "u-9", provider: "google", googleId: "", discordId: "", password: "no password", email: "enc:stranded@example.org" },
        ]);
        const r = await runGoogleRetirementNotice({ send: false });
        expect(r.cohort).toBe(1);
        expect(r.strandedNoCredential).toBe(1);
    });
});

describe("abuse controls", () => {
    test("rate-limited -> 429 with Retry-After, nothing sent", async () => {
        auth.mockResolvedValue({ user: { userID: "admin-1", role: "admin" } });
        UserModel.getGoogleIdentityUsers.mockResolvedValue([googleOnly(1)]);
        rateLimit.mockReturnValue({ allowed: false, retryAfterMs: 60_000 });
        const res = await POST(req({ send: true, force: true }));
        expect(res.status).toBe(429);
        expect(res.headers.get("Retry-After")).toBe("60");
        expect(sendGoogleRetirementEmail).not.toHaveBeenCalled();
    });

    test("an over-long deadline is rejected before any send", async () => {
        auth.mockResolvedValue({ user: { userID: "admin-1", role: "admin" } });
        UserModel.getGoogleIdentityUsers.mockResolvedValue([googleOnly(1)]);
        const res = await POST(req({ send: true, deadline: "x".repeat(200) }));
        expect(res.status).toBe(400);
        expect(sendGoogleRetirementEmail).not.toHaveBeenCalled();
    });

    test("the admin action is audited before and after the run", async () => {
        auth.mockResolvedValue({ user: { userID: "admin-1", role: "admin" } });
        UserModel.getGoogleIdentityUsers.mockResolvedValue([googleOnly(1)]);
        await POST(req({ send: true }));
        const events = auditLog.mock.calls.map((c) => c[0]);
        expect(events).toContain("admin.google_retirement_notice.started");
        expect(events).toContain("admin.google_retirement_notice.completed");
        // never the recipient
        expect(JSON.stringify(auditLog.mock.calls)).not.toContain("user1@example.org");
    });
});
