// E2E for WI-4.4: every door-access decision is audit-logged with the actor
// and outcome, and the log carries no sensitive values.
jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/app/api/v1/users/model", () => ({ __esModule: true, default: { getUserByID: jest.fn() } }));
jest.mock("@/lib/access-control", () => ({ unlockDoor: jest.fn(), toggleLight: jest.fn() }));

import { auth } from "@/auth";
import UserModel from "@/app/api/v1/users/model";
import { toggleLight } from "@/lib/access-control";
import { POST } from "@/app/api/v1/access/unlock/route";

const req = () =>
  new Request("http://localhost/api/v1/access/unlock", {
    method: "POST",
    headers: new Headers({ "x-forwarded-for": "1.2.3.4" }),
  });

function auditRecords(spy) {
  return spy.mock.calls
    .map((args) => {
      try {
        return JSON.parse(args[0]);
      } catch {
        return null;
      }
    })
    .filter((r) => r && r.type === "audit");
}

afterEach(() => jest.restoreAllMocks());

describe("POST /api/v1/access/unlock — audit logging (WI-4.4)", () => {
  test("unauthenticated attempt is logged as denied", async () => {
    auth.mockResolvedValue(null);
    const spy = jest.spyOn(console, "log").mockImplementation(() => {});
    const res = await POST(req());
    expect(res.status).toBe(401);
    const rec = auditRecords(spy).find((r) => r.event === "access.unlock");
    expect(rec).toMatchObject({ outcome: "denied", reason: "unauthenticated", source: "1.2.3.4" });
  });

  test("community member denied -> audit logs the actor + reason", async () => {
    auth.mockResolvedValue({ user: { userID: "user-1" } });
    UserModel.getUserByID.mockResolvedValue({
      role: "user",
      username: "bob",
      membership: { type: "community", status: "active", subscriptionStatus: "ACTIVE" },
    });
    const spy = jest.spyOn(console, "log").mockImplementation(() => {});
    const res = await POST(req());
    expect(res.status).toBe(403);
    const rec = auditRecords(spy).find((r) => r.outcome === "denied");
    expect(rec).toMatchObject({ actor: "user-1", reason: "community_member" });
  });

  test("admin granted -> audit logs outcome granted with actor", async () => {
    auth.mockResolvedValue({ user: { userID: "admin-1" } });
    UserModel.getUserByID.mockResolvedValue({ role: "admin", membership: {} });
    toggleLight.mockResolvedValue({ ok: true });
    const spy = jest.spyOn(console, "log").mockImplementation(() => {});
    const res = await POST(req());
    expect(res.status).toBe(200);
    const recs = auditRecords(spy);
    const granted = recs.find((r) => r.outcome === "granted");
    expect(granted).toMatchObject({ actor: "admin-1", target: "door-controller-01" });
    expect(JSON.stringify(recs)).not.toMatch(/secret|password|token/i);
  });
});
