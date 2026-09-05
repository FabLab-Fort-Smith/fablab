// AC-2 admin disputes routes: list + detail. Admin-gated, delegate to service, audit detail, 404/500,
// bigint-safe body.

jest.mock("@/auth", () => ({ __esModule: true, auth: jest.fn() }));
jest.mock("@/app/api/v1/square/disputes/service", () => {
  class DisputeNotFoundError extends Error { constructor(m = "dispute not found") { super(m); this.name = "DisputeNotFoundError"; this.status = 404; } }
  return { __esModule: true, listDisputes: jest.fn(), disputeDetail: jest.fn(), DisputeNotFoundError };
});
jest.mock("@/lib/audit", () => ({ __esModule: true, auditLog: jest.fn() }));
jest.mock("@/lib/square", () => ({ __esModule: true, squareErrorDetail: (e) => e && e.message, bigintReplacer: (k, v) => (typeof v === "bigint" ? v.toString() : v) }));

import { GET as LIST } from "@/app/api/v1/admin/square/disputes/route";
import { GET as DETAIL } from "@/app/api/v1/admin/square/disputes/[disputeId]/route";
import { auth } from "@/auth";
import { listDisputes, disputeDetail, DisputeNotFoundError } from "@/app/api/v1/square/disputes/service";
import { auditLog } from "@/lib/audit";

const ADMIN = { user: { role: "admin", userID: "admin-1" } };
const listReq = (qs = "") => LIST(new Request("http://lab.test/api/v1/admin/square/disputes" + qs));
const detailReq = (disputeId) => DETAIL(new Request("http://lab.test/api/v1/admin/square/disputes/" + disputeId), { params: { disputeId } });

beforeEach(() => { jest.clearAllMocks(); auth.mockResolvedValue(ADMIN); });

test("list: non-admin → 401, service not called", async () => {
  auth.mockResolvedValueOnce({ user: { role: "member" } });
  expect((await listReq()).status).toBe(401);
  expect(listDisputes).not.toHaveBeenCalled();
});

test("list: passes cursor + state query through; 200 bigint-safe", async () => {
  listDisputes.mockResolvedValueOnce({ disputes: [{ id: "d1", amountCents: 2500n }], cursor: null });
  const res = await listReq("?cursor=c1&state=WON");
  expect(res.status).toBe(200);
  expect(await res.text()).toContain('"amountCents":"2500"');
  expect(listDisputes).toHaveBeenCalledWith({ cursor: "c1", states: "WON" });
});

test("list: unexpected error → 500 generic", async () => {
  listDisputes.mockRejectedValueOnce(new Error("boom internal"));
  const res = await listReq();
  expect(res.status).toBe(500);
  expect(await res.json()).toEqual({ error: "Failed to load disputes" });
});

test("detail: non-admin → 401", async () => {
  auth.mockResolvedValueOnce(null);
  expect((await detailReq("d1")).status).toBe(401);
  expect(disputeDetail).not.toHaveBeenCalled();
});

test("detail: valid → 200, audits view", async () => {
  disputeDetail.mockResolvedValueOnce({ id: "d1", state: "WON", evidenceIds: [] });
  const res = await detailReq("d1");
  expect(res.status).toBe(200);
  expect(auditLog).toHaveBeenCalledWith("admin.square.dispute.view", expect.objectContaining({ disputeId: "d1", outcome: "ok" }));
});

test("detail: not found → 404; other error → 500 generic", async () => {
  disputeDetail.mockRejectedValueOnce(new DisputeNotFoundError());
  expect((await detailReq("nope")).status).toBe(404);
  disputeDetail.mockRejectedValueOnce(new Error("internal"));
  const res = await detailReq("d1");
  expect(res.status).toBe(500);
  expect(await res.json()).toEqual({ error: "Failed to load dispute" });
});
