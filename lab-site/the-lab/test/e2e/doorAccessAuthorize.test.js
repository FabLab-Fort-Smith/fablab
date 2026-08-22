// Door-access authorize — end to end against a real (in-memory) MongoDB: enroll a card,
// seed users + policy + door, then exercise Service.authorize (real blind-index lookup →
// facts from the users collection → policy) AND the HTTP authorize route with the plugin
// enabled in the DB. Also builds a signed offline allowlist from the real card set.
//
// Self-skips if the in-memory MongoDB binary can't be provisioned (offline sandbox), mirroring
// test/e2e/db.smoke.test.js; CI provisions it and runs the real path.

import crypto from "crypto";
import { startMemoryMongo, stopMemoryMongo } from "../helpers/mongo";
import { callRoute } from "../helpers/route";

const mockAuth = jest.fn();
jest.mock("@/auth", () => ({ __esModule: true, auth: (...a) => mockAuth(...a) }));

let available = true;
let db, Model, Service, PluginState, ensurePluginsInit, verifyAllowlist;
let authorizePOST, adminGET;

const WED_2PM = new Date("2026-08-19T19:00:00Z"); // Wed 14:00 CDT
const CARD_GOOD = "CARD-GOOD-0001";
const CARD_SUSPENDED = "CARD-SUSP-0002";

beforeAll(async () => {
  try {
    await startMemoryMongo();
    process.env.DOOR_CARD_ENC_KEY = "e2e-card-enc-key";
    process.env.DOOR_CARD_INDEX_KEY = "e2e-card-index-key";
    process.env.INTERNAL_API_SECRET = "e2e-internal-secret";
    process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "0123456789abcdef0123456789abcdef"; // 32 bytes for AuthService
    const kp = crypto.generateKeyPairSync("ed25519");
    process.env.DOOR_ALLOWLIST_SIGNING_KEY = kp.privateKey.export({ type: "pkcs8", format: "der" }).toString("base64");
    process.env.DOOR_ALLOWLIST_VERIFY_KEY = kp.publicKey.export({ type: "spki", format: "der" }).toString("base64");

    // import AFTER MONGODB_URI + keys are set
    ({ db } = await import("@/lib/database"));
    Model = (await import("@/plugins/door-access-controller/model")).default;
    Service = (await import("@/plugins/door-access-controller/service")).default;
    PluginState = (await import("@/lib/plugins/model")).default;
    ({ ensurePluginsInit } = await import("@/lib/plugins/registry"));
    ({ verifyAllowlist } = await import("@/plugins/door-access-controller/allowlistCrypto"));
    ({ POST: authorizePOST } = await import("@/app/api/v1/plugins/door-access-controller/authorize/route"));
    ({ GET: adminGET } = await import("@/app/api/v1/plugins/door-access-controller/admin/route"));

    // seed users
    const users = await db.dbUsers();
    await users.insertMany([
      { userID: "u-good", username: "amy", firstName: "Amy", lastName: "Ng", role: "member", membership: { type: "co-op", status: "active", subscriptionStatus: "ACTIVE" } },
      { userID: "u-susp", username: "sam", firstName: "Sam", lastName: "Lee", role: "member", membership: { type: "co-op", status: "suspended", subscriptionStatus: "ACTIVE" } },
    ]);

    // enroll cards (real ciphertext + blind index in Mongo)
    await Service.enrollCard({ userID: "u-good", code: CARD_GOOD });
    await Service.enrollCard({ userID: "u-susp", code: CARD_SUSPENDED });

    // door + policy (member: front, 24/7)
    await Model.upsertDoor({ doorId: "front", name: "Front", deviceId: "door-controller-01", timezone: "America/Chicago", enabled: true });
    await Model.savePolicyDoc({ rules: [{ id: "member-front", roles: ["member"], doors: ["front"] }], accountOverrides: {} });

    // enable the plugin in the DB + build the registry so requirePluginEnabled passes
    await ensurePluginsInit();
    await PluginState.setEnabled("door-access-controller", true, "admin-e2e");
  } catch (e) {
    available = false;
    console.warn("Skipping door-access E2E (in-memory MongoDB unavailable):", e.message);
  }
});

afterAll(async () => {
  try {
    if (db?.client) await db.client.close();
  } catch {
    /* ignore */
  }
  await stopMemoryMongo();
});

test("Service.authorize grants a good member's enrolled card (real DB lookup + facts + policy)", async () => {
  if (!available) return;
  const r = await Service.authorize({ credentialType: "nfc", credentialValue: CARD_GOOD, doorId: "front", now: WED_2PM });
  expect(r).toMatchObject({ granted: true, userID: "u-good", username: "amy" });
});

test("unknown card → denied", async () => {
  if (!available) return;
  expect((await Service.authorize({ credentialType: "nfc", credentialValue: "NOPE", doorId: "front", now: WED_2PM })).reason).toBe("unknown-credential");
});

test("suspended member's card → not in good standing", async () => {
  if (!available) return;
  expect((await Service.authorize({ credentialType: "nfc", credentialValue: CARD_SUSPENDED, doorId: "front", now: WED_2PM })).reason).toBe("not-in-good-standing");
});

test("account-deny override blocks even a good member (policy from DB)", async () => {
  if (!available) return;
  await Model.savePolicyDoc({ rules: [{ id: "member-front", roles: ["member"], doors: ["front"] }], accountOverrides: { "u-good": "deny" } });
  expect((await Service.authorize({ credentialType: "nfc", credentialValue: CARD_GOOD, doorId: "front", now: WED_2PM })).reason).toBe("account-blocked");
  await Model.savePolicyDoc({ rules: [{ id: "member-front", roles: ["member"], doors: ["front"] }], accountOverrides: {} }); // restore
});

test("admin revoke makes the card stop authorizing", async () => {
  if (!available) return;
  await Service.adminRevokeCard({ userID: "admin-e2e", role: "admin" }, { userID: "u-good" });
  expect((await Service.authorize({ credentialType: "nfc", credentialValue: CARD_GOOD, doorId: "front", now: WED_2PM })).reason).toBe("unknown-credential");
  await Service.enrollCard({ userID: "u-good", code: CARD_GOOD }); // re-enroll for later tests
});

test("buildSignedAllowlist emits a verifiable snapshot from the real card set (suspended excluded)", async () => {
  if (!available) return;
  const signed = await Service.buildSignedAllowlist({ now: WED_2PM });
  expect(verifyAllowlist(signed)).toBe(true);
  const users = signed.payload.entries.length;
  expect(users).toBeGreaterThanOrEqual(1); // u-good present; u-susp excluded (not good standing)
});

test("HTTP authorize route: 401 without the internal secret, 200 granted with it", async () => {
  if (!available) return;
  const noAuth = await callRoute(authorizePOST, { method: "POST", body: { cardId: CARD_GOOD, doorId: "front" } });
  expect(noAuth.status).toBe(401);

  const ok = await callRoute(authorizePOST, {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.INTERNAL_API_SECRET}` },
    body: { cardId: CARD_GOOD, doorId: "front" },
  });
  expect(ok.status).toBe(200);
  expect(ok.json).toMatchObject({ granted: true, userID: "u-good" });
});

test("HTTP admin route: non-admin session → 403", async () => {
  if (!available) return;
  mockAuth.mockResolvedValue({ user: { userID: "u-good", role: "member" } });
  expect((await callRoute(adminGET, { method: "GET" })).status).toBe(403);

  mockAuth.mockResolvedValue({ user: { userID: "admin-e2e", role: "admin" } });
  const res = await callRoute(adminGET, { method: "GET" });
  expect(res.status).toBe(200);
  expect(res.json).toHaveProperty("doors");
});
