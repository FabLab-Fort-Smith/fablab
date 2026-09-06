// AC-4 member-lifecycle service: unlink (lockout guard), force-reset, GDPR purge (cascade), export.

jest.mock("@/app/api/v1/users/service", () => ({ __esModule: true, default: { getUserByQuery: jest.fn(), updateUser: jest.fn(), deleteUser: jest.fn() } }));
jest.mock("@/app/api/auth/[...nextauth]/service", () => ({ __esModule: true, default: { requestPasswordReset: jest.fn() } }));
jest.mock("@/lib/audit", () => ({ __esModule: true, auditLog: jest.fn() }));
jest.mock("@/lib/database", () => ({ __esModule: true, db: { connect: jest.fn() } }));

import { unlinkProvider, forcePasswordReset, purgeMember, exportMember, LifecycleValidationError, MemberNotFoundError, PURGE_TOMBSTONE } from "@/app/api/v1/admin/members/lifecycle";
import UserService from "@/app/api/v1/users/service";
import AuthService from "@/app/api/auth/[...nextauth]/service";
import { auditLog } from "@/lib/audit";
import { db } from "@/lib/database";

const ADMIN = { userID: "admin-1", role: "admin" };
const member = (over = {}) => ({ userID: "u1", email: "u1@x.com", provider: "local", password: "$2b$hash", googleId: "g1", discordId: "d1", discordHandle: "u#1", ...over });

// Fake Mongo instance: every collection records calls; delete/update return counts, find→toArray [].
function fakeInstance() {
  const cols = {};
  const instance = {
    collection: jest.fn((name) => {
      if (!cols[name]) cols[name] = {
        deleteMany: jest.fn(async () => ({ deletedCount: 2 })),
        updateMany: jest.fn(async () => ({ modifiedCount: 1 })),
        find: jest.fn(() => ({ toArray: jest.fn(async () => [{ userID: "u1", _r: name }]) })),
      };
      return cols[name];
    }),
    _cols: cols,
  };
  return instance;
}

beforeEach(() => {
  jest.clearAllMocks();
  UserService.getUserByQuery.mockResolvedValue(member());
  UserService.updateUser.mockResolvedValue(member());
  UserService.deleteUser.mockResolvedValue(true);
});

// ---- unlinkProvider ------------------------------------------------------

test("unlinks google when the member still has another method; clears id + audits", async () => {
  const r = await unlinkProvider({ userID: "u1", provider: "google", actor: ADMIN });
  expect(r).toEqual({ userID: "u1", provider: "google", unlinked: true });
  expect(UserService.updateUser).toHaveBeenCalledWith({ userID: "u1" }, { googleId: "" }, ADMIN);
  expect(auditLog).toHaveBeenCalledWith("admin.member.unlink", expect.objectContaining({ target: "u1", provider: "google", outcome: "success" }));
});

test("unlinking discord clears id + handle", async () => {
  await unlinkProvider({ userID: "u1", provider: "discord", actor: ADMIN });
  expect(UserService.updateUser).toHaveBeenCalledWith({ userID: "u1" }, { discordId: "", discordHandle: "" }, ADMIN);
});

test("sets provider→local when unlinking the member's current provider", async () => {
  UserService.getUserByQuery.mockResolvedValueOnce(member({ provider: "google" }));
  await unlinkProvider({ userID: "u1", provider: "google", actor: ADMIN });
  expect(UserService.updateUser).toHaveBeenCalledWith({ userID: "u1" }, { googleId: "", provider: "local" }, ADMIN);
});

test("REFUSES to unlink the only sign-in method (lockout guard)", async () => {
  // google-only: no usable password, no discord
  UserService.getUserByQuery.mockResolvedValueOnce(member({ password: "no password", discordId: "" }));
  await expect(unlinkProvider({ userID: "u1", provider: "google", actor: ADMIN })).rejects.toThrow(/only sign-in method/);
  expect(UserService.updateUser).not.toHaveBeenCalled();
});

test("rejects an unknown provider and an unlinked provider", async () => {
  await expect(unlinkProvider({ userID: "u1", provider: "apple", actor: ADMIN })).rejects.toBeInstanceOf(LifecycleValidationError);
  UserService.getUserByQuery.mockResolvedValueOnce(member({ googleId: "" }));
  await expect(unlinkProvider({ userID: "u1", provider: "google", actor: ADMIN })).rejects.toThrow(/no google account linked/);
});

test("unlink: unknown member → 404", async () => {
  UserService.getUserByQuery.mockResolvedValueOnce(null);
  await expect(unlinkProvider({ userID: "x", provider: "google", actor: ADMIN })).rejects.toBeInstanceOf(MemberNotFoundError);
});

// ---- forcePasswordReset --------------------------------------------------

test("sends a reset to the member's decrypted email + audits", async () => {
  const r = await forcePasswordReset({ userID: "u1", actor: ADMIN });
  expect(AuthService.requestPasswordReset).toHaveBeenCalledWith("u1@x.com");
  expect(r).toEqual({ userID: "u1", sent: true });
  expect(auditLog).toHaveBeenCalledWith("admin.member.password_reset", expect.objectContaining({ target: "u1", outcome: "sent" }));
});

test("reset: member with no email → validation error, no send", async () => {
  UserService.getUserByQuery.mockResolvedValueOnce(member({ email: "" }));
  await expect(forcePasswordReset({ userID: "u1", actor: ADMIN })).rejects.toThrow(/no email/);
  expect(AuthService.requestPasswordReset).not.toHaveBeenCalled();
});

// ---- purgeMember (GDPR erasure) -----------------------------------------

test("purge: deletes personal collections, anonymizes financial, hard-deletes the doc, audits counts", async () => {
  const inst = fakeInstance();
  db.connect.mockResolvedValue(inst);
  const r = await purgeMember({ userID: "u1", actor: ADMIN });

  // personal-activity collection deleted by userID
  expect(inst._cols.notifications.deleteMany).toHaveBeenCalledWith({ $or: [{ userID: "u1" }] });
  expect(r.deleted.notifications).toBe(2);
  // transactions anonymized: PII nulled + id refs tombstoned
  expect(inst._cols.transactions.updateMany).toHaveBeenCalledWith(expect.anything(), { $set: { discordId: null } });
  expect(inst._cols.transactions.updateMany).toHaveBeenCalledWith({ userID: "u1" }, { $set: { userID: PURGE_TOMBSTONE } });
  expect(r.anonymized.transactions).toBeGreaterThan(0);
  // user doc removed last (fires MEMBER_DELETED)
  expect(UserService.deleteUser).toHaveBeenCalledWith({ userID: "u1" });
  expect(auditLog).toHaveBeenCalledWith("admin.member.purge", expect.objectContaining({ target: "u1", outcome: "success", deleted: expect.any(Object), anonymized: expect.any(Object) }));
});

test("purge: unknown member → 404, no db work", async () => {
  UserService.getUserByQuery.mockResolvedValueOnce(null);
  await expect(purgeMember({ userID: "x", actor: ADMIN })).rejects.toBeInstanceOf(MemberNotFoundError);
  expect(db.connect).not.toHaveBeenCalled();
  expect(UserService.deleteUser).not.toHaveBeenCalled();
});

// ---- exportMember --------------------------------------------------------

test("export: strips credentials, includes profile + related, audits", async () => {
  UserService.getUserByQuery.mockResolvedValueOnce(member({ password: "$2b$secret", verificationToken: "tok", passwordResetTokenHash: "h" }));
  db.connect.mockResolvedValue(fakeInstance());
  const out = await exportMember({ userID: "u1", actor: ADMIN });
  const blob = JSON.stringify(out);
  expect(out.profile).not.toHaveProperty("password");
  expect(out.profile).not.toHaveProperty("verificationToken");
  expect(out.profile).not.toHaveProperty("passwordResetTokenHash");
  expect(blob).not.toContain("$2b$secret");
  expect(out.profile.email).toBe("u1@x.com"); // subject PII included (decrypted for admin)
  expect(out.related.notifications).toBeDefined();
  expect(auditLog).toHaveBeenCalledWith("admin.member.export", expect.objectContaining({ target: "u1", outcome: "success" }));
});
