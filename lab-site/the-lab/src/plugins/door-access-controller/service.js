// door-access-controller service — business logic (no HTTP; that's controller.js).
// Resolves a credential → member, asks the CORE for facts, loads policy + door, and
// runs the pure engine (policy.js). Also handles lifecycle revocation. Persistence is
// isolated in model.js; identity/membership is read via the users SERVICE, never its
// model (the-lab/CLAUDE.md §4).

import Model from "./model";
import { factsFromUser } from "./facts";
import { blindIndex, encryptCode } from "./cardCrypto";
import { newCardDoc } from "./class";
import { decide, allowedDoorsForFacts } from "./policy";
import { signAllowlist, allowlistSigningReady } from "./allowlistCrypto";
import { resolveConfig, PLUGIN_ID } from "./config";
import UsersService from "@/app/api/v1/users/service";
import { pushAllowlist } from "@/lib/access-control";
import { auditLog } from "@/lib/audit";

/** Effective policy = structured rules/overrides (DB) + flat knobs (manifest/config). */
async function loadPolicy() {
  const cfg = await resolveConfig();
  const doc = await Model.getPolicyDoc();
  return {
    rules: doc.rules || [],
    accountOverrides: doc.accountOverrides || {},
    requireGoodStanding: cfg.requireGoodStanding,
    allowAdminBypass: cfg.allowAdminBypass,
    defaultTimezone: cfg.defaultTimezone,
  };
}

/**
 * Resolve a presented credential to a userID.
 * - nfc/qr: look up the keyed blind index in the card model (raw code never stored/logged).
 * - app: the value IS the session-derived userID (the caller already authenticated it).
 * @returns {Promise<string|null>}
 */
async function resolveUserID(credentialType, credentialValue) {
  if (credentialType === "app") return credentialValue || null;
  const card = await Model.findCardByBlindIndex(blindIndex(credentialValue));
  return card && card.status !== "revoked" ? card.userID : null;
}

const Service = {
  /**
   * The core authorize decision for a scan (socket-server → app). Deny-by-default;
   * every outcome (grant AND deny) is audited with IDs + reason, never the raw code.
   * @param {{ credentialType:("nfc"|"qr"|"app"), credentialValue:string, doorId:string,
   *           now?:Date, source?:string }} input
   * @returns {Promise<{granted:boolean, reason:string, userID?:string, username?:string, role?:string}>}
   */
  async authorize({ credentialType = "nfc", credentialValue, doorId, now = new Date(), source }) {
    const audit = (outcome, extra) =>
      auditLog("door-access.authorize", { actor: { pluginId: PLUGIN_ID }, target: doorId, outcome, source, credentialType, ...extra });

    const userID = await resolveUserID(credentialType, credentialValue);
    if (!userID) {
      audit("denied", { reason: "unknown-credential" });
      return { granted: false, reason: "unknown-credential" };
    }

    const user = await UsersService.getUserByQuery({ userID });
    const facts = factsFromUser(user);
    if (!facts) {
      audit("denied", { reason: "unknown-user", user: userID });
      return { granted: false, reason: "unknown-user" };
    }

    const door = (await Model.findDoor(doorId)) || { doorId };
    const policy = await loadPolicy();
    const decision = decide({ facts, door, credentialType, now, policy });

    audit(decision.granted ? "granted" : "denied", { user: userID, reason: decision.reason, ruleId: decision.ruleId });
    return decision.granted
      ? { granted: true, reason: decision.reason, userID, username: user.username, role: user.role }
      : { granted: false, reason: decision.reason };
  },

  /**
   * Enroll (pair) a card to a member: store its GCM ciphertext + blind index, never the
   * raw code. One active card per member — replaces any previous card (mirrors the single
   * membership.accessKey.code). The raw code is never logged or returned.
   * @param {{ userID:string, code:string, credentialType?:("nfc"|"qr") }} p
   * @returns {Promise<{userID:string, bi:string}>}  bi is a non-secret keyed hash
   */
  async enrollCard({ userID, code, credentialType = "nfc" }) {
    if (!userID || !code) throw new Error("enrollCard requires userID and code");
    const bi = blindIndex(code);
    const doc = newCardDoc({ userID, codeEnc: encryptCode(code), bi, credentialType });
    await Model.deleteCardsByUserID(userID); // replace, so a re-pair invalidates the old card
    await Model.upsertCard(doc);
    auditLog("door-access.enroll", { actor: { pluginId: PLUGIN_ID }, target: userID, outcome: "enrolled", credentialType });
    return { userID, bi };
  },

  /**
   * Build a signed, TTL'd offline allowlist snapshot from the current cards + policy + facts.
   * Each entry is { credHash (the card's blind index), entries:[{doorId, windows}] } — no PII,
   * no raw codes. The device replays this offline; the signature + TTL stop replay/forgery.
   * @param {{ now?:Date, ttlMinutes?:number }} [opts]
   * @returns {Promise<{payload:object, sig:string, alg:string}>}
   */
  async buildSignedAllowlist({ now = new Date(), ttlMinutes } = {}) {
    const cfg = await resolveConfig();
    const ttl = ttlMinutes || cfg.offlineTtlMinutes || 30;
    const policyDoc = await Model.getPolicyDoc();
    const policy = {
      rules: policyDoc.rules || [],
      accountOverrides: policyDoc.accountOverrides || {},
      requireGoodStanding: cfg.requireGoodStanding,
      allowAdminBypass: cfg.allowAdminBypass,
      defaultTimezone: cfg.defaultTimezone,
    };
    const doors = await Model.listDoors();
    const cards = await Model.listCards({ status: "active" });

    const entries = [];
    for (const card of cards) {
      const facts = factsFromUser(await UsersService.getUserByQuery({ userID: card.userID }));
      if (!facts) continue;
      const allowed = allowedDoorsForFacts(facts, doors, policy, card.credentialType || "nfc");
      if (allowed.length) entries.push({ credHash: card.bi, entries: allowed });
    }

    const payload = {
      version: 1,
      issuedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + ttl * 60000).toISOString(),
      doorCount: doors.length,
      entryCount: entries.length,
      entries,
    };
    return signAllowlist(payload);
  },

  /** Build + push the signed allowlist to the socket-server. Skips (audited) if unsigned. */
  async refreshAllowlist({ now = new Date() } = {}) {
    if (!allowlistSigningReady()) {
      auditLog("door-access.allowlist", { actor: { pluginId: PLUGIN_ID }, outcome: "skipped", reason: "signing-key-not-set" });
      return { pushed: false, reason: "signing-key-not-set" };
    }
    const signed = await this.buildSignedAllowlist({ now });
    await pushAllowlist(signed);
    auditLog("door-access.allowlist", { actor: { pluginId: PLUGIN_ID }, outcome: "pushed", entries: signed.payload.entryCount, expiresAt: signed.payload.expiresAt });
    return { pushed: true, entries: signed.payload.entryCount, expiresAt: signed.payload.expiresAt };
  },

  /** Best-effort re-push so a change propagates to offline doors promptly; never throws. */
  async _repushBestEffort() {
    try {
      if (allowlistSigningReady()) await this.refreshAllowlist();
    } catch (e) {
      auditLog("door-access.allowlist", { actor: { pluginId: PLUGIN_ID }, outcome: "error", reason: String((e && e.message) || e) });
    }
  },

  /** A member was suspended → soft-revoke their cards + re-push the offline allowlist. */
  async onMembershipSuspended(payload) {
    const userID = payload?.userID;
    if (!userID) return;
    await Model.revokeCardsByUserID(userID);
    auditLog("door-access.revoke", { actor: { pluginId: PLUGIN_ID }, target: userID, outcome: "revoked", reason: "membership-suspended" });
    await this._repushBestEffort();
  },

  /** A member was deleted → hard-delete their cards + re-push the offline allowlist. */
  async onMemberDeleted(payload) {
    const userID = payload?.userID;
    if (!userID) return;
    await Model.deleteCardsByUserID(userID);
    auditLog("door-access.revoke", { actor: { pluginId: PLUGIN_ID }, target: userID, outcome: "deleted", reason: "member-deleted" });
    await this._repushBestEffort();
  },
};

export default Service;
