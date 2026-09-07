import { db } from '@/lib/database';
import { v4 as uuidv4 } from 'uuid';
import { stripMongoOperators } from '@/lib/mongoSanitize';

const getCollection = async () => {
    const instance = await db.connect();
    return instance.collection('repairs');
};

// A repair's business key is a string `repair-<uuid>` (see createRepair), NOT a
// Mongo ObjectId. Pin the shape so an untrusted/hostile value (e.g. a
// `{ $gt: "" }` operator object arriving as the filter) can never reach Mongo as
// a query value — mirrors the repair-notifications addon's guard
// (CWE-943 NoSQL injection / BOLA filter validation).
export const REPAIR_ID_RE = /^repair-[a-fA-F0-9-]{8,64}$/;

/**
 * Whether a value is a well-formed repair business key (`repair-<uuid>`).
 * @param {unknown} id
 * @returns {boolean}
 */
export const isValidRepairID = (id) => typeof id === 'string' && REPAIR_ID_RE.test(id);

// The repair lifecycle states (mirrors the admin queue UI STATUS_OPTIONS). Any
// value outside this set is rejected before it can be persisted.
export const REPAIR_STATUSES = Object.freeze(['pending', 'in_progress', 'completed', 'cancelled']);

/**
 * Whether a value is a recognised repair status.
 * @param {unknown} s
 * @returns {boolean}
 */
export const isValidStatus = (s) => typeof s === 'string' && REPAIR_STATUSES.includes(s);

// Fields a staff/admin caller may legitimately set on an existing repair — the
// mass-assignment allow-list (CWE-915). Deliberately EXCLUDES the requester's
// submitted identity/contact PII (name, email, phone, deviceType,
// issueDescription, contactMethod), the immutable business key (repairID/_id),
// and server-managed timestamps (createdAt, updatedAt): none of those are
// client-writable through the update path. Only the repair *workflow* fields
// (lifecycle status, internal staff notes, assignment) are bindable.
export const REPAIR_UPDATABLE_FIELDS = Object.freeze(['status', 'notes', 'assignedTo']);

/**
 * Reduce a raw client body to the allow-listed, operator-free set of fields a
 * repair update may set. Any key not in {@link REPAIR_UPDATABLE_FIELDS}, plus
 * every `$`-prefixed (Mongo operator) key, is dropped — so a crafted body can
 * never mass-assign privileged or immutable fields, nor inject query operators.
 * @param {Object} [rawUpdate] - the client-supplied update body
 * @returns {Object} the sanitized update safe to persist
 */
export const sanitizeRepairUpdate = (rawUpdate = {}) => {
    const update = {};
    if (!rawUpdate || typeof rawUpdate !== 'object' || Array.isArray(rawUpdate)) return update;
    for (const field of REPAIR_UPDATABLE_FIELDS) {
        if (!Object.prototype.hasOwnProperty.call(rawUpdate, field)) continue;
        update[field] = stripMongoOperators(rawUpdate[field]);
    }
    return update;
};

export default class RepairModel {
    static async createRepair(data) {
        const repairs = await getCollection();
        const doc = { ...data, repairID: `repair-${uuidv4()}`, status: 'pending', createdAt: new Date() };
        await repairs.insertOne(doc);
        return doc;
    }

    static async getAllRepairs(filter = {}, skip = 0, limit = 50) {
        const repairs = await getCollection();
        return repairs.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray();
    }

    /**
     * Update an existing repair by its business key. Fails closed on a malformed
     * id (so an untrusted value can never become a Mongo filter — BOLA/NoSQL
     * guard) and, as defense in depth, re-applies the {@link sanitizeRepairUpdate}
     * allow-list even if the caller passed a raw body (CWE-915 mass-assignment).
     * The HTTP edge is still responsible for authenticating + authorizing the
     * actor before calling this.
     *
     * @param {string} repairID - the repair's business key (`repair-<uuid>`)
     * @param {Object} update - the (already edge-validated) update fields
     * @returns {Promise<Object|null>} the updated doc, or null if not found / invalid id / nothing to set
     * @throws {Error} with `code: 'INVALID_STATUS'` if a non-enum status is supplied
     */
    static async updateRepair(repairID, update) {
        if (!isValidRepairID(repairID)) return null;
        const safe = sanitizeRepairUpdate(update);
        if ('status' in safe && !isValidStatus(safe.status)) {
            const err = new Error('Invalid repair status');
            err.code = 'INVALID_STATUS';
            throw err;
        }
        if (Object.keys(safe).length === 0) return null;
        const repairs = await getCollection();
        const result = await repairs.findOneAndUpdate(
            { repairID },
            { $set: { ...safe, updatedAt: new Date() } },
            { returnDocument: 'after' }
        );
        return result;
    }

    static async countRepairs(filter = {}) {
        const repairs = await getCollection();
        return repairs.countDocuments(filter);
    }
}
