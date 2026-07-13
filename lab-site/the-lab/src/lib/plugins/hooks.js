// Typed, in-process hook (event) bus for the plugin platform.
//
// The core app EMITS domain events at canonical transition sites; ENABLED
// plugins SUBSCRIBE to them in their register(ctx). This is how a plugin reacts
// to core state changes WITHOUT importing another feature's model (the bus is
// the mediator — see the-lab/CLAUDE.md §4). Handlers are best-effort and
// isolated: one throwing never breaks the emitter or a sibling handler.

import { auditLog } from "@/lib/audit";

/**
 * Canonical core events. Payloads carry IDs only — never PII. A plugin handler
 * fetches what it needs through its own published services.
 * @type {Readonly<Record<string,string>>}
 */
export const CORE_EVENTS = Object.freeze({
  MEMBER_REGISTERED: "member.registered", // { userID }
  MEMBERSHIP_ACTIVATED: "membership.activated", // { userID, type? }
  MEMBERSHIP_SUSPENDED: "membership.suspended", // { userID }
  MEMBER_DELETED: "member.deleted", // { userID }
});

const KNOWN_EVENTS = new Set(Object.values(CORE_EVENTS));

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
 * Emit an event to all subscribed plugins. Fire-and-forget semantics: every
 * handler runs, each wrapped so a failure is audited and isolated. Awaiting the
 * returned promise waits for all handlers to settle.
 * @param {string} event - one of CORE_EVENTS
 * @param {object} [payload] - IDs only, no PII
 * @returns {Promise<void>}
 */
export async function emitHook(event, payload = {}) {
  if (!KNOWN_EVENTS.has(event)) throw new Error(`Refusing to emit unknown event "${event}"`);
  const handlers = subscribers.get(event);
  if (!handlers || handlers.size === 0) return;
  await Promise.all(
    [...handlers.entries()].map(async ([pluginId, handler]) => {
      try {
        await handler(payload);
      } catch (err) {
        // A plugin handler failing must never break the core transaction.
        auditLog("plugin.hook.failed", {
          actor: { pluginId },
          target: event,
          outcome: "error",
          reason: err?.message || "handler error",
        });
      }
    })
  );
}

/** Test/boot helper: drop all subscriptions. */
export function _resetHooks() {
  subscribers.clear();
}
