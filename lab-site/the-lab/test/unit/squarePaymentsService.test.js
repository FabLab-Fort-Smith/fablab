// AC-2 payment-detail service: allow-listed sanitized shape (PCI: no PAN/SAD leak), refundable math,
// bigint-safe amounts, not-found. Square adapter mocked.

jest.mock("@/lib/square", () => ({ __esModule: true, getPayment: jest.fn() }));

import { paymentDetail, PaymentNotFoundError } from "@/app/api/v1/square/payments/service";
import { getPayment } from "@/lib/square";

const basePayment = {
  id: "p1",
  status: "COMPLETED",
  sourceType: "CARD",
  createdAt: "2026-09-01T00:00:00Z",
  amountMoney: { amount: 4500, currency: "USD" },
  refundedMoney: { amount: 1000, currency: "USD" },
  processingFee: [{ amountMoney: { amount: 133, currency: "USD" } }],
  receiptUrl: "https://squareup.com/receipt/x",
  cardDetails: { entryMethod: "KEYED", status: "CAPTURED", card: { cardBrand: "VISA", last4: "1111", expMonth: 12, expYear: 2030 } },
};

beforeEach(() => { jest.clearAllMocks(); getPayment.mockResolvedValue({ payment: basePayment }); });

test("returns an allow-listed sanitized detail with refundable = captured - refunded", async () => {
  const d = await paymentDetail("p1");
  expect(d).toMatchObject({
    id: "p1", status: "COMPLETED", amountCents: 4500, refundedCents: 1000, refundableCents: 3500,
    currency: "USD", processingFeeCents: 133,
    card: { brand: "VISA", last4: "1111", expMonth: 12, expYear: 2030, entryMethod: "KEYED" },
  });
});

test("card sanitizer surfaces ONLY brand/last4/exp — never PAN/SAD even if present (PCI)", async () => {
  getPayment.mockResolvedValueOnce({ payment: {
    ...basePayment,
    cardDetails: { card: { cardBrand: "VISA", last4: "4242", expMonth: 1, expYear: 2031, pan: "4242424242424242", cvv: "123", billingAddress: { postalCode: "72901" } } },
  }});
  const d = await paymentDetail("p1");
  const blob = JSON.stringify(d);
  expect(blob).not.toContain("4242424242424242");
  expect(blob).not.toContain("123"); // cvv
  expect(blob).not.toContain("72901");
  expect(d.card).toEqual({ brand: "VISA", last4: "4242", expMonth: 1, expYear: 2031, entryMethod: null, status: null });
});

test("does not pass through unknown/sensitive top-level fields (allow-list, API3)", async () => {
  getPayment.mockResolvedValueOnce({ payment: { ...basePayment, buyerEmailAddress: "buyer@x.com", deviceDetails: { deviceId: "d1" } } });
  const d = await paymentDetail("p1");
  expect(d).not.toHaveProperty("buyerEmailAddress");
  expect(d).not.toHaveProperty("deviceDetails");
  expect(JSON.stringify(d)).not.toContain("buyer@x.com");
});

test("bigint amounts (v44) are coerced to numbers", async () => {
  getPayment.mockResolvedValueOnce({ payment: { ...basePayment, amountMoney: { amount: 4500n, currency: "USD" }, refundedMoney: { amount: 0n, currency: "USD" } } });
  const d = await paymentDetail("p1");
  expect(d.amountCents).toBe(4500);
  expect(d.refundedCents).toBe(0);
  expect(d.refundableCents).toBe(4500);
});

test("no card details → card null; missing refundedMoney → 0", async () => {
  getPayment.mockResolvedValueOnce({ payment: { id: "p2", amountMoney: { amount: 500, currency: "USD" } } });
  const d = await paymentDetail("p2");
  expect(d.card).toBeNull();
  expect(d.refundedCents).toBe(0);
  expect(d.refundableCents).toBe(500);
});

test("blank id or unknown payment → PaymentNotFoundError (status 404)", async () => {
  await expect(paymentDetail("")).rejects.toBeInstanceOf(PaymentNotFoundError);
  getPayment.mockResolvedValueOnce({ payment: null });
  const err = await paymentDetail("nope").catch((e) => e);
  expect(err).toBeInstanceOf(PaymentNotFoundError);
  expect(err.status).toBe(404);
});
