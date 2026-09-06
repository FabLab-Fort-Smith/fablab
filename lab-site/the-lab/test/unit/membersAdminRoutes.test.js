// AC-3 admin member routes: role + status. Admin-gated, delegate to service, map 400/404/500.

jest.mock("@/auth", () => ({ __esModule: true, auth: jest.fn() }));
jest.mock("@/app/api/v1/admin/members/service", () => {
  class MemberValidationError extends Error { constructor(m) { super(m); this.name = "MemberValidationError"; this.status = 400; } }
  class MemberNotFoundError extends Error { constructor(m = "member not found") { super(m); this.name = "MemberNotFoundError"; this.status = 404; } }
  return { __esModule: true, changeRole: jest.fn(), setMemberStatus: jest.fn(), MemberValidationError, MemberNotFoundError };
});

import { POST as ROLE } from "@/app/api/v1/admin/members/role/route";
import { POST as STATUS } from "@/app/api/v1/admin/members/status/route";
import { auth } from "@/auth";
import { changeRole, setMemberStatus, MemberValidationError, MemberNotFoundError } from "@/app/api/v1/admin/members/service";

const ADMIN = { user: { role: "admin", userID: "admin-1" } };
const roleReq = (body) => ROLE(new Request("http://lab.test/api/v1/admin/members/role", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
const statusReq = (body) => STATUS(new Request("http://lab.test/api/v1/admin/members/status", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

beforeEach(() => { jest.clearAllMocks(); auth.mockResolvedValue(ADMIN); });

test("role: non-admin / no session → 401, service not called", async () => {
  auth.mockResolvedValueOnce(null);
  expect((await roleReq({ userID: "u1", role: "admin" })).status).toBe(401);
  auth.mockResolvedValueOnce({ user: { role: "member", userID: "u2" } });
  expect((await roleReq({ userID: "u1", role: "admin" })).status).toBe(401);
  expect(changeRole).not.toHaveBeenCalled();
});

test("role: valid → 200 with result; actor from session", async () => {
  changeRole.mockResolvedValueOnce({ userID: "u1", role: "admin", previousRole: "user" });
  const res = await roleReq({ userID: "u1", role: "admin" });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ userID: "u1", role: "admin", previousRole: "user" });
  expect(changeRole).toHaveBeenCalledWith({ userID: "u1", role: "admin", actor: { userID: "admin-1", role: "admin" } });
});

test("role: validation error → 400; not found → 404; other → 500 generic", async () => {
  changeRole.mockRejectedValueOnce(new MemberValidationError("you cannot change your own role"));
  let res = await roleReq({ userID: "admin-1", role: "user" });
  expect(res.status).toBe(400);
  expect((await res.json()).error).toMatch(/your own role/);
  changeRole.mockRejectedValueOnce(new MemberNotFoundError());
  expect((await roleReq({ userID: "x", role: "admin" })).status).toBe(404);
  changeRole.mockRejectedValueOnce(new Error("db down internal"));
  res = await roleReq({ userID: "u1", role: "admin" });
  expect(res.status).toBe(500);
  expect(await res.json()).toEqual({ error: "Role change failed" });
});

test("status: non-admin → 401", async () => {
  auth.mockResolvedValueOnce({ user: { role: "member" } });
  expect((await statusReq({ userID: "u1", status: "suspended" })).status).toBe(401);
  expect(setMemberStatus).not.toHaveBeenCalled();
});

test("status: valid → 200; validation → 400; other → 500 generic", async () => {
  setMemberStatus.mockResolvedValueOnce({ userID: "u1", status: "suspended", previousStatus: "active" });
  let res = await statusReq({ userID: "u1", status: "suspended" });
  expect(res.status).toBe(200);
  expect((await res.json()).status).toBe("suspended");
  expect(setMemberStatus).toHaveBeenCalledWith({ userID: "u1", status: "suspended", actor: { userID: "admin-1", role: "admin" } });
  setMemberStatus.mockRejectedValueOnce(new MemberValidationError("status must be one of: ..."));
  expect((await statusReq({ userID: "u1", status: "banned" })).status).toBe(400);
  setMemberStatus.mockRejectedValueOnce(new Error("boom"));
  res = await statusReq({ userID: "u1", status: "active" });
  expect(res.status).toBe(500);
  expect(await res.json()).toEqual({ error: "Status change failed" });
});
