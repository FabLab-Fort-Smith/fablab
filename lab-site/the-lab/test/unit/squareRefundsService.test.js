// AC-1 refunds service: full/partial validation against the captured amount, fresh idempotency key,
// PCI-safe (operates only by paymentId). Square adapter mocked.

jest.mock("@/lib/square", () => ({ __esModule: true, getPayment: jest.fn(), refundPayment: jest.fn() }));

import { refund, RefundValidationError } from "@/app/api/v1/square/refunds/service";
import { getPayment, refundPayment } from "@/lib/square";

beforeEach(() => {
  jest.clearAllMocks();
  getPayment.mockResolvedValue({ payment: { id: "p1", amountMoney: { amount: 4500, currency: "USD" } } });
  refundPayment.mockImplementation(async (body) => ({ refund: { id: "rf1", status: "PENDING", amountMoney: body.amountMoney } }));
});

test("full refund uses the captured amount + currency and a fresh idempotency key", async () => {
  const r = await refund({ paymentId: "p1" });
  expect(r).toMatchObject({ id: "rf1" });
  const body = refundPayment.mock.calls[0][0];
  expect(body.paymentId).toBe("p1");
  expect(body.amountMoney).toEqual({ amount: 4500, currency: "USD" });
  expect(typeof body.idempotencyKey).toBe("string");
  expect(body.idempotencyKey.length).toBeGreaterThan(10);
});

test("distinct idempotency keys across calls", async () => {
  await refund({ paymentId: "p1" });
  await refund({ paymentId: "p1" });
  expect(refundPayment.mock.calls[0][0].idempotencyKey).not.toBe(refundPayment.mock.calls[1][0].idempotencyKey);
});

test("partial refund within the captured amount is allowed", async () => {
  await refund({ paymentId: "p1", amountCents: 1000 });
  expect(refundPayment.mock.calls[0][0].amountMoney).toEqual({ amount: 1000, currency: "USD" });
});

test("reason is passed through, trimmed and length-capped", async () => {
  await refund({ paymentId: "p1", reason: "  duplicate charge  " });
  expect(refundPayment.mock.calls[0][0].reason).toBe("duplicate charge");
  await refund({ paymentId: "p1", reason: "x".repeat(500) });
  expect(refundPayment.mock.calls[1][0].reason.length).toBe(192);
});

test("rejects: missing paymentId, unknown payment, over-refund, bad amount — none call refundPayment", async () => {
  await expect(refund({})).rejects.toBeInstanceOf(RefundValidationError);
  getPayment.mockResolvedValueOnce({ payment: null });
  await expect(refund({ paymentId: "nope" })).rejects.toThrow(/not found/);
  await expect(refund({ paymentId: "p1", amountCents: 9999 })).rejects.toThrow(/exceeds/);
  await expect(refund({ paymentId: "p1", amountCents: 0 })).rejects.toThrow(/positive integer/);
  await expect(refund({ paymentId: "p1", amountCents: 12.5 })).rejects.toThrow(/positive integer/);
  expect(refundPayment).not.toHaveBeenCalled();
});

test("rejects a payment with no refundable amount", async () => {
  getPayment.mockResolvedValueOnce({ payment: { id: "p1", amountMoney: { amount: 0, currency: "USD" } } });
  await expect(refund({ paymentId: "p1" })).rejects.toThrow(/no refundable amount/);
});

test("enforces the REMAINING amount when the payment is partially refunded (F-1)", async () => {
  // $45 captured, $40 already refunded → only $5 remains.
  getPayment.mockResolvedValue({
    payment: { id: "p1", amountMoney: { amount: 4500, currency: "USD" }, refundedMoney: { amount: 4000, currency: "USD" } },
  });
  // Full refund refunds the remainder, not the captured total.
  await refund({ paymentId: "p1" });
  expect(refundPayment.mock.calls[0][0].amountMoney).toEqual({ amount: 500, currency: "USD" });
  // A partial over the remainder (but under captured) is rejected — closes the double-refund gap.
  await expect(refund({ paymentId: "p1", amountCents: 600 })).rejects.toThrow(/remaining/);
  // At-the-remainder partial is allowed.
  await refund({ paymentId: "p1", amountCents: 500 });
  expect(refundPayment.mock.calls[1][0].amountMoney).toEqual({ amount: 500, currency: "USD" });
});

test("rejects a payment already fully refunded (F-1)", async () => {
  getPayment.mockResolvedValueOnce({
    payment: { id: "p1", amountMoney: { amount: 4500, currency: "USD" }, refundedMoney: { amount: 4500, currency: "USD" } },
  });
  await expect(refund({ paymentId: "p1" })).rejects.toThrow(/already fully refunded/);
});
