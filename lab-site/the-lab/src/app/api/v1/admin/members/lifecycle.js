// Admin member-lifecycle service (AC-4): provider unlink, force password-reset, GDPR purge (erasure),
// and data export (right of access) — all validated + audited.
//
// Security/compliance notes:
//   - Purge is IRREVERSIBLE. It hard-deletes the user doc (firing MEMBER_DELETED, which cleans up the
//     mailbox + door-card plugins) and cascades across the member-referencing collections: personal
//     activity is deleted; financial/community records are ANONYMIZED (linkage + Discord PII removed,
//     the row retained for accounting/history). Every purge is audited with per-collection counts.
//   - Unlink refuses to remove a member's ONLY remaining sign-in method (fail-closed against lockout).
//   - Export decrypts the subject's own PII for the access request; the route audits it.

import UserService from "@/app/api/v1/users/service";
import AuthService from "@/app/api/auth/[...nextauth]/service";
import { authMethodsOf } from "@/lib/authMethods";
import { db } from "@/lib/database";
import { auditLog } from "@/lib/audit";

export const PROVIDERS = Object.freeze(["google", "discord"]);

// Replaces a member's id on retained (anonymized) records so linkage is severed but the row survives.
export const PURGE_TOMBSTONE = "deleted-member";

/** Collections purged by DELETING every row that references the member (personal activity/content). */
const PURGE_DELETE = Object.freeze([
  { name: "notifications", fields: ["userID"] },
  { name: "checkins", fields: ["userID"] },
  { name: "arcade_sessions", fields: ["userID"] },
  { name: "arcade_jackpot", fields: ["userID"] },
  { name: "holodeck_completions", fields: ["userID"] },
  { name: "portfolio", fields: ["userID"] },
  { name: "bounty_ideas", fields: ["userID", "author"] },
]);

/** Collections purged by ANONYMIZING: retain the row, tombstone the id refs, null the Discord PII. */
const PURGE_ANONYMIZE = Object.freeze([
  { name: "transactions", idFields: ["userID", "senderId", "receiverId"], piiFields: ["discordId", "receiverDiscordId"] },
  { name: "bounties", idFields: ["userID", "assignedTo"], piiFields: [] },
  { name: "bugs", idFields: ["userID", "author"], piiFields: [] },
]);

export class LifecycleValidationError extends Error {
  constructor(message) { super(message); this.name = "LifecycleValidationError"; this.status = 400; }
}
export class MemberNotFoundError extends Error {
  constructor(message = "member not found") { super(message); this.name = "MemberNotFoundError"; this.status = 404; }
}

async function loadMember(userID, actor) {
  const user = await UserService.getUserByQuery({ userID }, actor);
  if (!user || !user.userID) throw new MemberNotFoundError();
  return user;
}

/**
 * Unlink an OAuth provider from a member (admin). Refuses if it would remove their last sign-in method.
 * @param {{userID:string, provider:string, actor:object}} args provider ∈ {google, discord}
 */
export async function unlinkProvider({ userID, provider, actor } = {}) {
  if (typeof userID !== "string" || !userID.trim()) throw new LifecycleValidationError("userID is required");
  if (!PROVIDERS.includes(provider)) throw new LifecycleValidationError(`provider must be one of: ${PROVIDERS.join(", ")}`);

  const before = await loadMember(userID, actor);
  const methods = authMethodsOf(before);
  const linked = provider === "google" ? methods.hasGoogle : methods.hasDiscord;
  if (!linked) throw new LifecycleValidationError(`member has no ${provider} account linked`);
  // Fail-closed: never strip the only way in.
  if (methods.methodCount <= 1) {
    throw new LifecycleValidationError(`cannot unlink ${provider}: it is the member's only sign-in method`);
  }

  const update = provider === "google" ? { googleId: "" } : { discordId: "", discordHandle: "" };
  if (before.provider === provider) update.provider = "local";
  await UserService.updateUser({ userID }, update, actor);

  auditLog("admin.member.unlink", { actor: actor?.userID || "admin", target: userID, provider, outcome: "success" });
  return { userID, provider, unlinked: true };
}

/**
 * Trigger a password-reset email for a member (admin-initiated), reusing the self-service reset machinery.
 * @param {{userID:string, actor:object}} args
 */
export async function forcePasswordReset({ userID, actor } = {}) {
  if (typeof userID !== "string" || !userID.trim()) throw new LifecycleValidationError("userID is required");
  const member = await loadMember(userID, actor);
  const email = member.email; // getUserByQuery returns decrypted email for an admin actor
  if (!email) throw new LifecycleValidationError("member has no email on file");

  await AuthService.requestPasswordReset(email);
  auditLog("admin.member.password_reset", { actor: actor?.userID || "admin", target: userID, outcome: "sent" });
  return { userID, sent: true };
}

/**
 * GDPR purge — irreversibly erase a member: cascade-scrub related collections, then hard-delete the doc.
 * @param {{userID:string, actor:object}} args
 * @returns {Promise<{userID:string, deleted:object, anonymized:object}>} per-collection counts
 */
export async function purgeMember({ userID, actor } = {}) {
  if (typeof userID !== "string" || !userID.trim()) throw new LifecycleValidationError("userID is required");
  await loadMember(userID, actor); // 404 if absent

  const instance = await db.connect();
  const deleted = {};
  const anonymized = {};

  for (const c of PURGE_DELETE) {
    const col = instance.collection(c.name);
    const res = await col.deleteMany({ $or: c.fields.map((f) => ({ [f]: userID })) });
    deleted[c.name] = res.deletedCount || 0;
  }

  for (const c of PURGE_ANONYMIZE) {
    const col = instance.collection(c.name);
    let count = 0;
    // Null Discord PII on any row this member is part of (do this before tombstoning the id refs).
    for (const pii of c.piiFields) {
      await col.updateMany({ $or: c.idFields.map((f) => ({ [f]: userID })) }, { $set: { [pii]: null } });
    }
    for (const f of c.idFields) {
      const res = await col.updateMany({ [f]: userID }, { $set: { [f]: PURGE_TOMBSTONE } });
      count += res.modifiedCount || 0;
    }
    anonymized[c.name] = count;
  }

  // Hard-delete the user doc last — fires MEMBER_DELETED (mailbox + door-card plugin cleanup).
  await UserService.deleteUser({ userID });

  auditLog("admin.member.purge", { actor: actor?.userID || "admin", target: userID, deleted, anonymized, outcome: "success" });
  return { userID, deleted, anonymized };
}

/**
 * Export all data held about a member (GDPR right of access). Decrypts the subject's own PII; omits
 * credential material (password hash, reset tokens).
 * @param {{userID:string, actor:object}} args
 * @returns {Promise<object>} the export document
 */
export async function exportMember({ userID, actor } = {}) {
  if (typeof userID !== "string" || !userID.trim()) throw new LifecycleValidationError("userID is required");
  const member = await loadMember(userID, actor);

  // Strip credential/token material from the profile snapshot; email/phone are already decrypted for admin.
  const { password, passwordResetTokenHash, passwordResetExpires, verificationToken, ...profile } = member;

  const instance = await db.connect();
  const related = {};
  const gather = async (name, fields) => {
    const col = instance.collection(name);
    related[name] = await col.find({ $or: fields.map((f) => ({ [f]: userID })) }).toArray();
  };
  for (const c of PURGE_DELETE) await gather(c.name, c.fields);
  for (const c of PURGE_ANONYMIZE) await gather(c.name, c.idFields);

  auditLog("admin.member.export", { actor: actor?.userID || "admin", target: userID, outcome: "success" });
  return { exportedAt: null, userID, profile, related };
}

const LifecycleService = {
  unlinkProvider, forcePasswordReset, purgeMember, exportMember,
  PROVIDERS, PURGE_TOMBSTONE, LifecycleValidationError, MemberNotFoundError,
};
export default LifecycleService;
