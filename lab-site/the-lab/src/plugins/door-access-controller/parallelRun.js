// Strangler migration helper: shadow-run the addon policy alongside the LIVE
// internal/check-access, and (only once an admin flips the `authoritative` cutover
// flag) let the addon become authoritative.
//
// It evaluates policy against the user the LIVE path ALREADY resolved by card lookup —
// NOT a fresh addon card lookup — so this compares the POLICY decision (the thing being
// migrated) in isolation from the card-store migration (enrollment is a separate slice).
//
// Contract: this NEVER throws and NEVER mutates the live decision. Any internal error is
// swallowed + audited, and the caller falls back to the live path.

import Model from "./model";
import { factsFromUser } from "./facts";
import { decide } from "./policy";
import { resolveConfig, PLUGIN_ID } from "./config";
import { getPlugin } from "@/lib/plugins/registry";
import PluginStateModel from "@/lib/plugins/model";
import { auditLog } from "@/lib/audit";

/** Is the addon enabled? Reads DB state (durable, cross-instance); fails closed. */
async function addonEnabled() {
  try {
    const entry = getPlugin(PLUGIN_ID);
    if (!entry) return false;
    const st = await PluginStateModel.getState(PLUGIN_ID);
    return st ? st.enabled : !!entry.manifest.enabledByDefault;
  } catch {
    return false;
  }
}

/**
 * Shadow-evaluate the addon policy for an already-resolved user, compare to the live
 * grant, log the outcome, and report whether the addon should now be authoritative.
 *
 * @param {{ user:object|null, doorId:string, credentialType?:("nfc"|"qr"|"app"),
 *           liveGranted:boolean, now?:Date, source?:string }} input
 * @returns {Promise<{ran:boolean, authoritative?:boolean, granted?:boolean, reason?:string}>}
 */
export async function shadowCompare({ user, doorId, credentialType = "nfc", liveGranted, now = new Date(), source }) {
  try {
    if (!(await addonEnabled())) return { ran: false };

    const cfg = await resolveConfig();
    const facts = factsFromUser(user);
    let decision;
    if (!facts) {
      decision = { granted: false, reason: "unknown-user" };
    } else {
      const policyDoc = await Model.getPolicyDoc();
      const policy = {
        rules: policyDoc.rules || [],
        accountOverrides: policyDoc.accountOverrides || {},
        requireGoodStanding: cfg.requireGoodStanding,
        allowAdminBypass: cfg.allowAdminBypass,
        defaultTimezone: cfg.defaultTimezone,
      };
      const door = (await Model.findDoor(doorId)) || { doorId };
      decision = decide({ facts, door, credentialType, now, policy });
    }

    const diverged = Boolean(liveGranted) !== Boolean(decision.granted);
    auditLog("door-access.shadow", {
      actor: { pluginId: PLUGIN_ID },
      target: doorId,
      outcome: diverged ? "diverged" : "agree",
      live: Boolean(liveGranted),
      addon: Boolean(decision.granted),
      reason: decision.reason,
      user: user && user.userID,
      credentialType,
      source,
    });

    return { ran: true, authoritative: cfg.authoritative === true, granted: decision.granted, reason: decision.reason };
  } catch (e) {
    // Shadow must never break the live path.
    try {
      auditLog("door-access.shadow", { actor: { pluginId: PLUGIN_ID }, outcome: "error", reason: String((e && e.message) || e) });
    } catch {
      /* audit sink itself failed — nothing more we can safely do here */
    }
    return { ran: false };
  }
}

const ParallelRun = { shadowCompare };
export default ParallelRun;
