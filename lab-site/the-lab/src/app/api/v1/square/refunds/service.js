// Admin refund service (AC-1). Refund a captured Square payment — full or partial — from the admin UI.
//
// PCI (SAQ-A): this never touches card data — it operates purely by Square `paymentId`. The caller
// (route) enforces admin authorization + audits; this validates the amount against the captured total
// and issues the refund with a fresh idempotency key. Amounts are minor units (cents); Square returns
// bigint amounts under the v44 SDK, so callers serialize with `bigintReplacer`.

import { v4 as uuidv4 } from "uuid";
import { getPayment, refundPayment } from "@/lib/square";

/** A validation error the route maps to HTTP 400. */
export class RefundValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "RefundValidationError";
    this.status = 400;
  }
}

/**
 * Refund a payment. Omit `amountCents` for a FULL refund (uses the payment's captured amount); pass a
 * positive integer ≤ the captured amount for a PARTIAL refund. Returns the Square refund object.
 * @param {{paymentId:string, amountCents?:number, reason?:string}} args
 * @returns {Promise<object>} the created refund
 */
export async function refund({ paymentId, amountCents, reason } = {}) {
  if (typeof paymentId !== "string" || !paymentId.trim()) {
    throw new RefundValidationError("paymentId is required");
  }

  const pay = (await getPayment(paymentId))?.payment;
  if (!pay) throw new RefundValidationError("payment not found");

  // Captured amount + currency come from the payment (never trusted from the client).
  const captured = Number(pay.amountMoney?.amount);
  const currency = pay.amountMoney?.currency || "USD";
  if (!Number.isFinite(captured) || captured <= 0) {
    throw new RefundValidationError("payment has no refundable amount");
  }
  // Enforce against the REMAINING refundable amount, not the full captured total — Square records prior
  // refunds on the payment (`refundedMoney`), so a repeated partial can't stack past what was paid
  // (SEC #180 F-1). A full refund refunds exactly the remainder.
  const alreadyRefunded = Number(pay.refundedMoney?.amount) || 0;
  const remaining = captured - alreadyRefunded;
  if (remaining <= 0) throw new RefundValidationError("payment is already fully refunded");

  let amount;
  if (amountCents === undefined || amountCents === null) {
    amount = remaining; // full refund = whatever is left
  } else {
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      throw new RefundValidationError("amountCents must be a positive integer (minor units)");
    }
    if (amountCents > remaining) {
      throw new RefundValidationError("refund amount exceeds the remaining refundable amount");
    }
    amount = amountCents;
  }

  const body = {
    idempotencyKey: uuidv4(),
    paymentId,
    amountMoney: { amount, currency },
  };
  if (typeof reason === "string" && reason.trim()) body.reason = reason.trim().slice(0, 192);

  const res = await refundPayment(body);
  return res?.refund ?? res;
}

const RefundsService = { refund, RefundValidationError };
export default RefundsService;
