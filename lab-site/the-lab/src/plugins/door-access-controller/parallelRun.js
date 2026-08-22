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
import Service from "./service";
import { factsFromUser } from "./facts";
import { decide } from "./policy";
import { cardCryptoReady } from "./cardCrypto";
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

/**
 * Enroll a card into the addon store IF the addon is enabled + card keys are set. Called
 * alongside the live plaintext write during migration so both stores stay in sync. NEVER
 * throws (a coexistence hook must not break card registration) and never logs the raw code.
 * @param {{ userID:string, code:string, credentialType?:("nfc"|"qr") }} p
 * @returns {Promise<{ran:boolean}>}
 */
export async function enrollIfEnabled({ userID, code, credentialType = "nfc" }) {
  try {
    if (!(await addonEnabled())) return { ran: false };
    if (!cardCryptoReady()) {
      auditLog("door-access.enroll", { actor: { pluginId: PLUGIN_ID }, target: userID, outcome: "skipped", reason: "card-keys-not-set" });
      return { ran: false };
    }
    await Service.enrollCard({ userID, code, credentialType });
    return { ran: true };
  } catch (e) {
    try {
      auditLog("door-access.enroll", { actor: { pluginId: PLUGIN_ID }, target: userID, outcome: "error", reason: String((e && e.message) || e) });
    } catch {
      /* audit sink failed — nothing safe left to do */
    }
    return { ran: false };
  }
}

/** Is the addon the authoritative decider (enabled + cutover flag on)? Never throws. */
async function isAuthoritative() {
  try {
    if (!(await addonEnabled())) return false;
    return (await resolveConfig()).authoritative === true;
  } catch {
    return false;
  }
}

/**
 * Post-cutover authorization: when the addon is authoritative, resolve + decide entirely in the
 * addon (credential → member via the encrypted card store, no plaintext read) and return the
 * decision. Otherwise `{handled:false}` so the caller keeps its legacy (plaintext) path. Never throws.
 * @param {{ cardId:string, doorId:string, credentialType?:string, source?:string }} q
 * @returns {Promise<{handled:false} | {handled:true, granted:boolean, reason?:string, userID?:string, username?:string, role?:string}>}
 */
export async function authoritativeDecision({ cardId, doorId, credentialType = "nfc", source }) {
  try {
    if (!(await isAuthoritative())) return { handled: false };
    const r = await Service.authorize({ credentialType, credentialValue: cardId, doorId, source });
    return { handled: true, ...r };
  } catch (e) {
    // A failure here must NOT fall back to the (being-retired) plaintext path silently granting;
    // report handled with a denial so the door fails closed, and audit.
    try {
      auditLog("door-access.authorize", { actor: { pluginId: PLUGIN_ID }, target: doorId, outcome: "error", reason: String((e && e.message) || e) });
    } catch {
      /* audit sink failed */
    }
    return { handled: true, granted: false, reason: "authorize-error" };
  }
}

/** Should register-card stop persisting the raw code? (addon enabled + retire flag). Never throws. */
export async function plaintextRetired() {
  try {
    if (!(await addonEnabled())) return false;
    return (await resolveConfig()).retirePlaintextCode === true;
  } catch {
    return false;
  }
}

const ParallelRun = { shadowCompare, enrollIfEnabled, authoritativeDecision, plaintextRetired };
export default ParallelRun;
