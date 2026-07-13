// Persistence for member↔mailbox mappings. The ONLY file in this plugin that
// touches the database (layering: the-lab/CLAUDE.md §4). Unique indexes on
// `address` and `localPart` are the DB-level guard against double-claim races.

import { db } from "@/lib/database";

const COLLECTION = "memberMailboxes";
let indexesEnsured = false;

async function getCollection() {
  const database = await db.connect();
  const col = database.collection(COLLECTION);
  if (!indexesEnsured) {
    try {
      await col.createIndex({ address: 1 }, { unique: true });
      await col.createIndex({ localPart: 1 }, { unique: true });
      await col.createIndex({ userID: 1 });
      indexesEnsured = true;
    } catch {
      // Index creation is best-effort here; a race just means another worker
      // created them. Uniqueness is still enforced by Mongo.
    }
  }
  return col;
}

/** @param {string} userID @returns {Promise<object[]>} that member's mailboxes */
export async function findByUserID(userID) {
  const col = await getCollection();
  return col.find({ userID }).toArray();
}

/** @param {string} localPart @returns {Promise<object|null>} */
export async function findByLocalPart(localPart) {
  const col = await getCollection();
  return col.findOne({ localPart });
}

/** @param {object} doc @returns {Promise<object>} the inserted doc */
export async function insertMailbox(doc) {
  const col = await getCollection();
  await col.insertOne(doc);
  return doc;
}

/** Count a member's non-revoked mailboxes. @param {string} userID */
export async function countActiveForUser(userID) {
  const col = await getCollection();
  return col.countDocuments({ userID, status: { $ne: "revoked" } });
}

/**
 * A member's non-revoked mailboxes, oldest first (deterministic tiebreak on _id).
 * Used for race-safe cap enforcement: concurrent claims keep the earliest N.
 * @param {string} userID
 */
export async function findActiveByUserSorted(userID) {
  const col = await getCollection();
  return col.find({ userID, status: { $ne: "revoked" } }).sort({ createdAt: 1, _id: 1 }).toArray();
}

/** Delete a single mailbox record by its (unique) local part. @param {string} localPart */
export async function deleteByLocalPart(localPart) {
  const col = await getCollection();
  await col.deleteOne({ localPart });
}

/** @param {string} userID @param {string} status */
export async function setStatusByUserID(userID, status) {
  const col = await getCollection();
  await col.updateMany(
    { userID },
    { $set: { status, updatedAt: new Date().toISOString() } }
  );
}

/** Hard-delete a member's mailbox records (used on erasure). @param {string} userID */
export async function removeByUserID(userID) {
  const col = await getCollection();
  await col.deleteMany({ userID });
}

/** List mailboxes (admin). @returns {Promise<object[]>} */
export async function listAll(filter = {}, skip = 0, limit = 200) {
  const col = await getCollection();
  let cursor = col.find(filter).sort({ createdAt: -1 });
  if (skip > 0) cursor = cursor.skip(skip);
  if (limit > 0) cursor = cursor.limit(limit);
  return cursor.toArray();
}

export default {
  findByUserID,
  findByLocalPart,
  insertMailbox,
  countActiveForUser,
  findActiveByUserSorted,
  deleteByLocalPart,
  setStatusByUserID,
  removeByUserID,
  listAll,
};
