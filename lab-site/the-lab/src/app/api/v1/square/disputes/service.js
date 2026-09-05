// Admin disputes service (AC-2, read-only). Lists Square disputes (chargebacks) and returns a single
// dispute's detail, both allow-listed for the admin UI.
//
// Read-only: no accept/evidence mutations in this slice. PCI (SAQ-A): disputes carry no card data beyond
// the non-sensitive `cardBrand`. Evidence is surfaced as ids/metadata only — never fetched/returned here.

import { listDisputes as sqListDisputes, getDispute } from "@/lib/square";

/** Not-found error the route maps to HTTP 404. */
export class DisputeNotFoundError extends Error {
  constructor(message = "dispute not found") {
    super(message);
    this.name = "DisputeNotFoundError";
    this.status = 404;
  }
}

function cents(money) {
  const n = money?.amount == null ? null : Number(money.amount);
  return Number.isFinite(n) ? n : null;
}

// Allow-listed dispute view — no whole-object passthrough (OWASP API3).
function shape(d) {
  return {
    id: d.disputeId || d.id || null,
    state: d.state || null,
    reason: d.reason || null,
    amountCents: cents(d.amountMoney),
    currency: d.amountMoney?.currency || "USD",
    cardBrand: d.cardBrand || null,
    paymentId: d.disputedPayment?.paymentId || null,
    dueAt: d.dueAt || null,
    reportedAt: d.reportedDate || d.reportedAt || null,
    createdAt: d.createdAt || null,
    updatedAt: d.updatedAt || null,
    locationId: d.locationId || null,
  };
}

/**
 * List disputes (most-recent first, as returned by Square).
 * @param {{cursor?:string, states?:string}} args optional cursor + comma/CSV state filter
 * @returns {Promise<{disputes:object[], cursor:(string|null)}>}
 */
export async function listDisputes({ cursor, states } = {}) {
  const res = await sqListDisputes({ cursor, states });
  return {
    disputes: (res.disputes || []).map(shape),
    cursor: res.cursor || null,
  };
}

/**
 * Fetch one dispute + its evidence ids (metadata only).
 * @param {string} disputeId
 * @returns {Promise<object>} allow-listed dispute detail
 * @throws {DisputeNotFoundError}
 */
export async function disputeDetail(disputeId) {
  if (typeof disputeId !== "string" || !disputeId.trim()) {
    throw new DisputeNotFoundError("disputeId is required");
  }
  const d = (await getDispute(disputeId))?.dispute;
  if (!d) throw new DisputeNotFoundError();
  return {
    ...shape(d),
    evidenceIds: Array.isArray(d.evidenceIds) ? d.evidenceIds : [],
  };
}

const DisputesService = { listDisputes, disputeDetail, DisputeNotFoundError };
export default DisputesService;
