// Authz + identity-binding for the member-email HTTP edge. Drives the real
// controller with auth + the plugin service + config mocked. Proves identity is
// taken from the session (never the body) and error statuses map through.
jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/plugins/member-email/config", () => ({
  __esModule: true,
  resolveConfig: jest.fn().mockResolvedValue({ maxMailboxesPerMember: 1, minAccountCredit: 1, additionalReserved: [] }),
  PLUGIN_ID: "member-email",
  PERM_ADMIN: "member-email:admin",
}));
jest.mock("@/plugins/member-email/service", () => ({
  __esModule: true,
  default: {
    checkAvailability: jest.fn(), claim: jest.fn(), getOwn: jest.fn(),
    adminList: jest.fn(), adminSuspend: jest.fn(), adminReset: jest.fn(), adminDelete: jest.fn(),
  },
}));

import { auth } from "@/auth";
import Controller from "@/plugins/member-email/controller";
import Service from "@/plugins/member-email/service";
import { _resetRateLimit } from "@/lib/rateLimit";

const ANON = null;
const MEMBER = { user: { userID: "member-1", role: "user" } };
const ADMIN = { user: { userID: "admin-1", role: "admin" } };
const post = (url, body) => new Request(url, {
  method: "POST", headers: new Headers({ "content-type": "application/json" }), body: JSON.stringify(body),
});

beforeEach(() => {
  jest.clearAllMocks();
  _resetRateLimit(); // isolate the per-user throttle between tests
  Service.claim.mockResolvedValue({ address: "jdoe@fablabfortsmith.org", status: "active" });
  Service.checkAvailability.mockResolvedValue({ available: true });
  Service.adminSuspend.mockResolvedValue({ ok: true });
  Service.adminList.mockResolvedValue([]);
});

test("REGRESSION: anonymous claim -> 401, service not called", async () => {
  auth.mockResolvedValue(ANON);
  const res = await Controller.claim(post("http://x/claim", { localPart: "jdoe" }));
  expect(res.status).toBe(401);
  expect(Service.claim).not.toHaveBeenCalled();
});

test("anonymous availability -> 401", async () => {
  auth.mockResolvedValue(ANON);
  expect((await Controller.availability(new Request("http://x/availability?name=jdoe"))).status).toBe(401);
});

test("claim uses the SESSION userID, ignoring a spoofed body userID", async () => {
  auth.mockResolvedValue(MEMBER);
  const res = await Controller.claim(post("http://x/claim", { localPart: "jdoe", userID: "admin-1" }));
  expect(res.status).toBe(201);
  const [input, actor] = Service.claim.mock.calls[0];
  expect(input).toEqual({ localPart: "jdoe" });
  expect(actor.userID).toBe("member-1"); // from session, NOT the body
});

test("a non-active member is rejected 403 (service authz mapped)", async () => {
  auth.mockResolvedValue(MEMBER);
  const e = new Error("Active membership required"); e.status = 403;
  Service.claim.mockRejectedValue(e);
  expect((await Controller.claim(post("http://x/claim", { localPart: "jdoe" }))).status).toBe(403);
});

test("admin action requires userID and a known action", async () => {
  auth.mockResolvedValue(ADMIN);
  expect((await Controller.adminAction(post("http://x/admin", { action: "suspend" }))).status).toBe(400);
  expect((await Controller.adminAction(post("http://x/admin", { action: "explode", userID: "m1" }))).status).toBe(400);
  const ok = await Controller.adminAction(post("http://x/admin", { action: "suspend", userID: "m1" }));
  expect(ok.status).toBe(200);
  expect(Service.adminSuspend).toHaveBeenCalledWith("m1", { userID: "admin-1", role: "admin" });
});

test("admin action by a non-admin is rejected 403 by the service", async () => {
  auth.mockResolvedValue(MEMBER);
  const e = new Error("Forbidden"); e.status = 403;
  Service.adminSuspend.mockRejectedValue(e);
  expect((await Controller.adminAction(post("http://x/admin", { action: "suspend", userID: "m1" }))).status).toBe(403);
});

test("M3: claim is rate-limited per user (6th within a minute -> 429)", async () => {
  auth.mockResolvedValue(MEMBER);
  for (let i = 0; i < 5; i++) {
    expect((await Controller.claim(post("http://x/claim", { localPart: `n${i}` }))).status).toBe(201);
  }
  const blocked = await Controller.claim(post("http://x/claim", { localPart: "n6" }));
  expect(blocked.status).toBe(429);
  expect(blocked.headers.get("Retry-After")).toBeTruthy();
});

test("M3: availability throttle blocks after 20/min for a user", async () => {
  auth.mockResolvedValue(MEMBER);
  for (let i = 0; i < 20; i++) {
    expect((await Controller.availability(new Request(`http://x/availability?name=n${i}`))).status).toBe(200);
  }
  expect((await Controller.availability(new Request("http://x/availability?name=n21"))).status).toBe(429);
});
