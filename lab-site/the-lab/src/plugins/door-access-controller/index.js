// door-access-controller plugin entry. Exports the manifest + lifecycle callbacks
// the platform registry consumes. Policy is pure (policy.js); HTTP logic lives in
// controller.js/service.js; this file only wires hook subscriptions + the readiness
// gate. Design: docs/architecture/door-access-controller.md.

import manifest from "./plugin.manifest";
import Service from "./service";
import { CORE_EVENTS } from "@/lib/plugins/hooks";
import { accessControlReady } from "@/lib/access-control";

export { manifest };

/**
 * Readiness gate: the platform refuses to enable this plugin unless the VPS
 * socket-server is configured (URL + control secret), so an admin can't turn on a
 * feature that can't reach any door.
 * @returns {{ ok: boolean, reason?: string }}
 */
export function checkReady() {
  return accessControlReady()
    ? { ok: true }
    : { ok: false, reason: "ACCESS_CONTROL_API_URL / SOCKET_API_SECRET not set" };
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
