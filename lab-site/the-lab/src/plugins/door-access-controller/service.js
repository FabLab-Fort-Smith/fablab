// door-access-controller service — business logic (no HTTP; that's controller.js).
// Resolves a credential → member, asks the CORE for facts, loads policy + door, and
// runs the pure engine (policy.js). Also handles lifecycle revocation. Persistence is
// isolated in model.js; identity/membership is read via the users SERVICE, never its
// model (the-lab/CLAUDE.md §4).

import crypto from "crypto";

import Model from "./model";
import { factsFromUser } from "./facts";
import { blindIndex, encryptCode, decryptToBuffer, recipientIndexKey, credHashFor, meetsEntropyFloor, generateCardToken } from "./cardCrypto";
import { newCardDoc, newDoorDoc } from "./class";
import { decide, allowedDoorsForFacts } from "./policy";
import { signAllowlist, signEnvelope, allowlistSigningReady } from "./allowlistCrypto";
import { ALERT, ingestAuditBatch } from "./auditAnchor";
import { verifyEdgeBatchSig } from "./edgeAuditSig";
import { resolveConfig, PLUGIN_ID, PERM_ADMIN } from "./config";
import { assertPermission } from "@/lib/plugins/permissions";
import UsersService from "@/app/api/v1/users/service";
import { pushAllowlist, pushBrokerEnvelopes } from "@/lib/access-control";
import { auditLog } from "@/lib/audit";

const badRequest = (msg) => {
  const e = new Error(msg);
  e.status = 400;
  return e;
};
// Card rows for the admin UI — never expose the ciphertext or the blind index.
const publicCard = (c) => ({ userID: c.userID, credentialType: c.credentialType, status: c.status, createdAt: c.createdAt });
const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]); // prototype-pollution class (CWE-1321)
const isSafeKey = (k) => typeof k === "string" && k.length > 0 && !k.startsWith("$") && !k.includes(".") && !DANGEROUS_KEYS.has(k);

/**
 * The on-site broker → owned-doors map, from BROKER_DOOR_MAP (JSON `{brokerId:[doorId,...]}`). This is
 * the app-side source for which per-door envelopes to build for each broker; the socket-server holds
 * the same map and re-scopes on relay (defense-in-depth, #157). Malformed → {} (fail-closed: build for
 * no broker rather than guess). S3 provisioning will unify this with the door registry.
 */
function resolveBrokerDoorMap(raw = process.env.BROKER_DOOR_MAP) {
  if (!raw) return {};
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return {}; }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const out = {};
  for (const [brokerId, doors] of Object.entries(parsed)) {
    if (isSafeKey(brokerId) && Array.isArray(doors)) {
      out[brokerId] = doors.filter((d) => typeof d === "string" && d);
    }
  }
  return out;
}

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

// Edge audit ingest bounds + validation (S6-b1). The S6-a core is robust to garbage, but we validate
// types at the trust boundary and CAP the batch (OWASP API4 — the ingest route is attacker-reachable
// via the broker). Alert severity drives where an anomaly is routed.
const MAX_AUDIT_BATCH = 1000;
const ALERT_SEVERITY = {
  [ALERT.TAIL_TRUNCATION]: "high",
  tamper: "high", // ALERT.TAMPER
  [ALERT.GAP]: "medium",
  [ALERT.BOOT_TRANSITION]: "notice",
};
/** A short, log-safe id for an edge signing key (sha256 of the SPKI, first 16 hex) — never the raw key. */
const edgeKeyFingerprint = (pubSpki) => crypto.createHash("sha256").update(String(pubSpki)).digest("hex").slice(0, 16);
const _int = (v) => typeof v === "number" && Number.isInteger(v) && !Number.isNaN(v);
const _INT_LIKE_KEY = /^-?\d+$/;
/**
 * True iff no object anywhere in `v` has an integer-like key. JS `JSON.stringify` orders integer-like
 * keys numerically while Python's `canonical_bytes` sorts keys as strings, so such a key would make the
 * two sides canonicalize DIFFERENTLY — the edge's valid signature would then fail cloud verification
 * (fail-closed, never a forge) and drop that edge's audit + fire a false high-severity alert. We reject
 * it at the boundary as an explicit `malformed-record` instead. `event` is the only free-form object in
 * a record, but we scan defensively. (SEC #170 F1; JS↔Py byte-parity, door-controller-wifi.md §2 F3.)
 */
function noIntegerLikeKeys(v) {
  if (Array.isArray(v)) return v.every(noIntegerLikeKeys);
  if (v && typeof v === "object") {
    for (const k of Object.keys(v)) {
      if (_INT_LIKE_KEY.test(k) || !noIntegerLikeKeys(v[k])) return false;
    }
  }
  return true;
}
/** True iff a record is well-typed at the boundary (deep content is verified by the anchor). */
function validAuditRecord(r) {
  return r && typeof r === "object"
    && _int(r.seq) && r.seq >= 0
    && _int(r.ts)
    // bootEpoch is used as an object key AND a Mongo field name — reject reserved/operator keys at the
    // boundary (a `__proto__`/`$`/`.` value would otherwise read an inherited member → unhandled 500,
    // or land as a Mongo field). SEC #169 LOW.
    && isSafeKey(r.bootEpoch) && r.bootEpoch.length <= 128
    && typeof r.prev === "string" && typeof r.hash === "string"
    && r.event && typeof r.event === "object" && !Array.isArray(r.event)
    && noIntegerLikeKeys(r.event); // JS↔Py canonical parity — SEC #170 F1
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
  /** Internal store of a validated card (no entropy gate — callers own that). Not a public API. */
  async _storeCard({ userID, code, credentialType }) {
    const bi = blindIndex(code);
    const doc = newCardDoc({ userID, codeEnc: encryptCode(code), bi, credentialType });
    await Model.deleteCardsByUserID(userID); // replace, so a re-pair invalidates the old card
    await Model.upsertCard(doc);
    auditLog("door-access.enroll", { actor: { pluginId: PLUGIN_ID }, target: userID, outcome: "enrolled", credentialType });
    return { userID, bi };
  },

  /**
   * Public enroll — for NFC-UID credentials only. qr/app must be **server-issued** via issueCard
   * (door-controller-wifi.md §5, F1/R3, DoD #12): an externally-supplied qr/app code can't be proven
   * high-entropy, so the public API refuses it outright — there is no caller-settable bypass. NFC-UIDs
   * cannot meet the floor and are an accepted, audited risk (bounded per the design).
   */
  async enrollCard({ userID, code, credentialType = "nfc" }) {
    if (!userID || !code) throw new Error("enrollCard requires userID and code");
    if (credentialType === "qr" || credentialType === "app") {
      throw badRequest(`a ${credentialType} credential must be server-issued — call issueCard(); external codes are not accepted`);
    }
    auditLog("door-access.enroll", { actor: { pluginId: PLUGIN_ID }, target: userID, outcome: "low-entropy-accepted", credentialType, reason: "nfc-uid-accepted-risk" });
    return this._storeCard({ userID, code, credentialType });
  },

  /**
   * Issue a NEW qr/app credential: the SERVER generates a ≥128-bit CSPRNG token, enrolls it, and
   * returns it for the admin/app to render into the QR / app credential (door-controller-wifi.md
   * §5, F1/R3, DoD #12). This is the only way a high-assurance credential enters the system — so
   * "system-issued" is a provable property, not an unenforceable inspection of a supplied string.
   * The raw `code` is returned to the caller once and is NEVER logged.
   * @param {{ userID:string, credentialType?:("qr"|"app") }} p
   * @returns {Promise<{userID:string, code:string, credentialType:string}>}
   */
  async issueCard({ userID, credentialType = "qr" } = {}) {
    if (!userID) throw badRequest("userID is required");
    if (credentialType !== "qr" && credentialType !== "app") {
      throw badRequest("issueCard is for qr/app credentials (an NFC-UID comes from the physical card)");
    }
    const code = generateCardToken();
    if (!meetsEntropyFloor(code)) throw new Error("issued token failed the entropy floor"); // defensive; never happens
    await this._storeCard({ userID, code, credentialType });
    return { userID, code, credentialType };
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
    let skipped = 0;
    try {
      for (const card of cards) {
        // Per-card fail-open FOR THE BUILD (not for access): one corrupt/tampered codeEnc must not
        // abort the whole door envelope → a single bad row can't cause a site-wide offline denial
        // (F-2). The bad card is skipped + audited; the door still gets an envelope for the rest.
        try {
          const facts = factsFromUser(await UsersService.getUserByQuery({ userID: card.userID }));
          if (!facts) continue;
          const allowed = allowedDoorsForFacts(facts, doors, policy, card.credentialType || "nfc");
          const forThisDoor = allowed.find((a) => a.doorId === doorId);
          if (!forThisDoor) continue;
          const codeBuf = decryptToBuffer(card.codeEnc); // throws on GCM tamper → caught below
          try {
            entries.push({ credHash: credHashFor(recipientKey, codeBuf), windows: forThisDoor.windows || [] });
          } finally {
            codeBuf.fill(0); // wipe plaintext PII immediately (§5)
          }
        } catch (e) {
          skipped += 1;
          auditLog("door-access.allowlist", { actor: { pluginId: PLUGIN_ID }, target: doorId, outcome: "card-skipped", reason: String((e && e.message) || e) });
        }
      }
    } finally {
      recipientKey.fill(0);
    }
    // Build-level observability (S1 review follow-up): a mass-skip = likely data corruption, and would
    // otherwise be a valid but near-empty envelope (offline deny-all) signalled only by scattered
    // per-row logs. Emit one aggregate so it's a first-class, alertable signal.
    if (skipped > 0) {
      auditLog("door-access.allowlist", { actor: { pluginId: PLUGIN_ID }, target: doorId, outcome: "build-skips", skipped, of: cards.length });
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

  /**
   * Build + push per-door SIGNED envelopes to each on-site broker (door-controller-wifi.md §13 S2c-2b).
   * For every broker in BROKER_DOOR_MAP, builds one envelope per owned door — re-keyed to that broker
   * (`recipientId = brokerId` → its own `brokerIndexKey`, so a leaked broker key scopes to its site only)
   * — and relays them down the broker's uplink via the cloud (#157). Fail-secure: skips (audited) if the
   * signing key isn't set; a broker that isn't connected (503) is noted, not fatal (it re-syncs on
   * reconnect). Never lets one broker's failure abort the rest.
   * @param {{ now?:Date }} [args]
   */
  async refreshBrokerEnvelopes({ now = new Date(), brokerId = null } = {}) {
    if (!allowlistSigningReady()) {
      auditLog("door-access.allowlist", { actor: { pluginId: PLUGIN_ID }, outcome: "skipped", reason: "signing-key-not-set" });
      return { pushed: false, reason: "signing-key-not-set" };
    }
    const doorMap = resolveBrokerDoorMap(); // { brokerId: [doorId,...] } from config
    let brokerIds = Object.keys(doorMap);
    // Optional single-broker scope (S2c-2c reconnect resync): rebuild+push just the broker that
    // (re)connected, not the whole fleet. An unknown/unmapped brokerId → no-op (fail-closed).
    if (brokerId != null) brokerIds = brokerIds.filter((b) => b === brokerId);
    if (!brokerIds.length) return { pushed: false, reason: brokerId != null ? "unknown-broker" : "no-brokers" };

    let brokersPushed = 0;
    let brokersOffline = 0;
    for (const brokerId of brokerIds) {
      try {
        const envelopes = [];
        for (const doorId of doorMap[brokerId]) {
          envelopes.push(await this.buildDoorEnvelope({ doorId, recipientId: brokerId, now }));
        }
        const r = await pushBrokerEnvelopes(brokerId, envelopes);
        if (r.connected) brokersPushed += 1; else brokersOffline += 1;
        auditLog("door-access.allowlist", {
          actor: { pluginId: PLUGIN_ID }, target: brokerId,
          outcome: r.connected ? "broker-pushed" : "broker-offline",
          envelopes: envelopes.length, relayed: r.relayed, rejected: r.rejected,
        });
      } catch (e) {
        // One broker's transport/build failure must not stop the others (fail-secure per broker).
        auditLog("door-access.allowlist", { actor: { pluginId: PLUGIN_ID }, target: brokerId, outcome: "broker-error", reason: String((e && e.message) || e) });
      }
    }
    return { pushed: true, brokers: brokerIds.length, brokersPushed, brokersOffline };
  },

  /** Best-effort re-push so a change propagates to offline doors promptly; never throws. */
  async _repushBestEffort() {
    try {
      if (allowlistSigningReady()) await this.refreshAllowlist();
    } catch (e) {
      auditLog("door-access.allowlist", { actor: { pluginId: PLUGIN_ID }, outcome: "error", reason: String((e && e.message) || e) });
    }
    // Fan the same change out to the tiered brokers (independent of the monolithic addon push above).
    try {
      await this.refreshBrokerEnvelopes();
    } catch (e) {
      auditLog("door-access.allowlist", { actor: { pluginId: PLUGIN_ID }, outcome: "error", reason: String((e && e.message) || e) });
    }
  },

  /**
   * Ingest a store-and-forward audit batch from an edge (relayed by its broker). Validates the batch at
   * the trust boundary (types + size cap), runs the fail-closed anchor check (auditAnchor.ingestAuditBatch)
   * against the Mongo per-edge anchor under an optimistic-concurrency CAS (no lost update from concurrent
   * ingests), and ROUTES every anomaly to the audit log at its severity. Returns {accepted,duplicates,alerts}.
   * @param {{edgeId:string, records:Array}} args
   */
  async ingestEdgeAudit({ edgeId, records, signature } = {}) {
    if (typeof edgeId !== "string" || !isSafeKey(edgeId) || edgeId.length > 128) {
      return { accepted: 0, duplicates: 0, alerts: [], rejected: "bad-edgeId" };
    }
    if (!Array.isArray(records) || records.length === 0) return { accepted: 0, duplicates: 0, alerts: [] };
    if (records.length > MAX_AUDIT_BATCH) return { accepted: 0, duplicates: 0, alerts: [], rejected: "batch-too-large" };
    if (!records.every(validAuditRecord)) return { accepted: 0, duplicates: 0, alerts: [], rejected: "malformed-record" };

    // EDGE AUTH (#151): the batch must be signed by the edge's REGISTERED audit key, verified BEFORE the
    // anchor check — so a relaying broker (or the internal bearer alone) cannot forge or suppress an
    // edge's audit. Fail closed: an unregistered edge or a bad signature is rejected + alerted, nothing
    // is read or persisted. `event`/records are still never logged (PII), only the outcome.
    const pubSpki = await Model.getEdgeSigningKey(edgeId);
    if (!pubSpki) {
      auditLog("door-access.audit", { actor: { pluginId: PLUGIN_ID }, target: edgeId, outcome: "alert", severity: "high", alert: "unregistered-edge" });
      return { accepted: 0, duplicates: 0, alerts: [], rejected: "unregistered-edge" };
    }
    if (typeof signature !== "string" || !verifyEdgeBatchSig(pubSpki, edgeId, records, signature)) {
      auditLog("door-access.audit", { actor: { pluginId: PLUGIN_ID }, target: edgeId, outcome: "alert", severity: "high", alert: "bad-signature" });
      return { accepted: 0, duplicates: 0, alerts: [], rejected: "bad-signature" };
    }

    // CAS retry loop: read anchor + version, run the pure check, persist only if the version is unchanged.
    let result = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { anchor, version } = await Model.getAuditAnchor(edgeId);
      let mutated = null;
      const store = { get: () => anchor, set: (_id, rec) => { mutated = rec; } };
      const res = ingestAuditBatch(store, { edgeId, records });
      if (!mutated) { result = res; break; } // nothing to persist (dup / tamper / gap / truncation held)
      if (await Model.casAuditAnchor(edgeId, version, mutated)) { result = res; break; } // persisted
      // else a concurrent ingest advanced the anchor → reload + retry
    }
    if (!result) {
      auditLog("door-access.audit", { actor: { pluginId: PLUGIN_ID }, target: edgeId, outcome: "cas-conflict" });
      return { accepted: 0, duplicates: 0, alerts: [], rejected: "conflict" };
    }
    // Route anomalies to a monitored channel (master §9). Alerts carry no PII (type/seq/reason only).
    for (const a of result.alerts) {
      auditLog("door-access.audit", {
        actor: { pluginId: PLUGIN_ID }, target: edgeId, outcome: "alert",
        severity: ALERT_SEVERITY[a.type] || (a.reason === "chain-fork" ? "high" : "medium"),
        alert: a.type, reason: a.reason, seq: a.seq,
      });
    }
    return result;
  },

  // --- admin surface (all admin-only via assertPermission; deny-by-default) --------------

  /** Everything the admin page needs. Cards are sanitized (no ciphertext / blind index). */
  async adminOverview(actor) {
    assertPermission(actor, PERM_ADMIN);
    const [doors, policy, cards, edgeKeys] = await Promise.all([
      Model.listDoors(), Model.getPolicyDoc(), Model.listCards({}), Model.listEdgeKeys(),
    ]);
    return {
      doors,
      policy,
      cards: cards.map(publicCard),
      // Registered edge audit-signing keys — id + FINGERPRINT + updatedAt only (never the raw key).
      edges: edgeKeys.map((d) => ({
        edgeId: d._id,
        fingerprint: typeof d.pubSpki === "string" ? edgeKeyFingerprint(d.pubSpki) : null,
        updatedAt: d.updatedAt || null,
      })),
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

  /**
   * Register (or rotate) an edge's audit-signing PUBLIC key — the genesis/reflash trust binding (#151,
   * S6-b-a2). Admin-only. The admin runs `edge/provision_audit_key.py` on the device and pastes the
   * printed `pubSpki` here; from then on the cloud accepts that edge's audit only when signed by the
   * matching private key. This RE-ANCHORS trust for the edge, so it is fully audited: genesis vs.
   * rotation, with the key FINGERPRINT (sha256), never letting a raw key or any PII into the log.
   * @param {object} actor @param {{edgeId:string, pubSpki:string}} args
   */
  async adminRegisterEdgeKey(actor, { edgeId, pubSpki } = {}) {
    assertPermission(actor, PERM_ADMIN);
    if (typeof edgeId !== "string" || !isSafeKey(edgeId) || edgeId.length > 128) throw badRequest("valid edgeId is required");
    if (typeof pubSpki !== "string" || !pubSpki.trim()) throw badRequest("pubSpki is required");
    // Validate it's a real Ed25519 SPKI up front → a clean 400, not a 500 from the model guard.
    try {
      const key = crypto.createPublicKey({ key: Buffer.from(pubSpki, "base64"), format: "der", type: "spki" });
      if (key.asymmetricKeyType !== "ed25519") throw new Error("not-ed25519");
    } catch {
      throw badRequest("pubSpki must be a base64 Ed25519 SPKI public key");
    }
    // Atomic upsert returns the PRIOR key (no read-then-write TOCTOU — SEC #171 Low-1); the model
    // re-validates inputs (defense in depth). Classify: genesis (new edge), no-op re-register (same
    // key), or rotation (different key — a trust re-anchor).
    const prior = await Model.registerEdgeSigningKey(edgeId, pubSpki);
    const rotated = prior !== null && prior !== pubSpki;
    const outcome = prior === null ? "edge-key-register" : rotated ? "edge-key-rotate" : "edge-key-reregister";
    auditLog("door-access.admin", {
      actor: { userID: actor.userID }, target: edgeId, outcome,
      fingerprint: edgeKeyFingerprint(pubSpki),
      priorFingerprint: prior ? edgeKeyFingerprint(prior) : null,
    });
    return { ok: true, edgeId, fingerprint: edgeKeyFingerprint(pubSpki), rotated };
  },

  /** List registered edges for the admin UI — id + key FINGERPRINT + updatedAt only (never the raw key). */
  async adminListEdgeKeys(actor) {
    assertPermission(actor, PERM_ADMIN);
    const docs = await Model.listEdgeKeys();
    return docs.map((d) => ({
      edgeId: d._id,
      fingerprint: typeof d.pubSpki === "string" ? edgeKeyFingerprint(d.pubSpki) : null,
      updatedAt: d.updatedAt || null,
    }));
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
