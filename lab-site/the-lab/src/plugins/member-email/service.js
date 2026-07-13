// Business logic + authorization for member email provisioning. Member-facing
// (availability / claim / own) and admin-facing (list / suspend / reset /
// delete). Talks to members through the PUBLISHED UserService (never UserModel)
// and to PurelyMail through the src/lib/purelymail adapter. Every mutation is
// audited; the recovery email (PII) is used in-memory only and never logged.

import UserService from "@/app/api/v1/users/service";
import * as purelymail from "@/lib/purelymail";
import { auditLog } from "@/lib/audit";
import { assertPermission } from "@/lib/plugins/permissions";
import { validateLocalPart } from "./reserved";
import MemberMailbox from "./class";
import Model from "./model";
import { PERM_ADMIN } from "./config";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function err(status, message, code) {
  const e = new Error(message);
  e.status = status;
  if (code) e.code = code;
  return e;
}

/** Active-membership gate for claiming (mirrors access.js, minus the isPublic UX gate). */
function isActiveMember(user) {
  const m = user?.membership || {};
  return (
    ["active", "probation"].includes(m.status) ||
    m.isWaived === true ||
    m.subscriptionStatus === "ACTIVE" ||
    user?.subscriptionStatus === "ACTIVE"
  );
}

/** The member's current non-revoked mailbox, if any. */
async function currentMailbox(userID) {
  const boxes = await Model.findByUserID(userID);
  return boxes.find((b) => b.status !== "revoked") || null;
}

// ── Member-facing ──────────────────────────────────────────────────────────

/**
 * Is a local part available to this member? Member-gated + rate-limited at the
 * edge to bound enumeration.
 * @param {string} rawName
 * @param {{userID:string}} actor
 * @param {object} config
 * @returns {Promise<{available:boolean, reason?:string}>}
 */
export async function checkAvailability(rawName, actor, config) {
  const v = validateLocalPart(rawName, config.additionalReserved);
  if (!v.ok) return { available: false, reason: v.reason };
  if (await Model.findByLocalPart(v.localPart)) return { available: false, reason: "taken" };
  if (await purelymail.mailboxExists(v.localPart)) return { available: false, reason: "taken" };
  return { available: true };
}

/**
 * Claim a mailbox for the calling member.
 * @param {{localPart:string}} input
 * @param {{userID:string, role?:string}} actor
 * @param {object} config
 * @returns {Promise<{address:string, status:string}>}
 */
export async function claim(input, actor, config) {
  const v = validateLocalPart(input?.localPart, config.additionalReserved);
  if (!v.ok) throw err(400, `Invalid address (${v.reason})`);

  // Owner actor => getUserByQuery returns the DECRYPTED personal email.
  const member = await UserService.getUserByQuery({ userID: actor.userID }, actor);
  if (!member) throw err(404, "Member not found");
  if (!isActiveMember(member)) throw err(403, "Active membership required");

  const recoveryEmail = member.email;
  if (!recoveryEmail || !EMAIL_RE.test(recoveryEmail)) {
    throw err(400, "A verified personal email is required for account recovery");
  }

  if ((await Model.countActiveForUser(actor.userID)) >= config.maxMailboxesPerMember) {
    throw err(409, "Mailbox limit reached for this member");
  }

  const avail = await checkAvailability(v.localPart, actor, config);
  if (!avail.available) throw err(409, "That address is not available");

  // Spend guard — never provision when account credit is below the floor.
  let credit = 0;
  try {
    credit = await purelymail.checkCredit();
  } catch {
    throw err(503, "Mail provider unavailable");
  }
  if (credit < config.minAccountCredit) throw err(503, "Provisioning temporarily unavailable");

  const address = purelymail.fullAddress(v.localPart);
  try {
    await purelymail.createMailbox({ localPart: v.localPart, recoveryEmail });
  } catch (e) {
    auditLog("email.mailbox.provision_failed", {
      actor: { userID: actor.userID },
      target: { localPart: v.localPart },
      outcome: "error",
      reason: purelymail.purelyMailErrorDetail(e),
    });
    throw err(502, "Mailbox could not be created");
  }

  const doc = new MemberMailbox({
    userID: actor.userID,
    localPart: v.localPart,
    address,
    status: "active",
    createdBy: actor.userID,
  });
  try {
    await Model.insertMailbox(doc);
  } catch (e) {
    // Unique-index collision => someone claimed it in a race. Roll back the
    // just-created mailbox so we don't orphan a paid mailbox.
    if (e?.code === 11000) {
      try { await purelymail.deleteMailbox(v.localPart); } catch { /* best effort */ }
      throw err(409, "That address is not available");
    }
    throw e;
  }

  auditLog("email.mailbox.provisioned", {
    actor: { userID: actor.userID },
    target: { userID: actor.userID, localPart: v.localPart },
  });
  return { address, status: "active" };
}

/**
 * The caller's own mailbox (or null).
 * @param {{userID:string}} actor
 */
export async function getOwn(actor) {
  const box = await currentMailbox(actor.userID);
  if (!box) return { mailbox: null };
  return { mailbox: { address: box.address, localPart: box.localPart, status: box.status, createdAt: box.createdAt } };
}

// ── Admin-facing ─────────────────────────────────────────────────────────────

/** @param {{userID:string, role?:string}} actor */
export async function adminList(actor) {
  assertPermission(actor, PERM_ADMIN);
  const rows = await Model.listAll();
  return rows.map((b) => ({
    userID: b.userID,
    localPart: b.localPart,
    address: b.address,
    status: b.status,
    createdAt: b.createdAt,
  }));
}

/** @param {string} userID @param {{userID:string, role?:string}} actor */
export async function adminSuspend(userID, actor) {
  assertPermission(actor, PERM_ADMIN);
  const box = await currentMailbox(userID);
  if (!box) throw err(404, "No mailbox for that member");
  await purelymail.suspendMailbox(box.localPart);
  await Model.setStatusByUserID(userID, "suspended");
  auditLog("email.mailbox.suspended", { actor: { userID: actor.userID, role: actor.role }, target: { userID, localPart: box.localPart } });
  return { ok: true };
}

/** @param {string} userID @param {{userID:string, role?:string}} actor */
export async function adminReset(userID, actor) {
  assertPermission(actor, PERM_ADMIN);
  const box = await currentMailbox(userID);
  if (!box) throw err(404, "No mailbox for that member");
  await purelymail.resetMailbox(box.localPart);
  if (box.status === "suspended") await Model.setStatusByUserID(userID, "active");
  auditLog("email.mailbox.reset", { actor: { userID: actor.userID, role: actor.role }, target: { userID, localPart: box.localPart } });
  return { ok: true };
}

/** @param {string} userID @param {{userID:string, role?:string}} actor */
export async function adminDelete(userID, actor) {
  assertPermission(actor, PERM_ADMIN);
  const box = await currentMailbox(userID);
  if (!box) throw err(404, "No mailbox for that member");
  await purelymail.deleteMailbox(box.localPart);
  await Model.setStatusByUserID(userID, "revoked");
  auditLog("email.mailbox.deleted", { actor: { userID: actor.userID, role: actor.role }, target: { userID, localPart: box.localPart } });
  return { ok: true };
}

// ── Hook handlers (server-side, no actor) ────────────────────────────────────

/** Erasure hygiene: delete a member's mailbox(es) when the member is deleted. */
export async function onMemberDeleted({ userID }) {
  const boxes = await Model.findByUserID(userID);
  for (const box of boxes) {
    if (box.status !== "revoked") {
      try { await purelymail.deleteMailbox(box.localPart); } catch { /* best effort */ }
    }
  }
  await Model.removeByUserID(userID);
  auditLog("email.mailbox.erased", { target: { userID } });
}

/** Auto-suspend a member's mailbox when their membership is suspended. */
export async function onMembershipSuspended({ userID }) {
  const box = await currentMailbox(userID);
  if (!box || box.status !== "active") return;
  try { await purelymail.suspendMailbox(box.localPart); } catch { /* best effort */ }
  await Model.setStatusByUserID(userID, "suspended");
  auditLog("email.mailbox.auto_suspended", { target: { userID, localPart: box.localPart } });
}

export default {
  checkAvailability, claim, getOwn,
  adminList, adminSuspend, adminReset, adminDelete,
  onMemberDeleted, onMembershipSuspended,
};
