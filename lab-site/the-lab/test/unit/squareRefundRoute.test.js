// AC-1 admin refund route: admin-gated, delegates to the service, audits, maps errors (bigint-safe body).

jest.mock("@/auth", () => ({ __esModule: true, auth: jest.fn() }));
jest.mock("@/app/api/v1/square/refunds/service", () => {
  class RefundValidationError extends Error { constructor(m) { super(m); this.name = "RefundValidationError"; this.status = 400; } }
  return { __esModule: true, refund: jest.fn(), RefundValidationError };
});
jest.mock("@/lib/audit", () => ({ __esModule: true, auditLog: jest.fn() }));
jest.mock("@/lib/square", () => ({ __esModule: true, squareErrorDetail: (e) => e && e.message, bigintReplacer: (k, v) => (typeof v === "bigint" ? v.toString() : v) }));

import { POST } from "@/app/api/v1/admin/square/refund/route";
import { auth } from "@/auth";
import { refund, RefundValidationError } from "@/app/api/v1/square/refunds/service";
import { auditLog } from "@/lib/audit";

const ADMIN = { user: { role: "admin", userID: "admin-1" } };
const post = (body) => POST(new Request("http://lab.test/api/v1/admin/square/refund", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
}));

beforeEach(() => { jest.clearAllMocks(); auth.mockResolvedValue(ADMIN); });

test("non-admin / no session → 401, service not called", async () => {
  auth.mockResolvedValueOnce(null);
  expect((await post({ paymentId: "p1" })).status).toBe(401);
  auth.mockResolvedValueOnce({ user: { role: "member", userID: "u2" } });
  expect((await post({ paymentId: "p1" })).status).toBe(401);
  expect(refund).not.toHaveBeenCalled();
});

test("missing paymentId → 400", async () => {
  expect((await post({})).status).toBe(400);
  expect(refund).not.toHaveBeenCalled();
});

test("valid → 200, delegates, audits, bigint amount serialized as string", async () => {
  refund.mockResolvedValueOnce({ id: "rf1", status: "PENDING", amountMoney: { amount: 4500n, currency: "USD" } });
  const res = await post({ paymentId: "p1", amountCents: 4500, reason: "dupe" });
  expect(res.status).toBe(200);
  const bodyText = await res.text();
  expect(bodyText).toContain('"amount":"4500"'); // bigint -> string, no serialization crash
  expect(refund).toHaveBeenCalledWith({ paymentId: "p1", amountCents: 4500, reason: "dupe" });
  expect(auditLog).toHaveBeenCalledWith("admin.square.refund", expect.objectContaining({ paymentId: "p1", outcome: "refunded", refundId: "rf1" }));
});

test("service validation error → 400 with message, audited rejected", async () => {
  refund.mockRejectedValueOnce(new RefundValidationError("refund amount exceeds the captured amount"));
  const res = await post({ paymentId: "p1", amountCents: 999999 });
  expect(res.status).toBe(400);
  expect((await res.json()).error).toMatch(/exceeds/);
  expect(auditLog).toHaveBeenCalledWith("admin.square.refund", expect.objectContaining({ outcome: "rejected" }));
});

test("unexpected Square error → 500, generic message (no leak), audited error", async () => {
  refund.mockRejectedValueOnce(new Error("Square 500 internal detail"));
  const res = await post({ paymentId: "p1" });
  expect(res.status).toBe(500);
  expect(await res.json()).toEqual({ error: "Refund failed" });
  expect(auditLog).toHaveBeenCalledWith("admin.square.refund", expect.objectContaining({ outcome: "error" }));
});
