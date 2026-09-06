// AC-4: the users controller now audits admin delete / merge / nudge (previously untracked).

jest.mock("@/auth", () => ({ __esModule: true, auth: jest.fn() }));
jest.mock("@/app/api/v1/users/service", () => ({ __esModule: true, default: {
  deleteUser: jest.fn(), nudgeUser: jest.fn(), mergeUsers: jest.fn(), verifyCredentials: jest.fn(),
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

test("merge: audits admin.member.merge with target + source", async () => {
  UserService.mergeUsers.mockResolvedValueOnce({ userID: "t1" });
  const res = await UserController.mergeUsers(new Request("http://lab.test", { method: "POST", body: JSON.stringify({ targetUserID: "t1", sourceUserID: "s1" }) }));
  expect(res.status).toBe(200);
  expect(auditLog).toHaveBeenCalledWith("admin.member.merge", expect.objectContaining({ actor: "admin-1", target: "t1", source: "s1", outcome: "success" }));
});
