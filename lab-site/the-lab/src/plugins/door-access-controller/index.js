// door-access-controller plugin entry. Exports the manifest + lifecycle callbacks
// the platform registry consumes. Policy is pure (policy.js); HTTP logic lives in
// controller.js/service.js; this file only wires hook subscriptions + the readiness
// gate. Design: docs/architecture/door-access-controller.md.

import manifest from "./plugin.manifest";
import Service from "./service";
import { CORE_EVENTS } from "@/lib/plugins/hooks";
import { accessControlReady } from "@/lib/access-control";
import { cardCryptoReady } from "./cardCrypto";

export { manifest };

/**
 * Readiness gate: the platform refuses to enable this plugin unless it can actually
 * reach a door (socket-server configured) AND protect card codes (both card keys set),
 * so an admin can't turn on a half-configured access system.
 * @returns {{ ok: boolean, reason?: string }}
 */
export function checkReady() {
  if (!accessControlReady()) return { ok: false, reason: "ACCESS_CONTROL_API_URL / SOCKET_API_SECRET not set" };
  if (!cardCryptoReady()) return { ok: false, reason: "DOOR_CARD_ENC_KEY / DOOR_CARD_INDEX_KEY not set" };
  return { ok: true };
}

/**
 * Wire hook subscriptions when the plugin is enabled. Handlers are best-effort
 * (the platform isolates + audits any throw).
 * @param {{ on: (event:string, handler:Function)=>void, audit: Function }} ctx
 */
export function register(ctx) {
  ctx.on(CORE_EVENTS.MEMBERSHIP_SUSPENDED, (payload) => Service.onMembershipSuspended(payload, ctx));
  ctx.on(CORE_EVENTS.MEMBER_DELETED, (payload) => Service.onMemberDeleted(payload, ctx));
}
