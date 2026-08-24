// S1 — service.buildDoorEnvelope + enrollCard entropy floor (door-controller-wifi.md §2/§5).
// Real cardCrypto + allowlistCrypto (the crypto under test); Model / users / facts / policy mocked so
// the envelope logic (per-door, monotonic version, per-recipient re-key, doorId binding, signing) is
// isolated from the (separately-tested) policy engine + DB.

import crypto from "crypto";

jest.mock("@/plugins/door-access-controller/model", () => ({
  __esModule: true,
  default: {
    listCards: jest.fn(),
    listDoors: jest.fn(),
    getPolicyDoc: jest.fn(),
    nextEnvelopeVersion: jest.fn(),
    deleteCardsByUserID: jest.fn(),
    upsertCard: jest.fn(),
  },
}));
jest.mock("@/plugins/door-access-controller/config", () => ({
  __esModule: true,
  PLUGIN_ID: "door-access-controller",
  PERM_ADMIN: "door-access-controller:admin",
  resolveConfig: jest.fn(async () => ({ offlineTtlMinutes: 60, defaultTimezone: "America/Chicago", requireGoodStanding: false, allowAdminBypass: false })),
}));
jest.mock("@/plugins/door-access-controller/facts", () => ({ __esModule: true, factsFromUser: jest.fn() }));
jest.mock("@/plugins/door-access-controller/policy", () => ({ __esModule: true, decide: jest.fn(), allowedDoorsForFacts: jest.fn() }));
jest.mock("@/app/api/v1/users/service", () => ({ __esModule: true, default: { getUserByQuery: jest.fn(async () => ({ userID: "u1" })) } }));
jest.mock("@/lib/access-control", () => ({ __esModule: true, pushAllowlist: jest.fn(), accessControlReady: jest.fn(() => false) }));
jest.mock("@/lib/audit", () => ({ __esModule: true, auditLog: jest.fn() }));

import Service from "@/plugins/door-access-controller/service";
import Model from "@/plugins/door-access-controller/model";
import { factsFromUser } from "@/plugins/door-access-controller/facts";
import { allowedDoorsForFacts } from "@/plugins/door-access-controller/policy";
import { auditLog } from "@/lib/audit";
import { encryptCode, recipientIndexKey, credHashFor, generateCardToken } from "@/plugins/door-access-controller/cardCrypto";
import { verifyAllowlist } from "@/plugins/door-access-controller/allowlistCrypto";

const CODE = "TESTtoken0123456789ab"; // the plaintext card code the fixtures encrypt
const WINDOWS = [{ days: [1, 2], start: "08:00", end: "17:00" }];

beforeAll(() => {
  process.env.DOOR_CARD_ENC_KEY = "unit-test-enc-secret-000000000000";
  process.env.DOOR_CARD_INDEX_KEY = "unit-test-index-secret-1111111111";
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  process.env.DOOR_ALLOWLIST_SIGNING_KEY = privateKey.export({ type: "pkcs8", format: "der" }).toString("base64");
  process.env.DOOR_ALLOWLIST_VERIFY_KEY = publicKey.export({ type: "spki", format: "der" }).toString("base64");
});

beforeEach(() => {
  jest.clearAllMocks();
  Model.listDoors.mockResolvedValue([{ doorId: "front" }, { doorId: "back" }]);
  Model.getPolicyDoc.mockResolvedValue({ rules: [], accountOverrides: {} });
  Model.listCards.mockResolvedValue([{ userID: "u1", codeEnc: encryptCode(CODE), credentialType: "qr", status: "active" }]);
  factsFromUser.mockReturnValue({ ok: true });
  // this card is allowed at "front" only
  allowedDoorsForFacts.mockReturnValue([{ doorId: "front", windows: WINDOWS }]);
  let v = 0;
  Model.nextEnvelopeVersion.mockImplementation(async () => ++v); // strictly monotonic
});

describe("buildDoorEnvelope (§2)", () => {
  test("builds a signed, verifiable per-door envelope bound to doorId, with only that door's entries", async () => {
    const env = await Service.buildDoorEnvelope({ doorId: "front", recipientId: "edge-1" });
    expect(verifyAllowlist(env)).toBe(true);
    expect(env.payload.doorId).toBe("front"); // F2 binding
    expect(env.payload.entryCount).toBe(1);
    expect(env.payload.entries[0].windows).toEqual(WINDOWS);
    // a door with no allowed cards → empty (allowedDoorsForFacts returns only "front")
    const back = await Service.buildDoorEnvelope({ doorId: "back", recipientId: "edge-1" });
    expect(back.payload.doorId).toBe("back");
    expect(back.payload.entryCount).toBe(0);
  });

  test("credHash is HMAC(recipientIndexKey(recipientId), code) — re-keyed per recipient (F1)", async () => {
    const edge = await Service.buildDoorEnvelope({ doorId: "front", recipientId: "edge-1" });
    const broker = await Service.buildDoorEnvelope({ doorId: "front", recipientId: "broker-1" });
    const expectedEdge = credHashFor(recipientIndexKey("edge-1"), Buffer.from(CODE, "utf8"));
    expect(edge.payload.entries[0].credHash).toBe(expectedEdge);
    // same card, different recipient → different hash (a stolen edge key can't match the broker copy)
    expect(broker.payload.entries[0].credHash).not.toBe(edge.payload.entries[0].credHash);
  });

  test("version is strictly monotonic per build (anti-rollback, F5)", async () => {
    const a = await Service.buildDoorEnvelope({ doorId: "front", recipientId: "edge-1" });
    const b = await Service.buildDoorEnvelope({ doorId: "front", recipientId: "edge-1" });
    expect(b.payload.version).toBeGreaterThan(a.payload.version);
    expect(Number.isInteger(a.payload.version)).toBe(true);
  });

  test("validates inputs (fail-closed)", async () => {
    await expect(Service.buildDoorEnvelope({ recipientId: "edge-1" })).rejects.toMatchObject({ status: 400 });
    await expect(Service.buildDoorEnvelope({ doorId: "front" })).rejects.toMatchObject({ status: 400 });
  });
});

describe("enrollCard entropy floor (§5/R3)", () => {
  test("rejects a below-floor qr/app credential", async () => {
    await expect(Service.enrollCard({ userID: "u1", code: "0402", credentialType: "qr" })).rejects.toMatchObject({ status: 400 });
    await expect(Service.enrollCard({ userID: "u1", code: "0402", credentialType: "app" })).rejects.toMatchObject({ status: 400 });
    expect(Model.upsertCard).not.toHaveBeenCalled();
  });

  test("accepts a system-issued token for qr/app", async () => {
    const r = await Service.enrollCard({ userID: "u1", code: generateCardToken(), credentialType: "qr" });
    expect(r.userID).toBe("u1");
    expect(Model.upsertCard).toHaveBeenCalled();
  });

  test("accepts an NFC-UID (accepted risk) and audits it", async () => {
    const r = await Service.enrollCard({ userID: "u1", code: "04A2B3C4", credentialType: "nfc" });
    expect(r.userID).toBe("u1");
    expect(auditLog).toHaveBeenCalledWith("door-access.enroll", expect.objectContaining({ outcome: "low-entropy-accepted", credentialType: "nfc" }));
  });
});
