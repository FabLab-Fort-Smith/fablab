// src/app/api/v1/users/access.js
//
// SEC-02 access-control policy for the user API. This is the single source of
// truth for: who counts as privileged, what a non-owner is allowed to *see*
// (the public-safe projection), and what a non-admin is allowed to *write* to
// their own record (the self-update sanitizer).
//
// The HTTP edge (route -> controller) authenticates the caller and passes the
// resulting `actor` down to the service. A `null`/`undefined` actor means a
// trusted server-side caller (webhooks, Discord callback, membership/Square
// flows that import UserService directly) and bypasses these client guards —
// untrusted input only ever enters through the controller, which always
// supplies an actor or returns 401 first.

/** @typedef {{ userID: string, role?: string }} Actor */

/** True only for the `admin` role (the single privileged role in this app). */
export const isAdmin = (actor) => actor?.role === "admin";

// ── Read surface ────────────────────────────────────────────────────────────

// Top-level fields safe to expose to anonymous / non-owner readers. Excludes
// all PII (email, phoneNumber), credentials (password), and integration IDs
// (discordId, googleId, squareID).
export const PUBLIC_USER_FIELDS = [
    "_id", "userID", "username", "firstName", "lastName", "image", "bio",
    "role", "boardPosition", "isPublic", "socials", "interests", "hobbies",
    "creatorType", "skills", "badges", "capturedFlags", "stake", "stakeHistory",
];

// membership sub-fields safe for public view (drives the active-member gate and
// the co-op/community badge). Everything else under membership — accessKey,
// subscription/Square IDs, sponsorship, volunteer logs, application answers,
// grace periods — stays private.
export const PUBLIC_MEMBERSHIP_FIELDS = ["status", "type", "isWaived", "subscriptionStatus"];

/**
 * Whether a record is visible to non-owners: the member opted into a public
 * profile and is an active member. Mirrors the gate the public profile page
 * applies client-side, enforced here so hidden/inactive records aren't served.
 */
export const isPublicActiveMember = (user) => {
    if (!user || user.isPublic === false) return false;
    const m = user.membership || {};
    return ["active", "probation"].includes(m.status)
        || m.isWaived === true
        || m.subscriptionStatus === "ACTIVE";
};

/**
 * Project a user record down to the public-safe field set. Used for anonymous
 * and non-owner reads so list/profile endpoints never leak PII or credentials.
 */
export const toPublicUser = (user) => {
    if (!user) return null;
    const out = {};
    for (const field of PUBLIC_USER_FIELDS) {
        if (user[field] !== undefined) out[field] = user[field];
    }
    if (user.membership && typeof user.membership === "object") {
        const m = {};
        for (const field of PUBLIC_MEMBERSHIP_FIELDS) {
            if (user.membership[field] !== undefined) m[field] = user.membership[field];
        }
        out.membership = m;
    }
    return out;
};

/**
 * Strip fields that must never appear in an HTTP response even to the owner or
 * an admin (the password hash, and the raw stored secrets). Email/phone are
 * decrypted by the service for owner/admin views and are intentionally kept.
 */
export const stripSensitive = (user) => {
    if (!user) return user;
    const { password, ...safe } = user;
    return safe;
};

// ── Write surface ─────────────────────────────────────────────────────────────

// Top-level fields a non-admin may set on their OWN record. Anything outside
// this set (role, status, stake, badges, capturedFlags, boardPosition, squareID,
// provider, …) is dropped for non-admins, closing the privilege-escalation path.
export const SELF_WRITABLE_FIELDS = new Set([
    "firstName", "lastName", "username", "phoneNumber",
    "bio", "image", "socials", "interests", "hobbies", "creatorType", "skills",
    "cityChange", "knownMembers", "questions",
    "privacy", "notificationPreferences",
    "discordId", "discordHandle", "discordLinked",
    "isPublic",
    "membership", // special-cased — see sanitizeMembershipForSelf
]);

// membership sub-fields a non-admin may change on their own record: submitting
// an application and logging volunteer hours. Access-granting fields (status,
// isWaived, accessKey, subscription/Square, sponsorship, type, grace period,
// review state) are server-controlled and preserved from the stored record.
const SELF_WRITABLE_MEMBERSHIP_FIELDS = new Set(["applicationDate", "volunteerLog"]);

/** Recursively drop `$`-prefixed keys so a client body can't inject Mongo operators. */
export const stripOperatorKeys = (value) => {
    if (Array.isArray(value)) return value.map(stripOperatorKeys);
    if (value && typeof value === "object" && !(value instanceof Date)) {
        const out = {};
        for (const [k, v] of Object.entries(value)) {
            if (k.startsWith("$")) continue;
            out[k] = stripOperatorKeys(v);
        }
        return out;
    }
    return value;
};

/**
 * Reconcile a client-supplied volunteer log against the stored one so a member
 * can't self-approve hours: existing entries keep their server-side status and
 * verifier, and any new entry is forced to `pending`.
 */
const reconcileVolunteerLog = (incoming, current = []) => {
    if (!Array.isArray(incoming)) return current;
    const byId = new Map((current || []).map((l) => [l.id, l]));
    return incoming.map((entry) => {
        const existing = byId.get(entry?.id);
        if (existing) {
            return { ...entry, status: existing.status, verifiedBy: existing.verifiedBy ?? null };
        }
        return { ...entry, status: "pending", verifiedBy: null };
    });
};

/**
 * Rebuild the membership patch for a non-admin self-update: start from the
 * trusted stored membership and let through only the self-writable sub-fields.
 */
const sanitizeMembershipForSelf = (incoming, current = {}) => {
    const safe = { ...(current || {}) };
    if (incoming && typeof incoming === "object") {
        // Allow setting the application date once; never let the member rewrite it.
        if (SELF_WRITABLE_MEMBERSHIP_FIELDS.has("applicationDate")
            && incoming.applicationDate && !safe.applicationDate) {
            safe.applicationDate = incoming.applicationDate;
        }
        if (Array.isArray(incoming.volunteerLog)) {
            safe.volunteerLog = reconcileVolunteerLog(incoming.volunteerLog, current?.volunteerLog);
        }
    }
    return safe;
};

/**
 * Filter a raw client update down to what a non-admin may set on their own
 * record. Drops non-whitelisted and `$`-prefixed keys, and rebuilds membership
 * from the stored record so access-granting fields can't be forged.
 *
 * @param {Object} rawUpdate - the client-supplied update body
 * @param {Object} currentUser - the stored user record (for membership merge)
 * @returns {Object} the sanitized update safe to persist
 */
export const sanitizeSelfUpdate = (rawUpdate = {}, currentUser = {}) => {
    const update = {};
    for (const [key, value] of Object.entries(rawUpdate)) {
        if (key.startsWith("$") || key === "_id") continue;
        if (!SELF_WRITABLE_FIELDS.has(key)) continue;
        if (key === "membership") {
            update.membership = sanitizeMembershipForSelf(value, currentUser?.membership);
        } else {
            update[key] = stripOperatorKeys(value);
        }
    }
    return update;
};
