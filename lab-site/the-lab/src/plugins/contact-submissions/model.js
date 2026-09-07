// Persistence access for the contact-submissions addon. The ONLY file in this
// plugin that touches the database (layering: the-lab/CLAUDE.md §4).
//
// The addon reacts to the ID-only `contact.submitted` event, so it must re-read
// the submission itself. There is no published contact service to call yet, so it
// reads the shared contact-submissions collection READ-ONLY and projects only the
// fields a forward needs. It never writes, and never imports the core contact
// feature's model class. If/when a contact service is published, this should call
// it instead (the ideal boundary).

import { db } from "@/lib/database";
import { ObjectId } from "mongodb";

/**
 * Fetch a single contact submission by id, projected to only the fields the
 * forward needs. Returns null for a missing/invalid id (fail closed — the caller
 * then no-ops rather than acting on garbage). Validates the id as an ObjectId so
 * an untrusted/hostile value can never reach Mongo as an operator object.
 *
 * @param {string} id - the submission's ObjectId, as a string
 * @returns {Promise<{name:string, email:string, message:string, createdAt:Date}|null>}
 */
export async function getSubmissionById(id) {
  if (typeof id !== "string" || !ObjectId.isValid(id)) return null;
  const dbSubmissions = await db.dbContactSubmissions();
  return dbSubmissions.findOne(
    { _id: new ObjectId(id) },
    { projection: { name: 1, email: 1, message: 1, createdAt: 1 } }
  );
}

const Model = { getSubmissionById };
export default Model;
