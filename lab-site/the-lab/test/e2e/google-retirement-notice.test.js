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

import { POST } from "@/app/api/v1/admin/google-retirement-notice/route";
import { runGoogleRetirementNotice, maskEmail } from "@/app/api/v1/admin/google-retirement-notice/service";
import { auth } from "@/auth";
import UserModel from "@/app/api/v1/users/model";
import { sendGoogleRetirementEmail } from "@/app/utils/email.util";

const googleOnly = (n) => ({
    userID: `u-${n}`, googleId: `g-${n}`, discordId: "", password: "no password",
    email: `enc:user${n}@example.org`, firstName: `User${n}`,
});
const req = (body) => ({ json: async () => body });

beforeEach(() => {
    jest.clearAllMocks();
    UserModel.updateUser.mockResolvedValue({});
    sendGoogleRetirementEmail.mockResolvedValue();
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
