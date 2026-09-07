// repair-notifications plugin entry (AD-5 pilot addon). Exports the manifest +
// lifecycle callbacks the platform registry consumes. Persistence lives in
// model.js and the notify behaviour in service.js; this file only wires the hook
// subscriptions + the readiness gate.

import manifest from "./plugin.manifest";
import Service from "./service";
import { CORE_EVENTS } from "@/lib/plugins/hooks";

export { manifest };

/**
 * Readiness gate: the platform refuses to enable this addon unless the app's mail
 * transport is configured (EMAIL_USER), so an admin can't turn on a notifier that
 * could never send. The recipient address itself is plain config, checked at send
 * time (a blank notifyTo simply no-ops).
 * @returns {{ ok: boolean, reason?: string }}
 */
export function checkReady() {
  return process.env.EMAIL_USER
    ? { ok: true }
    : { ok: false, reason: "EMAIL_USER not set (mail transport unconfigured)" };
}

/**
 * Wire hook subscriptions when the addon is enabled. Both handlers are best-effort:
 * the platform isolates + audits any throw, and the service itself fails closed.
 * @param {{ on: (event:string, handler:Function)=>void }} ctx
 */
export function register(ctx) {
  ctx.on(CORE_EVENTS.REPAIR_CREATED, (payload) => Service.onRepairEvent(payload));
  ctx.on(CORE_EVENTS.REPAIR_UPDATED, (payload) => Service.onRepairEvent(payload));
}
