// Persistence access for the repair-notifications addon. The ONLY file in this
// plugin that touches the database (layering: the-lab/CLAUDE.md §4).
//
// The addon reacts to the ID-only `repair.created` / `repair.updated` events, so it
// must re-read the repair itself. There is no published repair service to call yet,
// so it reads the shared `repairs` collection READ-ONLY and projects only the
// fields a notification needs. It never writes, and never imports the core repair
// feature's model class. If/when a repair service is published, this should call it
// instead (the ideal boundary).

import { db } from "@/lib/database";

// A repair's business key is a string `repair-<uuid>` (see repairs/model.js), NOT a
// Mongo ObjectId. Pin the shape so an untrusted/hostile value (e.g. a `{ $gt: "" }`
// operator object) can never reach Mongo as a filter — we require a string that
// matches this exact pattern before it ever becomes a query value (CWE-943/NoSQL).
const REPAIR_ID_RE = /^repair-[a-fA-F0-9-]{8,64}$/;

/**
 * Fetch a single repair by its `repairID`, projected to only the fields a
 * notification needs. Returns null for a missing/invalid id (fail closed — the
 * caller then no-ops rather than acting on garbage). Validates the id as a
 * well-formed `repair-<uuid>` string so an untrusted value can never reach Mongo as
 * an operator object (NoSQL injection).
 *
 * @param {string} repairID - the repair's business key, as a string
 * @returns {Promise<{repairID:string, name?:string, email?:string, deviceType?:string, issueDescription?:string, contactMethod?:string, phone?:string, status?:string, createdAt?:Date}|null>}
 */
export async function getRepairById(repairID) {
  if (typeof repairID !== "string" || !REPAIR_ID_RE.test(repairID)) return null;
  const instance = await db.connect();
  return instance.collection("repairs").findOne(
    { repairID },
    {
      projection: {
        repairID: 1,
        name: 1,
        email: 1,
        deviceType: 1,
        issueDescription: 1,
        contactMethod: 1,
        phone: 1,
        status: 1,
        createdAt: 1,
      },
    }
  );
}

const Model = { getRepairById };
export default Model;
