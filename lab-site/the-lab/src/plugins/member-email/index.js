// member-email plugin entry. Exports the manifest + lifecycle callbacks the
// platform registry consumes. HTTP logic lives in controller.js/service.js;
// this file only wires the plugin's hook subscriptions.

import manifest from "./plugin.manifest";
import Service from "./service";
import { CORE_EVENTS } from "@/lib/plugins/hooks";
import { purelymailReady } from "@/lib/purelymail";

export { manifest };

/**
 * Readiness gate: the platform refuses to enable this plugin unless PurelyMail
 * is configured (token + domain), so an admin can't turn on a broken feature.
 * @returns {{ ok: boolean, reason?: string }}
 */
export function checkReady() {
  return purelymailReady()
    ? { ok: true }
    : { ok: false, reason: "PURELYMAIL_API_TOKEN / PURELYMAIL_DOMAIN not set" };
}

/**
 * Wire hook subscriptions when the plugin is enabled. Handlers are best-effort
 * (the platform isolates + audits any throw).
 * @param {{ on: (event:string, handler:Function)=>void }} ctx
 */
export function register(ctx) {
  ctx.on(CORE_EVENTS.MEMBER_DELETED, (payload) => Service.onMemberDeleted(payload));
  ctx.on(CORE_EVENTS.MEMBERSHIP_SUSPENDED, (payload) => Service.onMembershipSuspended(payload));
}
