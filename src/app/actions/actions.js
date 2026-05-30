"use server";

import { createPayment } from "@/lib/square";
import { randomUUID } from "crypto";

// Ensure BigInt can be serialized in JSON responses.
// NOTE: this global monkeypatch is slated for removal in P2 (square v44) in
// favour of explicit bigint→string conversion at response boundaries
// (see docs/migrations/square-v44-migration.md, inventory correction #3).
// Kept as-is for P1 to preserve behaviour while only the SDK call moves to the adapter.
BigInt.prototype.toJSON = function () {
  return this.toString();
};

/**
 * Processes a payment with Square's Payments API
 * @param {string} sourceId - The tokenized payment method
 * @param {number} amount - The amount to charge in cents
 * @param {string} currency - The currency code (e.g., USD)
 * @returns {Promise<object>} - Square payment response
 */
export async function submitPayment(sourceId, amount, currency = "USD") {
  try {
    console.log("🔹 Processing Payment...");

    const result = await createPayment({
      idempotencyKey: randomUUID(),
      sourceId,
      amountMoney: {
        currency,
        amount,
      },
    });

    console.log("✅ Payment Success:", result);
    return { success: true, data: result };
  } catch (error) {
    console.error("❌ Payment Failed:", error);
    return { success: false, error: error.message };
  }
}
