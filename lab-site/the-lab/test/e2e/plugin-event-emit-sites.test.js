// AD-3: prove the NEW emit sites honour the ADR-0013 payload contract at the
// point of emission — ID-only, no PII — even when PII (name/email/phone/message)
// is right there in scope. Also prove the emit is best-effort: a rejecting
// emitEvent never breaks the domain action (fail-closed dispatch).
//
// We mock the persistence layer + the plugin registry so this is hermetic (no
// DB, no network). CORE_EVENTS stays real so the event names are asserted true.

jest.mock("@/lib/plugins/registry", () => ({
  __esModule: true,
  emitEvent: jest.fn().mockResolvedValue(undefined),
}));

// Repairs PUT is now admin-gated (#213): mock the session so this emit-site test
// stays focused on the payload contract. Also keeps next-auth (ESM) out of the
// module graph.
jest.mock("@/auth", () => ({ __esModule: true, auth: jest.fn().mockResolvedValue({ user: { role: "admin", userID: "admin-1" } }) }));

// Contact route deps
jest.mock("@/app/api/v1/contact-submissions/model", () => ({
  __esModule: true,
  default: { createSubmission: jest.fn() },
}));
jest.mock("@/app/utils/email.util", () => ({
  __esModule: true,
  sendContactEmail: jest.fn().mockResolvedValue(undefined),
}));

// Repairs route deps — keep the real DTO/guard helpers (isValidRepairID,
// isValidStatus, sanitizeRepairUpdate) the hardened route imports; only the
// persistence methods are mocked.
jest.mock("@/app/api/v1/repairs/model", () => {
  const actual = jest.requireActual("@/app/api/v1/repairs/model");
  return { __esModule: true, ...actual, default: { createRepair: jest.fn(), updateRepair: jest.fn() } };
});

import { CORE_EVENTS } from "@/lib/plugins/hooks";
import { emitEvent } from "@/lib/plugins/registry";
import ContactSubmissionModel from "@/app/api/v1/contact-submissions/model";
import RepairModel from "@/app/api/v1/repairs/model";

// Values that must never leak into an event payload.
const PII = { name: "Ada Lovelace", email: "ada@example.com", phone: "555-1234", message: "hi there" };

function jsonReq(url, body) {
  return new Request(url, {
    method: "POST",
    headers: new Headers({ "content-type": "application/json" }),
    body: JSON.stringify(body),
  });
}

function assertNoPII(payload) {
  const serialized = JSON.stringify(payload);
  for (const v of Object.values(PII)) {
    expect(serialized).not.toContain(v);
  }
}

beforeEach(() => jest.clearAllMocks());

describe("contact.submitted emit site (POST /api/contact)", () => {
  test("emits ID-only payload — no name/email/message", async () => {
    ContactSubmissionModel.createSubmission.mockResolvedValue({ _id: "c1", ...PII });
    const { POST } = await import("@/app/api/contact/route");

    const res = await POST(jsonReq("http://localhost/api/contact", PII));
    expect(res.status).toBe(200);

    expect(emitEvent).toHaveBeenCalledWith(CORE_EVENTS.CONTACT_SUBMITTED, { submissionID: "c1" });
    assertNoPII(emitEvent.mock.calls[0][1]);
  });

  test("best-effort: a rejecting emit does not break the request (still 200)", async () => {
    ContactSubmissionModel.createSubmission.mockResolvedValue({ _id: "c2", ...PII });
    emitEvent.mockRejectedValueOnce(new Error("bus down"));
    const { POST } = await import("@/app/api/contact/route");

    const res = await POST(jsonReq("http://localhost/api/contact", PII));
    expect(res.status).toBe(200);
  });
});

describe("repair.created emit site (POST /api/v1/repairs)", () => {
  test("emits ID-only payload — no name/email/phone", async () => {
    RepairModel.createRepair.mockResolvedValue({ repairID: "repair-1", status: "pending", ...PII });
    const { POST } = await import("@/app/api/v1/repairs/route");

    const res = await POST(
      jsonReq("http://localhost/api/v1/repairs", { ...PII, deviceType: "laptop", issueDescription: "broken" })
    );
    expect(res.status).toBe(201);

    expect(emitEvent).toHaveBeenCalledWith(CORE_EVENTS.REPAIR_CREATED, { repairID: "repair-1" });
    assertNoPII(emitEvent.mock.calls[0][1]);
  });
});

describe("repair.updated emit site (PUT /api/v1/repairs)", () => {
  test("emits { repairID, status } — status is a non-PII enum, no PII", async () => {
    RepairModel.updateRepair.mockResolvedValue({ repairID: "repair-1", status: "completed", ...PII });
    const { PUT } = await import("@/app/api/v1/repairs/route");

    const VALID_ID = "repair-abcdef01-2345-6789-abcd-ef0123456789";
    const req = new Request(`http://localhost/api/v1/repairs?repairID=${VALID_ID}`, {
      method: "PUT",
      headers: new Headers({ "content-type": "application/json" }),
      body: JSON.stringify({ status: "completed" }),
    });
    const res = await PUT(req);
    expect(res.status).toBe(200);

    expect(emitEvent).toHaveBeenCalledWith(CORE_EVENTS.REPAIR_UPDATED, {
      repairID: "repair-1",
      status: "completed",
    });
    assertNoPII(emitEvent.mock.calls[0][1]);
  });
});
