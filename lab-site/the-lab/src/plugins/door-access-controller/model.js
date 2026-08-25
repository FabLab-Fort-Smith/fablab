// Persistence for the door-access addon — the ONLY file here that touches the DB
// (the-lab/CLAUDE.md §4). Three collections: encrypted cards, the door registry, and
// a single access-policy document. Card codes are stored only as GCM ciphertext + a
// unique blind index (cardCrypto.js); this file never sees a plaintext code.

import crypto from "crypto";

import { db } from "@/lib/database";
import { EMPTY_POLICY } from "./class";

const CARDS = "doorAccessCards";
const DOORS = "doorAccessDoors";
const POLICY = "doorAccessPolicy";
const COUNTERS = "doorAccessCounters"; // monotonic per-door envelope version (anti-rollback, F5)
const ANCHORS = "doorAccessAuditAnchors"; // per-edge audit anchor {_id:edgeId, boots, currentBoot, version}
const EDGE_KEYS = "doorAccessEdgeKeys"; // per-edge audit signing PUBLIC key {_id:edgeId, pubSpki, updatedAt}
const POLICY_ID = "policy:door-access-controller"; // single well-known doc

let indexesEnsured = false;

async function database() {
  return db.connect();
}

async function cards() {
  const col = (await database()).collection(CARDS);
  if (!indexesEnsured) {
    try {
      await col.createIndex({ bi: 1 }, { unique: true });
      await col.createIndex({ userID: 1 });
      await (await database()).collection(DOORS).createIndex({ doorId: 1 }, { unique: true });
      indexesEnsured = true;
    } catch {
      // best-effort; a race just means another worker made them. Uniqueness still holds.
    }
  }
  return col;
}

// --- cards ---
/** @param {string} bi blind index @returns {Promise<object|null>} */
export async function findCardByBlindIndex(bi) {
  return (await cards()).findOne({ bi });
}

/** Upsert a member's card by blind index (re-pairing replaces the previous code). */
export async function upsertCard(doc) {
  const col = await cards();
  await col.updateOne({ bi: doc.bi }, { $set: doc }, { upsert: true });
  return doc;
}

/** Revoke (soft) all of a member's cards — used on suspension. @param {string} userID */
export async function revokeCardsByUserID(userID) {
  const col = await cards();
  await col.updateMany({ userID }, { $set: { status: "revoked", updatedAt: new Date().toISOString() } });
}

/** Hard-delete a member's cards — used on erasure/deletion. @param {string} userID */
export async function deleteCardsByUserID(userID) {
  const col = await cards();
  await col.deleteMany({ userID });
}

/** @returns {Promise<object[]>} admin listing (never returns plaintext — codes are encrypted) */
export async function listCards(filter = {}, limit = 500) {
  return (await cards()).find(filter).sort({ createdAt: -1 }).limit(limit).toArray();
}

// --- doors ---
/** @param {string} doorId @returns {Promise<object|null>} */
export async function findDoor(doorId) {
  await cards(); // ensure indexes
  return (await database()).collection(DOORS).findOne({ doorId });
}

export async function upsertDoor(doc) {
  await cards();
  await (await database()).collection(DOORS).updateOne({ doorId: doc.doorId }, { $set: doc }, { upsert: true });
  return doc;
}

export async function listDoors() {
  await cards();
  return (await database()).collection(DOORS).find({}).sort({ doorId: 1 }).toArray();
}

// --- policy (single doc) ---
/** @returns {Promise<{rules:object[], accountOverrides:object}>} the policy (empty if unset) */
export async function getPolicyDoc() {
  const doc = await (await database()).collection(POLICY).findOne({ _id: POLICY_ID });
  return doc ? { rules: doc.rules || [], accountOverrides: doc.accountOverrides || {} } : { ...EMPTY_POLICY };
}

/** Replace the policy doc. @param {{rules:object[], accountOverrides:object}} policy */
export async function savePolicyDoc(policy) {
  await (await database())
    .collection(POLICY)
    .updateOne(
      { _id: POLICY_ID },
      { $set: { rules: policy.rules || [], accountOverrides: policy.accountOverrides || {}, updatedAt: new Date().toISOString() } },
      { upsert: true }
    );
}

// --- envelope version counter (per door; monotonic, survives restart — anti-rollback F5) ---
/**
 * Atomically increment and return the next envelope version for a door. Strictly monotonic per
 * doorId (a persisted counter, NOT wall-clock / not a constant — door-controller-wifi.md §2 F5).
 * @param {string} doorId @returns {Promise<number>}
 */
export async function nextEnvelopeVersion(doorId) {
  await cards(); // ensure connection
  const col = (await database()).collection(COUNTERS);
  const doc = await col.findOneAndUpdate(
    { _id: `env:${doorId}` },
    { $inc: { version: 1 } },
    { upsert: true, returnDocument: "after" }
  );
  // mongodb driver v6+ returns the updated document directly (no {value} wrapper).
  if (!doc || typeof doc.version !== "number") throw new Error(`nextEnvelopeVersion failed for ${doorId}`);
  return doc.version;
}

/**
 * Load an edge's audit anchor + its optimistic-concurrency version. Missing → an empty anchor at
 * version 0 (so the first CAS upserts). Returns { anchor:{boots,currentBoot}, version }.
 */
export async function getAuditAnchor(edgeId) {
  await cards(); // ensure connection
  const doc = await (await database()).collection(ANCHORS).findOne({ _id: edgeId });
  if (!doc) return { anchor: { boots: {}, currentBoot: null }, version: 0 };
  return { anchor: { boots: doc.boots || {}, currentBoot: doc.currentBoot ?? null }, version: doc.version || 0 };
}

/**
 * Compare-and-set the edge's anchor: write only if the stored version still equals `expectedVersion`
 * (no lost update from a concurrent ingest — S6-a review). Returns true on success, false on a version
 * conflict (caller reloads + retries). Never advances on a stale read.
 */
export async function casAuditAnchor(edgeId, expectedVersion, anchor) {
  await cards();
  const col = (await database()).collection(ANCHORS);
  try {
    if (expectedVersion === 0) {
      // first write for this edge — insert (unique _id makes a concurrent double-insert fail → false)
      await col.insertOne({ _id: edgeId, boots: anchor.boots, currentBoot: anchor.currentBoot, version: 1 });
      return true;
    }
    const r = await col.updateOne(
      { _id: edgeId, version: expectedVersion }, // CAS guard
      { $set: { boots: anchor.boots, currentBoot: anchor.currentBoot }, $inc: { version: 1 } }
    );
    return r.modifiedCount === 1;
  } catch (e) {
    if (e && e.code === 11000) return false; // duplicate key on a concurrent first insert → conflict
    throw e;
  }
}

/**
 * The edge's REGISTERED audit-signing public key (SPKI DER, base64), or null if the edge was never
 * provisioned. Registration is an out-of-band admin/genesis action — NOT trust-on-first-use — so the
 * ingest path fails closed for an unknown edge (a relaying broker can't self-register a forged key).
 * @param {string} edgeId @returns {Promise<string|null>}
 */
export async function getEdgeSigningKey(edgeId) {
  await cards(); // ensure connection
  const doc = await (await database()).collection(EDGE_KEYS).findOne({ _id: edgeId });
  return doc && typeof doc.pubSpki === "string" ? doc.pubSpki : null;
}

/**
 * Register (or rotate) an edge's audit-signing public key. Admin/provisioning only — the caller still
 * enforces AUTHORIZATION + genesis/reflash binding (#151, S6-b-a2). Storing a new key re-anchors trust
 * for that edge, so this is a security-critical mutation: it self-validates its inputs as defense in
 * depth (never trust a future caller to be safe — SEC #170 F2). `edgeId` must be a safe Mongo `_id`
 * (no `$`/`.`/reserved key → operator injection / poisoned id) and `pubSpki` must be a real Ed25519 SPKI
 * (a malformed stored key would silently turn every future batch from that edge into a bad-signature).
 * @param {string} edgeId @param {string} pubSpki SPKI DER, base64
 * @throws {Error} on an unsafe edgeId or a non-Ed25519 / malformed public key
 */
export async function registerEdgeSigningKey(edgeId, pubSpki) {
  if (typeof edgeId !== "string" || edgeId.length === 0 || edgeId.length > 128
    || edgeId.startsWith("$") || edgeId.includes(".") || edgeId === "__proto__"
    || edgeId === "constructor" || edgeId === "prototype") {
    throw new Error("registerEdgeSigningKey: unsafe edgeId");
  }
  if (typeof pubSpki !== "string" || pubSpki.length === 0) throw new Error("registerEdgeSigningKey: missing pubSpki");
  try {
    const key = crypto.createPublicKey({ key: Buffer.from(pubSpki, "base64"), format: "der", type: "spki" });
    if (key.asymmetricKeyType !== "ed25519") throw new Error("not Ed25519");
  } catch {
    throw new Error("registerEdgeSigningKey: pubSpki is not a valid Ed25519 SPKI key");
  }
  await cards();
  await (await database())
    .collection(EDGE_KEYS)
    .updateOne({ _id: edgeId }, { $set: { pubSpki, updatedAt: new Date().toISOString() } }, { upsert: true });
}

/** List all registered edge signing keys (raw docs — the service sanitizes to a fingerprint for the UI). */
export async function listEdgeKeys() {
  await cards();
  return (await database()).collection(EDGE_KEYS).find({}).sort({ _id: 1 }).toArray();
}

const Model = {
  findCardByBlindIndex,
  upsertCard,
  nextEnvelopeVersion,
  revokeCardsByUserID,
  deleteCardsByUserID,
  listCards,
  findDoor,
  upsertDoor,
  listDoors,
  getPolicyDoc,
  savePolicyDoc,
  getAuditAnchor,
  casAuditAnchor,
  getEdgeSigningKey,
  registerEdgeSigningKey,
  listEdgeKeys,
};

export default Model;
