// Recurring-dues revenue for the monthly funding meter (feat/funding-meter).
//
// Source of truth is Square's ACTIVE subscriptions, joined to catalog prices — not the
// users collection. A member record stores only `membership.planName` (a string, no price,
// no variation id), so counting members by plan name can't tell a $25/mo plan from a
// $250/yr plan that happens to share a name. A Square subscription carries its
// `planVariationId`, which maps to exactly one catalog price. So we count what Square is
// actually billing, and normalize annual plans to a monthly figure for the meter.

import PlansModel from "../plans/model";
import { searchSubscriptions } from "@/lib/square";

/** Normalize a catalog price to a monthly figure by cadence. */
function toMonthlyCents(priceCents, cadence) {
  if (priceCents == null) return null;
  switch ((cadence || "").toUpperCase()) {
    case "ANNUAL": return Math.round(priceCents / 12);
    case "EVERY_SIX_MONTHS": return Math.round(priceCents / 6);
    case "QUARTERLY": return Math.round(priceCents / 3);
    case "MONTHLY": return priceCents;
    case "WEEKLY": return Math.round(priceCents * 52 / 12);
    default: return priceCents; // unknown cadence: treat as monthly rather than drop it
  }
}

/**
 * Recurring dues revenue, normalized to a monthly figure.
 *
 * @returns {Promise<{
 *   duesCents: number,
 *   activeCount: number,
 *   byTier: Array<{ planName: string, variationName: string, cadence: string, count: number, unitCents: number, monthlyCents: number }>,
 *   unmatchedCount: number
 * }>}
 */
export async function getDuesRevenue() {
  // 1. Build a variationId -> price/label map from the catalog.
  const plans = await PlansModel.getPlans();
  const byVariation = new Map();
  for (const plan of plans) {
    for (const v of plan.variations || []) {
      byVariation.set(v.id, {
        planName: plan.name,
        variationName: v.name,
        cadence: v.cadence,
        unitCents: v.priceCents,
        monthlyCents: toMonthlyCents(v.priceCents, v.cadence),
      });
    }
  }

  // 2. Pull ACTIVE subscriptions from Square (paged).
  const subscriptions = [];
  let cursor;
  do {
    const res = await searchSubscriptions({
      cursor,
      query: { filter: { statuses: ["ACTIVE"] } },
      limit: 200,
    });
    subscriptions.push(...(res.subscriptions || []));
    cursor = res.cursor;
  } while (cursor);

  // 3. Sum by tier. A subscription whose variation we can't price (RELATIVE with no
  //    resolvable template, or a since-deleted plan) is counted but not summed — reported
  //    as unmatched so the total is honest rather than silently low.
  const tiers = new Map();
  let duesCents = 0;
  let unmatchedCount = 0;

  for (const sub of subscriptions) {
    const info = byVariation.get(sub.planVariationId);
    if (!info || info.monthlyCents == null) { unmatchedCount++; continue; }

    duesCents += info.monthlyCents;
    const key = sub.planVariationId;
    const row = tiers.get(key) || {
      planName: info.planName, variationName: info.variationName,
      cadence: info.cadence, count: 0, unitCents: info.unitCents, monthlyCents: 0,
    };
    row.count += 1;
    row.monthlyCents += info.monthlyCents;
    tiers.set(key, row);
  }

  const byTier = [...tiers.values()].sort((a, b) => b.monthlyCents - a.monthlyCents);
  return {
    duesCents,
    activeCount: subscriptions.length,
    byTier,
    unmatchedCount,
  };
}
