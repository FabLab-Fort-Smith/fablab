// AC-2 admin payment-detail route: admin-gated, delegates to the service, audits, maps 404/500,
// bigint-safe body.

jest.mock("@/auth", () => ({ __esModule: true, auth: jest.fn() }));
jest.mock("@/app/api/v1/square/payments/service", () => {
  class PaymentNotFoundError extends Error { constructor(m = "payment not found") { super(m); this.name = "PaymentNotFoundError"; this.status = 404; } }
  return { __esModule: true, paymentDetail: jest.fn(), PaymentNotFoundError };
});
jest.mock("@/lib/audit", () => ({ __esModule: true, auditLog: jest.fn() }));
jest.mock("@/lib/square", () => ({ __esModule: true, squareErrorDetail: (e) => e && e.message, bigintReplacer: (k, v) => (typeof v === "bigint" ? v.toString() : v) }));

import { GET } from "@/app/api/v1/admin/square/payment/[paymentId]/route";
import { auth } from "@/auth";
import { paymentDetail, PaymentNotFoundError } from "@/app/api/v1/square/payments/service";
import { auditLog } from "@/lib/audit";

const ADMIN = { user: { role: "admin", userID: "admin-1" } };
const get = (paymentId) => GET(new Request("http://lab.test/api/v1/admin/square/payment/" + paymentId), { params: { paymentId } });

beforeEach(() => { jest.clearAllMocks(); auth.mockResolvedValue(ADMIN); });

test("non-admin / no session → 401, service not called", async () => {
  auth.mockResolvedValueOnce(null);
  expect((await get("p1")).status).toBe(401);
  auth.mockResolvedValueOnce({ user: { role: "member" } });
  expect((await get("p1")).status).toBe(401);
  expect(paymentDetail).not.toHaveBeenCalled();
});

test("valid → 200, audits view, bigint amount serialized as string", async () => {
  paymentDetail.mockResolvedValueOnce({ id: "p1", amountCents: 4500n, card: { brand: "VISA", last4: "1111" } });
  const res = await get("p1");
  expect(res.status).toBe(200);
  expect(await res.text()).toContain('"amountCents":"4500"');
  expect(auditLog).toHaveBeenCalledWith("admin.square.payment.view", expect.objectContaining({ paymentId: "p1", outcome: "ok" }));
});

test("not found → 404 with message", async () => {
  paymentDetail.mockRejectedValueOnce(new PaymentNotFoundError());
  const res = await get("nope");
  expect(res.status).toBe(404);
  expect((await res.json()).error).toMatch(/not found/);
});

test("unexpected error → 500 generic (no leak)", async () => {
  paymentDetail.mockRejectedValueOnce(new Error("Square internal detail"));
  const res = await get("p1");
  expect(res.status).toBe(500);
  expect(await res.json()).toEqual({ error: "Failed to load payment" });
});
