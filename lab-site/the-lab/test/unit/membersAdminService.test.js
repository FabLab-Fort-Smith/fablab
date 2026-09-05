// AC-3 admin member-core service: validated + audited role and membership-status changes.

jest.mock("@/app/api/v1/users/service", () => ({ __esModule: true, default: { getUserByQuery: jest.fn(), updateUser: jest.fn() } }));
jest.mock("@/lib/audit", () => ({ __esModule: true, auditLog: jest.fn() }));

import { changeRole, setMemberStatus, MemberValidationError, MemberNotFoundError } from "@/app/api/v1/admin/members/service";
import UserService from "@/app/api/v1/users/service";
import { auditLog } from "@/lib/audit";

const ADMIN = { userID: "admin-1", role: "admin" };
const member = (over = {}) => ({ userID: "u1", role: "user", membership: { status: "active" }, ...over });

beforeEach(() => {
  jest.clearAllMocks();
  UserService.getUserByQuery.mockResolvedValue(member());
  UserService.updateUser.mockResolvedValue(member());
});

// ---- changeRole ----------------------------------------------------------

test("promotes user → admin: updates role, audits before→after", async () => {
  const r = await changeRole({ userID: "u1", role: "admin", actor: ADMIN });
  expect(r).toEqual({ userID: "u1", role: "admin", previousRole: "user" });
  expect(UserService.updateUser).toHaveBeenCalledWith({ userID: "u1" }, { role: "admin" }, ADMIN);
  expect(auditLog).toHaveBeenCalledWith("admin.member.role.change", expect.objectContaining({ target: "u1", before: "user", after: "admin", outcome: "success" }));
});

test("rejects an invalid role — no write, no promotion", async () => {
  await expect(changeRole({ userID: "u1", role: "superadmin", actor: ADMIN })).rejects.toBeInstanceOf(MemberValidationError);
  expect(UserService.updateUser).not.toHaveBeenCalled();
});

test("blocks changing your OWN role (self-lockout guard)", async () => {
  await expect(changeRole({ userID: "admin-1", role: "user", actor: ADMIN })).rejects.toThrow(/your own role/);
  expect(UserService.updateUser).not.toHaveBeenCalled();
});

test("blank userID → validation error", async () => {
  await expect(changeRole({ userID: "", role: "admin", actor: ADMIN })).rejects.toBeInstanceOf(MemberValidationError);
});

test("unknown member → MemberNotFoundError (404), no write", async () => {
  UserService.getUserByQuery.mockResolvedValueOnce(null);
  const err = await changeRole({ userID: "nope", role: "admin", actor: ADMIN }).catch((e) => e);
  expect(err).toBeInstanceOf(MemberNotFoundError);
  expect(err.status).toBe(404);
  expect(UserService.updateUser).not.toHaveBeenCalled();
});

test("no-op when role unchanged: audits noop, skips the write", async () => {
  UserService.getUserByQuery.mockResolvedValueOnce(member({ role: "admin" }));
  await changeRole({ userID: "u1", role: "admin", actor: ADMIN });
  expect(UserService.updateUser).not.toHaveBeenCalled();
  expect(auditLog).toHaveBeenCalledWith("admin.member.role.change", expect.objectContaining({ outcome: "noop" }));
});

// ---- setMemberStatus -----------------------------------------------------

test("suspends a member: updates membership.status, audits before→after", async () => {
  const r = await setMemberStatus({ userID: "u1", status: "suspended", actor: ADMIN });
  expect(r).toEqual({ userID: "u1", status: "suspended", previousStatus: "active" });
  expect(UserService.updateUser).toHaveBeenCalledWith({ userID: "u1" }, { membership: { status: "suspended" } }, ADMIN);
  expect(auditLog).toHaveBeenCalledWith("admin.member.status.change", expect.objectContaining({ target: "u1", before: "active", after: "suspended", outcome: "success" }));
});

test("reactivates a suspended member (status → active)", async () => {
  UserService.getUserByQuery.mockResolvedValueOnce(member({ membership: { status: "suspended" } }));
  const r = await setMemberStatus({ userID: "u1", status: "active", actor: ADMIN });
  expect(r.previousStatus).toBe("suspended");
  expect(UserService.updateUser).toHaveBeenCalledWith({ userID: "u1" }, { membership: { status: "active" } }, ADMIN);
});

test("rejects an invalid status — no write", async () => {
  await expect(setMemberStatus({ userID: "u1", status: "banned", actor: ADMIN })).rejects.toThrow(/status must be one of/);
  expect(UserService.updateUser).not.toHaveBeenCalled();
});

test("status no-op when unchanged: audits noop, skips write", async () => {
  await setMemberStatus({ userID: "u1", status: "active", actor: ADMIN });
  expect(UserService.updateUser).not.toHaveBeenCalled();
  expect(auditLog).toHaveBeenCalledWith("admin.member.status.change", expect.objectContaining({ outcome: "noop" }));
});
