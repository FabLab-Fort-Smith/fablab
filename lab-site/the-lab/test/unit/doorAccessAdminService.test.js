// Admin service methods: admin-only (assertPermission is real → role must be "admin"),
// input-validated + injection-safe, and cards are sanitized (no ciphertext / blind index).

jest.mock("@/plugins/door-access-controller/model", () => ({
  __esModule: true,
  default: { listDoors: jest.fn(), getPolicyDoc: jest.fn(), listCards: jest.fn(), upsertDoor: jest.fn(), savePolicyDoc: jest.fn(), revokeCardsByUserID: jest.fn() },
}));
jest.mock("@/plugins/door-access-controller/config", () => ({ __esModule: true, PLUGIN_ID: "door-access-controller", PERM_ADMIN: "door-access-controller:admin", resolveConfig: jest.fn(async () => ({})) }));
jest.mock("@/lib/access-control", () => ({ __esModule: true, pushAllowlist: jest.fn() }));
jest.mock("@/lib/audit", () => ({ __esModule: true, auditLog: jest.fn() }));

import Service from "@/plugins/door-access-controller/service";
import Model from "@/plugins/door-access-controller/model";
import { auditLog } from "@/lib/audit";

const ADMIN = { userID: "admin-1", role: "admin" };
const USER = { userID: "u2", role: "member" };

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.DOOR_ALLOWLIST_SIGNING_KEY; // so _repushBestEffort no-ops in these tests
  Model.listDoors.mockResolvedValue([{ doorId: "front", deviceId: "d1", enabled: true }]);
  Model.getPolicyDoc.mockResolvedValue({ rules: [], accountOverrides: {} });
  Model.listCards.mockResolvedValue([{ userID: "u1", codeEnc: "IV:TAG:CT", bi: "beef", credentialType: "nfc", status: "active", createdAt: "2026-01-01" }]);
});

test("adminOverview requires admin", async () => {
  await expect(Service.adminOverview(USER)).rejects.toMatchObject({ status: 403 });
});

test("adminOverview sanitizes cards (no codeEnc / bi leak)", async () => {
  const out = await Service.adminOverview(ADMIN);
  expect(out.doors).toHaveLength(1);
  expect(out.cards[0]).toEqual({ userID: "u1", credentialType: "nfc", status: "active", createdAt: "2026-01-01" });
  expect(JSON.stringify(out.cards)).not.toMatch(/codeEnc|beef|IV:TAG:CT/);
});

test("adminUpsertDoor validates + upserts", async () => {
  await expect(Service.adminUpsertDoor(ADMIN, { name: "x" })).rejects.toMatchObject({ status: 400 }); // no doorId
  await expect(Service.adminUpsertDoor(ADMIN, { doorId: "front" })).rejects.toMatchObject({ status: 400 }); // no deviceId
  const r = await Service.adminUpsertDoor(ADMIN, { doorId: "front", deviceId: "d1", timezone: "America/Chicago" });
  expect(r).toEqual({ ok: true, doorId: "front" });
  expect(Model.upsertDoor).toHaveBeenCalledWith(expect.objectContaining({ doorId: "front", deviceId: "d1", enabled: true }));
  expect(auditLog).toHaveBeenCalledWith("door-access.admin", expect.objectContaining({ outcome: "door-upsert" }));
});

test("adminSavePolicy rejects bad shapes + injection, accepts valid", async () => {
  await expect(Service.adminSavePolicy(ADMIN, { rules: "nope" })).rejects.toMatchObject({ status: 400 });
  await expect(Service.adminSavePolicy(ADMIN, { rules: [{ roles: [] }] })).rejects.toMatchObject({ status: 400 }); // no id
  await expect(Service.adminSavePolicy(ADMIN, { rules: [], accountOverrides: { "$where": "deny" } })).rejects.toMatchObject({ status: 400 }); // $ key
  await expect(Service.adminSavePolicy(ADMIN, { rules: [], accountOverrides: { u9: "maybe" } })).rejects.toMatchObject({ status: 400 }); // bad value
  const r = await Service.adminSavePolicy(ADMIN, { rules: [{ id: "r1", roles: ["member"], doors: ["front"] }], accountOverrides: { u9: "deny" } });
  expect(r).toEqual({ ok: true });
  expect(Model.savePolicyDoc).toHaveBeenCalledWith({ rules: [{ id: "r1", roles: ["member"], doors: ["front"] }], accountOverrides: { u9: "deny" } });
});

test("adminRevokeCard validates + revokes + audits", async () => {
  await expect(Service.adminRevokeCard(ADMIN, {})).rejects.toMatchObject({ status: 400 });
  const r = await Service.adminRevokeCard(ADMIN, { userID: "u1" });
  expect(r).toEqual({ ok: true });
  expect(Model.revokeCardsByUserID).toHaveBeenCalledWith("u1");
  expect(auditLog).toHaveBeenCalledWith("door-access.admin", expect.objectContaining({ outcome: "card-revoke", target: "u1" }));
});

test("non-admin is rejected by every admin mutation", async () => {
  await expect(Service.adminUpsertDoor(USER, { doorId: "x", deviceId: "y" })).rejects.toMatchObject({ status: 403 });
  await expect(Service.adminSavePolicy(USER, { rules: [] })).rejects.toMatchObject({ status: 403 });
  await expect(Service.adminRevokeCard(USER, { userID: "u1" })).rejects.toMatchObject({ status: 403 });
  expect(Model.upsertDoor).not.toHaveBeenCalled();
  expect(Model.savePolicyDoc).not.toHaveBeenCalled();
});
