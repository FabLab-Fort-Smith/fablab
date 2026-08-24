// door-access-controller service — business logic (no HTTP; that's controller.js).
// Resolves a credential → member, asks the CORE for facts, loads policy + door, and
// runs the pure engine (policy.js). Also handles lifecycle revocation. Persistence is
// isolated in model.js; identity/membership is read via the users SERVICE, never its
// model (the-lab/CLAUDE.md §4).

import Model from "./model";
import { factsFromUser } from "./facts";
import { blindIndex, encryptCode, decryptToBuffer, recipientIndexKey, credHashFor, meetsEntropyFloor } from "./cardCrypto";
import { newCardDoc, newDoorDoc } from "./class";
import { decide, allowedDoorsForFacts } from "./policy";
import { signAllowlist, signEnvelope, allowlistSigningReady } from "./allowlistCrypto";
import { resolveConfig, PLUGIN_ID, PERM_ADMIN } from "./config";
import { assertPermission } from "@/lib/plugins/permissions";
import UsersService from "@/app/api/v1/users/service";
import { pushAllowlist } from "@/lib/access-control";
import { auditLog } from "@/lib/audit";

const badRequest = (msg) => {
  const e = new Error(msg);
  e.status = 400;
  return e;
};
// Card rows for the admin UI — never expose the ciphertext or the blind index.
const publicCard = (c) => ({ userID: c.userID, credentialType: c.credentialType, status: c.status, createdAt: c.createdAt });
const isSafeKey = (k) => typeof k === "string" && k.length > 0 && !k.startsWith("$") && !k.includes(".");

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
    // Entropy floor (door-controller-wifi.md §5, F1/R3): high-assurance credential types must be
    // system-issued ≥128-bit tokens so a leaked per-recipient index key can't be dictionaried.
    // NFC-UIDs cannot meet it and are an accepted risk (bounded per the design) — allowed but audited.
    if ((credentialType === "qr" || credentialType === "app") && !meetsEntropyFloor(code)) {
      throw badRequest(`a ${credentialType} credential must be a system-issued ≥128-bit token (see generateCardToken)`);
    }
    if (credentialType === "nfc") {
      auditLog("door-access.enroll", { actor: { pluginId: PLUGIN_ID }, target: userID, outcome: "low-entropy-accepted", credentialType, reason: "nfc-uid-accepted-risk" });
    }
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
      tz: cfg.defaultTimezone, // window evaluation timezone for the offline decider
      doorCount: doors.length,
      entryCount: entries.length,
      entries,
    };
    return signAllowlist(payload);
  },

  /**
   * Build a single door's SIGNED envelope, re-keyed for one recipient (door-controller-wifi.md §2).
   * This is the S1 building block the broker/edge cache (the distribution — which recipients per door
   * — is S2/S3). Fail-secure + PII-safe:
   *   - per-door payload with a **strictly-monotonic `version`** (Model.nextEnvelopeVersion — F5);
   *   - each `credHash` is `HMAC(recipientIndexKey(recipientId), code)` (F1) — a leaked recipient key
   *     compromises only that recipient's scope;
   *   - the plaintext code is decrypted to a **Buffer**, HMAC'd, then `fill(0)`'d — never a String (F1
   *     zeroization); the recipient key is wiped after the pass;
   *   - the envelope carries `doorId` so the verifier can bind it to the door it's deciding (F2);
   *   - signed via `signEnvelope` (validates canonical-safety, F3).
   * @param {{ doorId:string, recipientId:string, now?:Date, ttlMinutes?:number }} args
   * @returns {Promise<{payload:object, sig:string, alg:string}>}
   */
  async buildDoorEnvelope({ doorId, recipientId, now = new Date(), ttlMinutes } = {}) {
    if (typeof doorId !== "string" || !doorId) throw badRequest("doorId is required");
    if (typeof recipientId !== "string" || !recipientId) throw badRequest("recipientId is required");

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

    const recipientKey = recipientIndexKey(recipientId);
    const version = await Model.nextEnvelopeVersion(doorId); // monotonic per door (anti-rollback)
    const entries = [];
    try {
      for (const card of cards) {
        const facts = factsFromUser(await UsersService.getUserByQuery({ userID: card.userID }));
        if (!facts) continue;
        const allowed = allowedDoorsForFacts(facts, doors, policy, card.credentialType || "nfc");
        const forThisDoor = allowed.find((a) => a.doorId === doorId);
        if (!forThisDoor) continue;
        const codeBuf = decryptToBuffer(card.codeEnc);
        try {
          entries.push({ credHash: credHashFor(recipientKey, codeBuf), windows: forThisDoor.windows || [] });
        } finally {
          codeBuf.fill(0); // wipe plaintext PII immediately (§5)
        }
      }
    } finally {
      recipientKey.fill(0);
    }

    const payload = {
      doorId,
      version,
      issuedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + ttl * 60000).toISOString(),
      tz: cfg.defaultTimezone,
      entryCount: entries.length,
      entries,
    };
    return signEnvelope(payload);
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

  // --- admin surface (all admin-only via assertPermission; deny-by-default) --------------

  /** Everything the admin page needs. Cards are sanitized (no ciphertext / blind index). */
  async adminOverview(actor) {
    assertPermission(actor, PERM_ADMIN);
    const [doors, policy, cards] = await Promise.all([Model.listDoors(), Model.getPolicyDoc(), Model.listCards({})]);
    return {
      doors,
      policy,
      cards: cards.map(publicCard),
      allowlist: { signingReady: allowlistSigningReady() },
    };
  },

  /** Create/update a door in the registry. */
  async adminUpsertDoor(actor, { doorId, name, deviceId, timezone = null, enabled = true } = {}) {
    assertPermission(actor, PERM_ADMIN);
    if (typeof doorId !== "string" || !doorId.trim()) throw badRequest("doorId is required");
    if (typeof deviceId !== "string" || !deviceId.trim()) throw badRequest("deviceId is required");
    const doc = { ...newDoorDoc({ doorId: doorId.trim(), name, deviceId: deviceId.trim(), timezone }), enabled: enabled !== false };
    await Model.upsertDoor(doc);
    auditLog("door-access.admin", { actor: { userID: actor.userID }, outcome: "door-upsert", target: doorId });
    return { ok: true, doorId: doc.doorId };
  },

  /** Replace the access policy (rules + per-account overrides). Validated + injection-safe. */
  async adminSavePolicy(actor, { rules, accountOverrides } = {}) {
    assertPermission(actor, PERM_ADMIN);
    if (!Array.isArray(rules)) throw badRequest("rules must be an array");
    for (const r of rules) {
      if (!r || typeof r.id !== "string" || !r.id) throw badRequest("each rule needs a string id");
      if (!Array.isArray(r.roles) || !Array.isArray(r.doors)) throw badRequest(`rule ${r.id}: roles and doors must be arrays`);
    }
    const overrides = {};
    for (const [k, v] of Object.entries(accountOverrides || {})) {
      if (!isSafeKey(k)) throw badRequest("invalid account id in overrides");
      if (v !== "allow" && v !== "deny") throw badRequest(`override for ${k} must be "allow" or "deny"`);
      overrides[k] = v;
    }
    await Model.savePolicyDoc({ rules, accountOverrides: overrides });
    auditLog("door-access.admin", { actor: { userID: actor.userID }, outcome: "policy-save", rules: rules.length, overrides: Object.keys(overrides).length });
    await this._repushBestEffort();
    return { ok: true };
  },

  /** Revoke a member's card(s) from the admin UI + re-push the offline allowlist. */
  async adminRevokeCard(actor, { userID } = {}) {
    assertPermission(actor, PERM_ADMIN);
    if (typeof userID !== "string" || !userID) throw badRequest("userID is required");
    await Model.revokeCardsByUserID(userID);
    auditLog("door-access.admin", { actor: { userID: actor.userID }, outcome: "card-revoke", target: userID });
    await this._repushBestEffort();
    return { ok: true };
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
