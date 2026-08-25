// Admin service methods: admin-only (assertPermission is real → role must be "admin"),
// input-validated + injection-safe, and cards are sanitized (no ciphertext / blind index).

jest.mock("@/plugins/door-access-controller/model", () => ({
  __esModule: true,
  default: { listDoors: jest.fn(), getPolicyDoc: jest.fn(), listCards: jest.fn(), upsertDoor: jest.fn(), savePolicyDoc: jest.fn(), revokeCardsByUserID: jest.fn(), getEdgeSigningKey: jest.fn(), registerEdgeSigningKey: jest.fn(), listEdgeKeys: jest.fn() },
}));
jest.mock("@/plugins/door-access-controller/config", () => ({ __esModule: true, PLUGIN_ID: "door-access-controller", PERM_ADMIN: "door-access-controller:admin", resolveConfig: jest.fn(async () => ({})) }));
jest.mock("@/lib/access-control", () => ({ __esModule: true, pushAllowlist: jest.fn() }));
jest.mock("@/lib/audit", () => ({ __esModule: true, auditLog: jest.fn() }));

import crypto from "crypto";

import Service from "@/plugins/door-access-controller/service";
import Model from "@/plugins/door-access-controller/model";
import { auditLog } from "@/lib/audit";

const edPub = () => crypto.generateKeyPairSync("ed25519").publicKey.export({ type: "spki", format: "der" }).toString("base64");

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

// --- edge audit-key registration (S6-b-a2): genesis/reflash trust binding, admin-gated ---

test("adminRegisterEdgeKey requires admin", async () => {
  await expect(Service.adminRegisterEdgeKey(USER, { edgeId: "e1", pubSpki: edPub() })).rejects.toMatchObject({ status: 403 });
  expect(Model.registerEdgeSigningKey).not.toHaveBeenCalled();
});

test("adminRegisterEdgeKey validates edgeId + a real Ed25519 pubSpki (400, no write)", async () => {
  await expect(Service.adminRegisterEdgeKey(ADMIN, { edgeId: "a.b", pubSpki: edPub() })).rejects.toMatchObject({ status: 400 });
  await expect(Service.adminRegisterEdgeKey(ADMIN, { edgeId: "e1" })).rejects.toMatchObject({ status: 400 }); // no pubSpki
  const rsa = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 }).publicKey.export({ type: "spki", format: "der" }).toString("base64");
  await expect(Service.adminRegisterEdgeKey(ADMIN, { edgeId: "e1", pubSpki: rsa })).rejects.toMatchObject({ status: 400 });
  await expect(Service.adminRegisterEdgeKey(ADMIN, { edgeId: "e1", pubSpki: "not-a-key" })).rejects.toMatchObject({ status: 400 });
  expect(Model.registerEdgeSigningKey).not.toHaveBeenCalled();
});

test("adminRegisterEdgeKey genesis: registers + audits edge-key-register, never logs the raw key", async () => {
  Model.getEdgeSigningKey.mockResolvedValue(null); // first time
  const pub = edPub();
  const res = await Service.adminRegisterEdgeKey(ADMIN, { edgeId: "front-01", pubSpki: pub });
  expect(res).toMatchObject({ ok: true, edgeId: "front-01", rotated: false });
  expect(res.fingerprint).toMatch(/^[0-9a-f]{16}$/);
  expect(Model.registerEdgeSigningKey).toHaveBeenCalledWith("front-01", pub);
  expect(auditLog).toHaveBeenCalledWith("door-access.admin", expect.objectContaining({ outcome: "edge-key-register", target: "front-01" }));
  expect(JSON.stringify(auditLog.mock.calls)).not.toContain(pub); // fingerprint only, never the raw key
});

test("adminRegisterEdgeKey rotation: a different key audits edge-key-rotate with a prior fingerprint", async () => {
  const oldPub = edPub(); const newPub = edPub();
  Model.getEdgeSigningKey.mockResolvedValue(oldPub);
  const res = await Service.adminRegisterEdgeKey(ADMIN, { edgeId: "front-01", pubSpki: newPub });
  expect(res.rotated).toBe(true);
  const call = auditLog.mock.calls.find((c) => c[1].outcome === "edge-key-rotate");
  expect(call).toBeTruthy();
  expect(call[1].priorFingerprint).toMatch(/^[0-9a-f]{16}$/);
  expect(call[1].fingerprint).not.toBe(call[1].priorFingerprint);
});

test("adminListEdgeKeys is admin-only and returns id+fingerprint+updatedAt only (no raw key)", async () => {
  await expect(Service.adminListEdgeKeys(USER)).rejects.toMatchObject({ status: 403 });
  const pub = edPub();
  Model.listEdgeKeys.mockResolvedValue([{ _id: "front-01", pubSpki: pub, updatedAt: "2026-08-25" }]);
  const out = await Service.adminListEdgeKeys(ADMIN);
  expect(out).toEqual([{ edgeId: "front-01", fingerprint: expect.stringMatching(/^[0-9a-f]{16}$/), updatedAt: "2026-08-25" }]);
  expect(JSON.stringify(out)).not.toContain(pub);
});
