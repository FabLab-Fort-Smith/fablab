// Persistence for the door-access addon — the ONLY file here that touches the DB
// (the-lab/CLAUDE.md §4). Three collections: encrypted cards, the door registry, and
// a single access-policy document. Card codes are stored only as GCM ciphertext + a
// unique blind index (cardCrypto.js); this file never sees a plaintext code.

import { db } from "@/lib/database";
import { EMPTY_POLICY } from "./class";

const CARDS = "doorAccessCards";
const DOORS = "doorAccessDoors";
const POLICY = "doorAccessPolicy";
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

const Model = {
  findCardByBlindIndex,
  upsertCard,
  revokeCardsByUserID,
  deleteCardsByUserID,
  listCards,
  findDoor,
  upsertDoor,
  listDoors,
  getPolicyDoc,
  savePolicyDoc,
};

export default Model;
