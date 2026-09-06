// AC-4: the users controller now audits admin delete / merge / nudge (previously untracked).

jest.mock("@/auth", () => ({ __esModule: true, auth: jest.fn() }));
jest.mock("@/app/api/v1/users/service", () => ({ __esModule: true, default: {
  deleteUser: jest.fn(), nudgeUser: jest.fn(), mergeUsers: jest.fn(), verifyCredentials: jest.fn(), updateUser: jest.fn(),
} }));
jest.mock("@/lib/audit", () => ({ __esModule: true, auditLog: jest.fn() }));

import UserController from "@/app/api/v1/users/controller";
import { auth } from "@/auth";
import UserService from "@/app/api/v1/users/service";
import { auditLog } from "@/lib/audit";

const ADMIN = { user: { role: "admin", userID: "admin-1" } };
beforeEach(() => { jest.clearAllMocks(); auth.mockResolvedValue(ADMIN); });

test("delete: admin → audits admin.member.delete", async () => {
  UserService.deleteUser.mockResolvedValueOnce(true);
  const res = await UserController.deleteUser(new Request("http://lab.test/api/v1/users?userID=u1", { method: "DELETE" }));
  expect(res.status).toBe(200);
  expect(auditLog).toHaveBeenCalledWith("admin.member.delete", expect.objectContaining({ actor: "admin-1", target: "u1", outcome: "success" }));
});

test("delete: non-admin → 403, no audit, no delete", async () => {
  auth.mockResolvedValueOnce({ user: { role: "member", userID: "m1" } });
  const res = await UserController.deleteUser(new Request("http://lab.test/api/v1/users?userID=u1", { method: "DELETE" }));
  expect(res.status).toBe(403);
  expect(UserService.deleteUser).not.toHaveBeenCalled();
  expect(auditLog).not.toHaveBeenCalled();
});

test("nudge: audits only on send, not preview", async () => {
  UserService.nudgeUser.mockResolvedValue({ ok: true });
  await UserController.nudgeUser(new Request("http://lab.test", { method: "POST", body: JSON.stringify({ userID: "u1", preview: true }) }));
  expect(auditLog).not.toHaveBeenCalled();
  await UserController.nudgeUser(new Request("http://lab.test", { method: "POST", body: JSON.stringify({ userID: "u1" }) }));
  expect(auditLog).toHaveBeenCalledWith("admin.member.nudge", expect.objectContaining({ target: "u1", outcome: "sent" }));
});

test("broad PUT (AC-8a): admin role/status change via /users is audited with persisted id + value", async () => {
  // Admin addresses the target by EMAIL — audit must record the persisted userID, not the email (no PII).
  UserService.updateUser.mockResolvedValue({ userID: "u1", role: "admin" });
  const putByEmail = (b) => UserController.updateUser(new Request("http://lab.test/api/v1/users?email=ada@x.com", { method: "PUT", body: JSON.stringify(b) }));
  await putByEmail({ role: "admin" });
  const roleCall = auditLog.mock.calls.find(c => c[0] === "admin.member.role.change");
  expect(roleCall[1]).toEqual(expect.objectContaining({ target: "u1", after: "admin", source: "users.PUT" }));
  expect(JSON.stringify(roleCall[1])).not.toContain("ada@x.com"); // no PII in audit target

  jest.clearAllMocks(); auth.mockResolvedValue(ADMIN);
  UserService.updateUser.mockResolvedValue({ userID: "u1", membership: { status: "suspended" } });
  await UserController.updateUser(new Request("http://lab.test/api/v1/users?userID=u1", { method: "PUT", body: JSON.stringify({ membership: { status: "suspended" } }) }));
  expect(auditLog).toHaveBeenCalledWith("admin.member.status.change", expect.objectContaining({ target: "u1", after: "suspended", source: "users.PUT" }));
});

test("broad PUT: a non-sensitive admin update is not spuriously audited", async () => {
  UserService.updateUser.mockResolvedValue({ userID: "u1" });
  await UserController.updateUser(new Request("http://lab.test/api/v1/users?userID=u1", { method: "PUT", body: JSON.stringify({ firstName: "Ada" }) }));
  expect(auditLog).not.toHaveBeenCalled();
});

test("merge: audits admin.member.merge with target + source", async () => {
  UserService.mergeUsers.mockResolvedValueOnce({ userID: "t1" });
  const res = await UserController.mergeUsers(new Request("http://lab.test", { method: "POST", body: JSON.stringify({ targetUserID: "t1", sourceUserID: "s1" }) }));
  expect(res.status).toBe(200);
  expect(auditLog).toHaveBeenCalledWith("admin.member.merge", expect.objectContaining({ actor: "admin-1", target: "t1", source: "s1", outcome: "success" }));
});
