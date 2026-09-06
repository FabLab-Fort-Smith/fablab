// Admin member↔Square service (AC-5): link/unlink a member's Square customer, drive subscription
// lifecycle (cancel/pause/resume/swap) on a member-owned subscription, and manage saved cards
// (list/disable) — all validated + audited.
//
// Security: subscription + card actions are scoped to the member's OWN linked Square customer — the
// target subscriptionId/cardId is verified to belong to that customer before any mutation (guards
// against acting on another customer's object via a wrong/typo'd id). PCI: cards expose only
// brand/last4/exp — never PAN. Reuses the dual-SDK wrappers in @/lib/square.

import UserService from "@/app/api/v1/users/service";
import {
  getSubscription, cancelSubscription, pauseSubscription, resumeSubscription, swapPlan,
  listCards, disableCard,
} from "@/lib/square";
import { auditLog } from "@/lib/audit";

export const SUBSCRIPTION_ACTIONS = Object.freeze(["cancel", "pause", "resume", "swap"]);

export class SquareMemberValidationError extends Error {
  constructor(message) { super(message); this.name = "SquareMemberValidationError"; this.status = 400; }
}
export class MemberNotFoundError extends Error {
  constructor(message = "member not found") { super(message); this.name = "MemberNotFoundError"; this.status = 404; }
}

/** The member's linked Square customer id (3 legacy storage locations, read with fallback). */
export function resolveCustomerId(member) {
  return member?.membership?.squareCustomerId || member?.squareCustomerId || member?.squareID || null;
}

async function loadMember(userID, actor) {
  const user = await UserService.getUserByQuery({ userID }, actor);
  if (!user || !user.userID) throw new MemberNotFoundError();
  return user;
}

/** Set/replace a member's Square customer id. */
export async function linkCustomer({ userID, squareCustomerId, actor } = {}) {
  if (typeof userID !== "string" || !userID.trim()) throw new SquareMemberValidationError("userID is required");
  if (typeof squareCustomerId !== "string" || !squareCustomerId.trim()) {
    throw new SquareMemberValidationError("squareCustomerId is required");
  }
  const before = await loadMember(userID, actor);
  await UserService.updateUser({ userID }, { membership: { squareCustomerId } }, actor);
  auditLog("admin.member.square.link", {
    actor: actor?.userID || "admin", target: userID, squareCustomerId,
    previous: resolveCustomerId(before), outcome: "success",
  });
  return { userID, squareCustomerId };
}

/** Clear a member's Square customer id (all three legacy fields). */
export async function unlinkCustomer({ userID, actor } = {}) {
  if (typeof userID !== "string" || !userID.trim()) throw new SquareMemberValidationError("userID is required");
  const before = await loadMember(userID, actor);
  const previous = resolveCustomerId(before);
  await UserService.updateUser({ userID }, { membership: { squareCustomerId: "" }, squareCustomerId: "", squareID: "" }, actor);
  auditLog("admin.member.square.unlink", { actor: actor?.userID || "admin", target: userID, previous, outcome: "success" });
  return { userID, unlinked: true, previous };
}

// Confirm the subscription belongs to the member's linked customer before mutating it.
async function ownedSubscription(userID, subscriptionId, actor) {
  const member = await loadMember(userID, actor);
  const customerId = resolveCustomerId(member);
  if (!customerId) throw new SquareMemberValidationError("member has no linked Square customer");
  const sub = (await getSubscription(subscriptionId))?.subscription;
  if (!sub) throw new SquareMemberValidationError("subscription not found");
  if (sub.customerId !== customerId) {
    throw new SquareMemberValidationError("subscription does not belong to this member");
  }
  return { member, customerId, sub };
}

/**
 * Drive a member's subscription lifecycle. action ∈ {cancel, pause, resume, swap}. swap requires
 * planVariationId. The subscription must belong to the member's linked customer.
 * @param {{userID:string, subscriptionId:string, action:string, planVariationId?:string, actor:object}} args
 */
export async function subscriptionAction({ userID, subscriptionId, action, planVariationId, actor } = {}) {
  if (typeof subscriptionId !== "string" || !subscriptionId.trim()) throw new SquareMemberValidationError("subscriptionId is required");
  if (!SUBSCRIPTION_ACTIONS.includes(action)) {
    throw new SquareMemberValidationError(`action must be one of: ${SUBSCRIPTION_ACTIONS.join(", ")}`);
  }
  if (action === "swap" && (typeof planVariationId !== "string" || !planVariationId.trim())) {
    throw new SquareMemberValidationError("planVariationId is required to swap plans");
  }

  await ownedSubscription(userID, subscriptionId, actor);

  let result;
  if (action === "cancel") result = await cancelSubscription(subscriptionId);
  else if (action === "pause") result = await pauseSubscription(subscriptionId);
  else if (action === "resume") result = await resumeSubscription(subscriptionId);
  else result = await swapPlan(subscriptionId, { newPlanVariationId: planVariationId });

  auditLog("admin.member.square.subscription", {
    actor: actor?.userID || "admin", target: userID, subscriptionId, action,
    ...(action === "swap" ? { planVariationId } : {}), outcome: "success",
  });
  return { userID, subscriptionId, action, subscription: result?.subscription ?? null };
}

// Non-sensitive card facts only (PCI SAQ-A) — never PAN.
function sanitizeCard(card) {
  return {
    id: card?.id || null,
    brand: card?.cardBrand || null,
    last4: card?.last4 || null,
    expMonth: card?.expMonth != null ? Number(card.expMonth) : null,
    expYear: card?.expYear != null ? Number(card.expYear) : null,
    enabled: card?.enabled !== false,
  };
}

/** List a member's saved cards (sanitized). Returns [] when the member has no linked customer. */
export async function listSavedCards({ userID, actor } = {}) {
  if (typeof userID !== "string" || !userID.trim()) throw new SquareMemberValidationError("userID is required");
  const member = await loadMember(userID, actor);
  const customerId = resolveCustomerId(member);
  if (!customerId) return { customerId: null, cards: [] };
  const res = await listCards({ customerId });
  return { customerId, cards: (res.cards || []).map(sanitizeCard) };
}

/** Disable one of a member's saved cards (verified to belong to the member's customer). */
export async function disableSavedCard({ userID, cardId, actor } = {}) {
  if (typeof userID !== "string" || !userID.trim()) throw new SquareMemberValidationError("userID is required");
  if (typeof cardId !== "string" || !cardId.trim()) throw new SquareMemberValidationError("cardId is required");
  const member = await loadMember(userID, actor);
  const customerId = resolveCustomerId(member);
  if (!customerId) throw new SquareMemberValidationError("member has no linked Square customer");
  const res = await listCards({ customerId });
  const owns = (res.cards || []).some((c) => c.id === cardId);
  if (!owns) throw new SquareMemberValidationError("card does not belong to this member");
  await disableCard(cardId);
  auditLog("admin.member.square.card.disable", { actor: actor?.userID || "admin", target: userID, cardId, outcome: "success" });
  return { userID, cardId, disabled: true };
}

const MemberSquareService = {
  linkCustomer, unlinkCustomer, subscriptionAction, listSavedCards, disableSavedCard,
  resolveCustomerId, SUBSCRIPTION_ACTIONS, SquareMemberValidationError, MemberNotFoundError,
};
export default MemberSquareService;
