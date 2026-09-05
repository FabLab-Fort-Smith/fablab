// Admin member-core service (AC-3). Dedicated, validated, audited seam for the two most sensitive
// member mutations the admin UI performs: role change and membership-status change (suspend/reactivate).
//
// Why a seam: the generic PUT /api/v1/users path accepts arbitrary admin-supplied fields with no
// value validation and no audit trail. These two operations change privilege (role) and access
// (suspended) — they get an explicit allow-list, before→after auditing, and self-lockout guards here.

import UserService from "@/app/api/v1/users/service";
import { auditLog } from "@/lib/audit";

/** Allowed account roles (the app recognizes exactly these; admin is the only privileged role). */
export const ROLES = Object.freeze(["user", "admin"]);

/** Allowed membership lifecycle states (mirrors the member class + Square-driven states). */
export const MEMBER_STATUSES = Object.freeze([
  "registered", "applicant", "contacted", "onboarding", "probation", "active", "suspended", "declined",
]);

/** Validation error the routes map to HTTP 400. */
export class MemberValidationError extends Error {
  constructor(message) { super(message); this.name = "MemberValidationError"; this.status = 400; }
}
/** Not-found error the routes map to HTTP 404. */
export class MemberNotFoundError extends Error {
  constructor(message = "member not found") { super(message); this.name = "MemberNotFoundError"; this.status = 404; }
}

// Fetch a member as an admin actor (decrypted/full, sensitive stripped). Throws 404 if absent.
async function loadMember(userID, actor) {
  const user = await UserService.getUserByQuery({ userID }, actor);
  if (!user || !user.userID) throw new MemberNotFoundError();
  return user;
}

/**
 * Change a member's account role. Validates the target role, blocks an admin from changing their OWN
 * role (self-lockout guard), and audits before→after.
 * @param {{userID:string, role:string, actor:{userID:string, role:string}}} args
 * @returns {Promise<{userID:string, role:string, previousRole:string}>}
 */
export async function changeRole({ userID, role, actor } = {}) {
  if (typeof userID !== "string" || !userID.trim()) throw new MemberValidationError("userID is required");
  if (!ROLES.includes(role)) throw new MemberValidationError(`role must be one of: ${ROLES.join(", ")}`);
  if (actor?.userID === userID) throw new MemberValidationError("you cannot change your own role");

  const before = await loadMember(userID, actor);
  const previousRole = before.role || "user";
  if (previousRole !== role) {
    await UserService.updateUser({ userID }, { role }, actor);
  }
  auditLog("admin.member.role.change", {
    actor: actor?.userID || "admin", target: userID, before: previousRole, after: role,
    outcome: previousRole === role ? "noop" : "success",
  });
  return { userID, role, previousRole };
}

/**
 * Set a member's membership status (covers suspend = "suspended" and reactivate = "active"/"probation").
 * Validates against the allow-list and audits before→after.
 * @param {{userID:string, status:string, actor:{userID:string, role:string}}} args
 * @returns {Promise<{userID:string, status:string, previousStatus:(string|null)}>}
 */
export async function setMemberStatus({ userID, status, actor } = {}) {
  if (typeof userID !== "string" || !userID.trim()) throw new MemberValidationError("userID is required");
  if (!MEMBER_STATUSES.includes(status)) {
    throw new MemberValidationError(`status must be one of: ${MEMBER_STATUSES.join(", ")}`);
  }

  const before = await loadMember(userID, actor);
  const previousStatus = before.membership?.status ?? null;
  if (previousStatus !== status) {
    await UserService.updateUser({ userID }, { membership: { status } }, actor);
  }
  auditLog("admin.member.status.change", {
    actor: actor?.userID || "admin", target: userID, before: previousStatus, after: status,
    outcome: previousStatus === status ? "noop" : "success",
  });
  return { userID, status, previousStatus };
}

const MembersAdminService = { changeRole, setMemberStatus, ROLES, MEMBER_STATUSES, MemberValidationError, MemberNotFoundError };
export default MembersAdminService;
