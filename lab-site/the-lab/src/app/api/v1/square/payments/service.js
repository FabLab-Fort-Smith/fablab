// Admin payment-detail service (AC-2, read-only). Fetches one Square payment and returns an
// allow-listed, sanitized view for the admin transactions drawer.
//
// PCI (SAQ-A): card data is NEVER touched beyond the non-sensitive brand / last-4 / expiry that Square
// itself returns — no PAN, no CVV/track/SAD. The returned object is an explicit allow-list (OWASP API3:
// no whole-payment passthrough), so new sensitive Square fields don't leak by default.

import { getPayment } from "@/lib/square";

/** A validation/not-found error the route maps to HTTP 404. */
export class PaymentNotFoundError extends Error {
  constructor(message = "payment not found") {
    super(message);
    this.name = "PaymentNotFoundError";
    this.status = 404;
  }
}

// Minor units as a Number (bigint under v44), or null. Safe for real cent amounts (well under 2^53).
function cents(money) {
  const n = money?.amount == null ? null : Number(money.amount);
  return Number.isFinite(n) ? n : null;
}

// Non-sensitive card facts only. Square's `cardDetails.card` exposes brand/last4/exp — never PAN/CVV.
function sanitizeCard(cardDetails) {
  const card = cardDetails?.card;
  if (!card && !cardDetails) return null;
  return {
    brand: card?.cardBrand || null,
    last4: card?.last4 || null,
    expMonth: card?.expMonth != null ? Number(card.expMonth) : null,
    expYear: card?.expYear != null ? Number(card.expYear) : null,
    entryMethod: cardDetails?.entryMethod || null,
    status: cardDetails?.status || null,
  };
}

/**
 * Fetch + sanitize a single payment for the admin detail drawer.
 * @param {string} paymentId
 * @returns {Promise<object>} allow-listed payment detail
 * @throws {PaymentNotFoundError} when the id is blank or Square returns no payment
 */
export async function paymentDetail(paymentId) {
  if (typeof paymentId !== "string" || !paymentId.trim()) {
    throw new PaymentNotFoundError("paymentId is required");
  }

  const pay = (await getPayment(paymentId))?.payment;
  if (!pay) throw new PaymentNotFoundError();

  const captured = cents(pay.amountMoney);
  const refunded = cents(pay.refundedMoney) || 0;

  return {
    id: pay.id,
    status: pay.status || null,
    sourceType: pay.sourceType || null,
    createdAt: pay.createdAt || null,
    updatedAt: pay.updatedAt || null,
    currency: pay.amountMoney?.currency || "USD",
    amountCents: captured,
    refundedCents: refunded,
    refundableCents: captured == null ? null : Math.max(0, captured - refunded),
    approvedCents: cents(pay.approvedMoney),
    tipCents: cents(pay.tipMoney),
    processingFeeCents: Array.isArray(pay.processingFee)
      ? pay.processingFee.reduce((sum, f) => sum + (cents(f.amountMoney) || 0), 0)
      : null,
    note: pay.note || null,
    receiptUrl: pay.receiptUrl || null,
    receiptNumber: pay.receiptNumber || null,
    orderId: pay.orderId || null,
    locationId: pay.locationId || null,
    customerId: pay.customerId || null,
    refundIds: Array.isArray(pay.refundIds) ? pay.refundIds : [],
    card: sanitizeCard(pay.cardDetails),
  };
}

const PaymentsService = { paymentDetail, PaymentNotFoundError };
export default PaymentsService;
