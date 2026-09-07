// Typed, in-process hook (event) bus for the plugin platform.
//
// The core app EMITS domain events at canonical transition sites; ENABLED
// plugins SUBSCRIBE to them in their register(ctx). This is how a plugin reacts
// to core state changes WITHOUT importing another feature's model (the bus is
// the mediator — see the-lab/CLAUDE.md §4). Handlers are best-effort and
// isolated: one throwing never breaks the emitter or a sibling handler.

import { auditLog } from "@/lib/audit";

/**
 * Canonical core events an enabled plugin may subscribe to (ADR 0013 catalog).
 *
 * INVARIANTS (never relax — see the-lab/CLAUDE.md §4 and the plugin-platform doc):
 * - **ID-only payloads.** A payload carries entity IDs and non-PII enum/scalar
 *   fields ONLY — never emails, names, phone numbers, messages, tokens, secrets,
 *   or whole domain objects. A handler re-fetches what it needs through its own
 *   published services. This keeps PII out of the in-process bus, out of plugin
 *   reach, and out of the audit log if a handler fails.
 * - **Static + typed.** The set is frozen here; core code emits only these names
 *   (emitHook/emitEvent refuse an unknown event) and a plugin may only subscribe
 *   to a known one (onHook refuses an unknown event). No dynamic event names.
 *
 * Payload shapes (the trailing comment is the documented contract):
 *   member.registered       { userID }                       new member account created
 *   member.updated          { userID }                       a member's profile/record changed
 *   membership.activated     { userID, type? }               membership moved to active
 *   membership.suspended     { userID }                      membership suspended/cancelled
 *   member.deleted           { userID }                      member account deleted
 *   checkin.created          { userID }                      a member checked in to the lab
 *   bounty.created           { bountyID }                    a bounty was created
 *   bounty.updated           { bountyID, status }            a bounty's lifecycle status changed
 *   payment.succeeded        { paymentID, subscriptionID? }  a Square payment completed
 *   contact.submitted        { submissionID }                a public contact form was submitted
 *   repair.created           { repairID }                    a repair request was submitted
 *   repair.updated           { repairID, status }            a repair request's status changed
 *   announcement.published    { announcementID }             an announcement went live
 *
 * @type {Readonly<Record<string,string>>}
 */
export const CORE_EVENTS = Object.freeze({
  // Member / membership lifecycle
  MEMBER_REGISTERED: "member.registered", // { userID }
  MEMBER_UPDATED: "member.updated", // { userID }
  MEMBERSHIP_ACTIVATED: "membership.activated", // { userID, type? }
  MEMBERSHIP_SUSPENDED: "membership.suspended", // { userID }
  MEMBER_DELETED: "member.deleted", // { userID }
  // Presence
  CHECKIN_CREATED: "checkin.created", // { userID }
  // Bounties
  BOUNTY_CREATED: "bounty.created", // { bountyID }
  BOUNTY_UPDATED: "bounty.updated", // { bountyID, status }
  // Payments (Square)
  PAYMENT_SUCCEEDED: "payment.succeeded", // { paymentID, subscriptionID? }
  // Public intake
  CONTACT_SUBMITTED: "contact.submitted", // { submissionID }
  REPAIR_CREATED: "repair.created", // { repairID }
  REPAIR_UPDATED: "repair.updated", // { repairID, status }
  // Communications
  ANNOUNCEMENT_PUBLISHED: "announcement.published", // { announcementID }
});

const KNOWN_EVENTS = new Set(Object.values(CORE_EVENTS));

/**
 * Per-handler dispatch bound (ms). A single vetted-but-slow/hanging subscriber
 * must not add unbounded latency to the awaited domain action that emitted the
 * event — the payment webhook path (Square times out ~10s) especially. When a
 * handler exceeds this bound the emitter audits it (shape-only) and moves on,
 * exactly like the existing throw/reject isolation; the detached handler promise
 * is left to settle on its own and its outcome ignored. Sibling handlers and the
 * emitter are therefore bounded by this value, not by an arbitrary plugin.
 * (#210, CWE-405-adjacent — see @rules/topic-reliability.md.)
 * @type {number}
 */
export const HOOK_HANDLER_TIMEOUT_MS = 2000;

/** Unique sentinel so a handler that resolves with `undefined` isn't mistaken for a timeout. */
const TIMED_OUT = Symbol("hook-handler-timeout");

/** event -> Map<pluginId, handler>. Keyed by plugin so disable can unbind cleanly. */
const subscribers = new Map();

/**
 * Subscribe a plugin's handler to an event. Called from a plugin's register(ctx)
 * via ctx.on(). Re-subscribing the same plugin to the same event replaces it.
 * @param {string} event
 * @param {string} pluginId
 * @param {(payload:object)=>(void|Promise<void>)} handler
 */
export function onHook(event, pluginId, handler) {
  if (!KNOWN_EVENTS.has(event)) {
    throw new Error(`Unknown hook event "${event}" (plugin "${pluginId}")`);
  }
  if (typeof handler !== "function") {
    throw new Error(`Hook handler for "${event}" must be a function (plugin "${pluginId}")`);
  }
  if (!subscribers.has(event)) subscribers.set(event, new Map());
  subscribers.get(event).set(pluginId, handler);
}

/**
 * Remove every subscription registered by a plugin (called on disable).
 * @param {string} pluginId
 */
export function offPlugin(pluginId) {
  for (const handlers of subscribers.values()) handlers.delete(pluginId);
}

/**
 * Dispatch one plugin handler under the per-handler bound. Never rejects: a
 * throw, an async rejection, and a timeout are each isolated and audited
 * (shape-only — pluginId + event, never the payload) so one plugin can neither
 * break nor stall the emitter or a sibling.
 * @param {string} pluginId
 * @param {(payload:object)=>(void|Promise<void>)} handler
 * @param {string} event
 * @param {object} payload
 * @returns {Promise<void>}
 */
async function dispatchBounded(pluginId, handler, event, payload) {
  // Invoke inside an async IIFE so a *synchronous* throw becomes a rejection,
  // giving throw and async-reject one uniform path.
  const handlerPromise = (async () => handler(payload))();
  // Detach: if the handler settles AFTER we've timed out, its (possible)
  // rejection must not surface as an unhandledRejection.
  handlerPromise.catch(() => {});

  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), HOOK_HANDLER_TIMEOUT_MS);
  });

  try {
    // Map the handler branch to a settled outcome so it wins the race on
    // success OR failure (only a real hang lets the timeout win).
    const outcome = await Promise.race([
      handlerPromise.then(
        () => null,
        (err) => ({ error: err })
      ),
      timeout,
    ]);

    if (outcome === TIMED_OUT) {
      // A vetted handler that exceeded the bound: audit and move on. The core
      // transaction (e.g. the payment webhook) is not held past the bound.
      auditLog("plugin.hook.timeout", {
        actor: { pluginId },
        target: event,
        outcome: "timeout",
        reason: `handler exceeded ${HOOK_HANDLER_TIMEOUT_MS}ms`,
      });
    } else if (outcome && outcome.error) {
      // A plugin handler failing must never break the core transaction.
      auditLog("plugin.hook.failed", {
        actor: { pluginId },
        target: event,
        outcome: "error",
        reason: outcome.error?.message || "handler error",
      });
    }
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Emit an event to all subscribed plugins. Fire-and-forget semantics: every
 * handler runs, each wrapped so a failure OR a timeout is audited and isolated.
 * Awaiting the returned promise waits for all handlers to settle OR hit the
 * per-handler bound (HOOK_HANDLER_TIMEOUT_MS) — whichever comes first — so a
 * slow/hanging vetted plugin cannot add latency to the emitting domain action.
 * @param {string} event - one of CORE_EVENTS
 * @param {object} [payload] - IDs only, no PII
 * @returns {Promise<void>}
 */
export async function emitHook(event, payload = {}) {
  if (!KNOWN_EVENTS.has(event)) throw new Error(`Refusing to emit unknown event "${event}"`);
  const handlers = subscribers.get(event);
  if (!handlers || handlers.size === 0) return;
  await Promise.all(
    [...handlers.entries()].map(([pluginId, handler]) =>
      dispatchBounded(pluginId, handler, event, payload)
    )
  );
}

/** Test/boot helper: drop all subscriptions. */
export function _resetHooks() {
  subscribers.clear();
}
