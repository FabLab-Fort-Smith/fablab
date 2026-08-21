// The admin route + controller: 404 when disabled, 401 without a session, delegates to the
// admin service methods (which enforce admin authz) and maps their errors to status codes.

jest.mock("@/lib/plugins/guard", () => ({ __esModule: true, requirePluginEnabled: jest.fn() }));
jest.mock("@/auth", () => ({ __esModule: true, auth: jest.fn() }));
jest.mock("@/plugins/door-access-controller/service", () => ({
  __esModule: true,
  default: {
    adminOverview: jest.fn(async () => ({ doors: [], cards: [], policy: { rules: [], accountOverrides: {} }, allowlist: {} })),
    adminUpsertDoor: jest.fn(async () => ({ ok: true, doorId: "front" })),
    adminSavePolicy: jest.fn(async () => ({ ok: true })),
    adminRevokeCard: jest.fn(async () => ({ ok: true })),
    refreshAllowlist: jest.fn(async () => ({ pushed: true })),
  },
}));

import { GET, POST } from "@/app/api/v1/plugins/door-access-controller/admin/route";
import { requirePluginEnabled } from "@/lib/plugins/guard";
import { auth } from "@/auth";
import Service from "@/plugins/door-access-controller/service";

const ADMIN = { user: { userID: "admin-1", role: "admin" } };
const notFound = () => new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
const post = (body) => POST(new Request("http://lab.test/api/v1/plugins/door-access-controller/admin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

beforeEach(() => {
  jest.clearAllMocks();
  requirePluginEnabled.mockResolvedValue(null);
  auth.mockResolvedValue(ADMIN);
});

test("GET disabled → 404", async () => {
  requirePluginEnabled.mockResolvedValueOnce(notFound());
  expect((await GET()).status).toBe(404);
});

test("GET no session → 401", async () => {
  auth.mockResolvedValue(null);
  expect((await GET()).status).toBe(401);
  expect(Service.adminOverview).not.toHaveBeenCalled();
});

test("GET admin → 200 overview", async () => {
  const res = await GET();
  expect(res.status).toBe(200);
  expect(Service.adminOverview).toHaveBeenCalledWith({ userID: "admin-1", role: "admin" });
});

test("POST door.upsert → delegates, 200", async () => {
  const res = await post({ action: "door.upsert", doorId: "front", deviceId: "d1" });
  expect(res.status).toBe(200);
  expect(Service.adminUpsertDoor).toHaveBeenCalledWith({ userID: "admin-1", role: "admin" }, expect.objectContaining({ doorId: "front" }));
});

test("POST unknown action → 400", async () => {
  expect((await post({ action: "nope" })).status).toBe(400);
});

test("POST no session → 401", async () => {
  auth.mockResolvedValue(null);
  expect((await post({ action: "card.revoke", userID: "u1" })).status).toBe(401);
  expect(Service.adminRevokeCard).not.toHaveBeenCalled();
});

test("a service authz error (403) is surfaced as 403", async () => {
  Service.adminUpsertDoor.mockRejectedValueOnce(Object.assign(new Error("Forbidden"), { status: 403 }));
  expect((await post({ action: "door.upsert", doorId: "x", deviceId: "y" })).status).toBe(403);
});
