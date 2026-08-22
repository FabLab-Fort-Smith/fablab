// The app-triggered unlock route: LIVE good-standing gate unchanged in shadow mode; the
// addon decides the gate ONLY under cutover. The physical unlock (toggleLight) fires only
// on a grant. auth / user model / access-control / shadowCompare are mocked.

jest.mock("@/auth", () => ({ __esModule: true, auth: jest.fn() }));
jest.mock("@/app/api/v1/users/model", () => ({ __esModule: true, default: { getUserByID: jest.fn() } }));
jest.mock("@/lib/access-control", () => ({ __esModule: true, toggleLight: jest.fn(), unlockDoor: jest.fn() }));
jest.mock("@/plugins/door-access-controller/parallelRun", () => ({ __esModule: true, shadowCompare: jest.fn() }));
jest.mock("@/lib/audit", () => ({ __esModule: true, auditLog: jest.fn() }));

import { POST } from "@/app/api/v1/access/unlock/route";
import { auth } from "@/auth";
import UserModel from "@/app/api/v1/users/model";
import { toggleLight } from "@/lib/access-control";
import { shadowCompare } from "@/plugins/door-access-controller/parallelRun";

const goodMember = { userID: "u1", username: "amy", role: "member", membership: { type: "co-op", status: "active", subscriptionStatus: "ACTIVE", isWaived: false, volunteerLog: [] } };
const community = { ...goodMember, membership: { type: "community", status: "active", subscriptionStatus: "ACTIVE", isWaived: false, volunteerLog: [] } };
const lapsed = { ...goodMember, membership: { type: "co-op", status: "active", subscriptionStatus: "CANCELED", isWaived: false, volunteerLog: [] } };

const post = () => POST(new Request("http://lab.test/api/v1/access/unlock", { method: "POST" }));

beforeEach(() => {
  jest.clearAllMocks();
  auth.mockResolvedValue({ user: { userID: "u1" } });
  UserModel.getUserByID.mockResolvedValue(goodMember);
  toggleLight.mockResolvedValue({ ok: true });
  shadowCompare.mockResolvedValue({ ran: false }); // shadow-only by default
});

test("no session → 401, no unlock", async () => {
  auth.mockResolvedValue(null);
  const res = await post();
  expect(res.status).toBe(401);
  expect(toggleLight).not.toHaveBeenCalled();
});

test("user not found → 404", async () => {
  UserModel.getUserByID.mockResolvedValue(null);
  expect((await post()).status).toBe(404);
});

test("shadow mode: good member → unlock fires, 200", async () => {
  const res = await post();
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ success: true });
  expect(toggleLight).toHaveBeenCalledWith("door-controller-01");
  expect(shadowCompare).toHaveBeenCalledWith(expect.objectContaining({ credentialType: "app", liveGranted: true }));
});

test("shadow mode: community member → live 403, no unlock", async () => {
  UserModel.getUserByID.mockResolvedValue(community);
  const res = await post();
  expect(res.status).toBe(403);
  expect(await res.json()).toMatchObject({ error: expect.stringMatching(/Community/) });
  expect(toggleLight).not.toHaveBeenCalled();
});

test("shadow mode: lapsed subscription → live 403 not in good standing", async () => {
  UserModel.getUserByID.mockResolvedValue(lapsed);
  const res = await post();
  expect(res.status).toBe(403);
  expect(await res.json()).toMatchObject({ error: expect.stringMatching(/good standing/) });
  expect(toggleLight).not.toHaveBeenCalled();
});

test("cutover: addon deny overrides a live grant → 403, no unlock", async () => {
  shadowCompare.mockResolvedValue({ ran: true, authoritative: true, granted: false, reason: "no-matching-window" });
  const res = await post();
  expect(res.status).toBe(403);
  expect(await res.json()).toMatchObject({ reason: "no-matching-window" });
  expect(toggleLight).not.toHaveBeenCalled();
});

test("cutover: addon grant overrides a live community-deny → unlock fires", async () => {
  UserModel.getUserByID.mockResolvedValue(community);
  shadowCompare.mockResolvedValue({ ran: true, authoritative: true, granted: true, reason: "rule-match" });
  const res = await post();
  expect(res.status).toBe(200);
  expect(toggleLight).toHaveBeenCalledWith("door-controller-01");
});
