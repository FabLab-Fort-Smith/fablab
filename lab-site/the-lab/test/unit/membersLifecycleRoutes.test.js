// AC-4 lifecycle routes: unlink, reset-password, purge (typed-confirm guard), export (attachment).

jest.mock("@/auth", () => ({ __esModule: true, auth: jest.fn() }));
jest.mock("@/app/api/v1/admin/members/lifecycle", () => {
  class LifecycleValidationError extends Error { constructor(m) { super(m); this.name = "LifecycleValidationError"; this.status = 400; } }
  class MemberNotFoundError extends Error { constructor(m = "member not found") { super(m); this.name = "MemberNotFoundError"; this.status = 404; } }
  return { __esModule: true, unlinkProvider: jest.fn(), forcePasswordReset: jest.fn(), purgeMember: jest.fn(), exportMember: jest.fn(), LifecycleValidationError, MemberNotFoundError };
});

import { POST as UNLINK } from "@/app/api/v1/admin/members/unlink/route";
import { POST as RESET } from "@/app/api/v1/admin/members/reset-password/route";
import { POST as PURGE } from "@/app/api/v1/admin/members/purge/route";
import { GET as EXPORT } from "@/app/api/v1/admin/members/export/route";
import { auth } from "@/auth";
import { unlinkProvider, forcePasswordReset, purgeMember, exportMember, LifecycleValidationError, MemberNotFoundError } from "@/app/api/v1/admin/members/lifecycle";

const ADMIN = { user: { role: "admin", userID: "admin-1" } };
const post = (fn, url, body) => fn(new Request(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
const unlink = (b) => post(UNLINK, "http://lab.test/api/v1/admin/members/unlink", b);
const reset = (b) => post(RESET, "http://lab.test/api/v1/admin/members/reset-password", b);
const purge = (b) => post(PURGE, "http://lab.test/api/v1/admin/members/purge", b);
const exp = (qs) => EXPORT(new Request("http://lab.test/api/v1/admin/members/export" + qs));

beforeEach(() => { jest.clearAllMocks(); auth.mockResolvedValue(ADMIN); });

test("all routes reject non-admin / no session with 401 and never call the service", async () => {
  auth.mockResolvedValue(null);
  expect((await unlink({ userID: "u1", provider: "google" })).status).toBe(401);
  expect((await reset({ userID: "u1" })).status).toBe(401);
  expect((await purge({ userID: "u1", confirm: "u1" })).status).toBe(401);
  expect((await exp("?userID=u1")).status).toBe(401);
  auth.mockResolvedValue({ user: { role: "member", userID: "m1" } });
  expect((await purge({ userID: "u1", confirm: "u1" })).status).toBe(401);
  expect(unlinkProvider).not.toHaveBeenCalled();
  expect(purgeMember).not.toHaveBeenCalled();
  expect(exportMember).not.toHaveBeenCalled();
});

test("unlink: valid → 200 delegates with actor; validation→400; 404", async () => {
  unlinkProvider.mockResolvedValueOnce({ userID: "u1", provider: "google", unlinked: true });
  const res = await unlink({ userID: "u1", provider: "google" });
  expect(res.status).toBe(200);
  expect(unlinkProvider).toHaveBeenCalledWith({ userID: "u1", provider: "google", actor: { userID: "admin-1", role: "admin" } });
  unlinkProvider.mockRejectedValueOnce(new LifecycleValidationError("only sign-in method"));
  expect((await unlink({ userID: "u1", provider: "google" })).status).toBe(400);
  unlinkProvider.mockRejectedValueOnce(new MemberNotFoundError());
  expect((await unlink({ userID: "x", provider: "google" })).status).toBe(404);
});

test("reset-password: valid → 200; unexpected → 500 generic", async () => {
  forcePasswordReset.mockResolvedValueOnce({ userID: "u1", sent: true });
  expect((await reset({ userID: "u1" })).status).toBe(200);
  forcePasswordReset.mockRejectedValueOnce(new Error("smtp down"));
  const res = await reset({ userID: "u1" });
  expect(res.status).toBe(500);
  expect(await res.json()).toEqual({ error: "Password reset failed" });
});

test("purge: requires typed confirm === userID (guards accidental erasure)", async () => {
  // missing/wrong confirm → 400, service NOT called
  expect((await purge({ userID: "u1" })).status).toBe(400);
  expect((await purge({ userID: "u1", confirm: "nope" })).status).toBe(400);
  expect(purgeMember).not.toHaveBeenCalled();
  // correct confirm → delegates
  purgeMember.mockResolvedValueOnce({ userID: "u1", deleted: {}, anonymized: {} });
  const res = await purge({ userID: "u1", confirm: "u1" });
  expect(res.status).toBe(200);
  expect(purgeMember).toHaveBeenCalledWith({ userID: "u1", actor: { userID: "admin-1", role: "admin" } });
});

test("purge: missing userID → 400", async () => {
  expect((await purge({ confirm: "x" })).status).toBe(400);
});

test("export: 200 JSON attachment with stamped exportedAt; 400 without userID", async () => {
  exportMember.mockResolvedValueOnce({ userID: "u1", profile: {}, related: {} });
  const res = await exp("?userID=u1");
  expect(res.status).toBe(200);
  expect(res.headers.get("content-disposition")).toContain('attachment; filename="member-export-u1.json"');
  const body = await res.json();
  expect(body.exportedAt).toEqual(expect.any(String));
  expect((await exp("")).status).toBe(400);
});
