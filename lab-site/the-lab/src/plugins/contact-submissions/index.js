// contact-submissions plugin entry (AD-4 pilot addon). Exports the manifest +
// lifecycle callbacks the platform registry consumes. Persistence lives in
// model.js and the forward behaviour in service.js; this file only wires the hook
// subscription + the readiness gate.

import manifest from "./plugin.manifest";
import Service from "./service";
import { CORE_EVENTS } from "@/lib/plugins/hooks";

export { manifest };

/**
 * Readiness gate: the platform refuses to enable this addon unless the app's mail
 * transport is configured (EMAIL_USER), so an admin can't turn on a forwarder that
 * could never send. The routing address itself is plain config, checked at send
 * time (a blank forwardTo simply no-ops).
 * @returns {{ ok: boolean, reason?: string }}
 */
export function checkReady() {
  return process.env.EMAIL_USER
    ? { ok: true }
    : { ok: false, reason: "EMAIL_USER not set (mail transport unconfigured)" };
}

/**
 * Wire hook subscriptions when the addon is enabled. The handler is best-effort:
 * the platform isolates + audits any throw, and the service itself fails closed.
 * @param {{ on: (event:string, handler:Function)=>void }} ctx
 */
export function register(ctx) {
  ctx.on(CORE_EVENTS.CONTACT_SUBMITTED, (payload) => Service.onContactSubmitted(payload));
}
