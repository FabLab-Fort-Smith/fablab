// refreshBrokerEnvelopes (S2c-2b): the app builds per-broker×door SIGNED envelopes (re-keyed to each
// broker's brokerIndexKey) and pushes them to the cloud relay. Model/users/config/transport mocked;
// the Ed25519 signing + AES card crypto + HKDF re-key are REAL (verifies the output byte-for-byte).

jest.mock("@/plugins/door-access-controller/model", () => ({
  __esModule: true,
  default: { listCards: jest.fn(), listDoors: jest.fn(), getPolicyDoc: jest.fn(), nextEnvelopeVersion: jest.fn() },
}));
jest.mock("@/app/api/v1/users/service", () => ({ __esModule: true, default: { getUserByQuery: jest.fn() } }));
jest.mock("@/plugins/door-access-controller/config", () => ({ __esModule: true, PLUGIN_ID: "door-access-controller", resolveConfig: jest.fn() }));
jest.mock("@/lib/access-control", () => ({ __esModule: true, pushAllowlist: jest.fn(), pushBrokerEnvelopes: jest.fn() }));
jest.mock("@/lib/audit", () => ({ __esModule: true, auditLog: jest.fn() }));

import crypto from "crypto";
import Service from "@/plugins/door-access-controller/service";
import Model from "@/plugins/door-access-controller/model";
import UsersService from "@/app/api/v1/users/service";
import { resolveConfig } from "@/plugins/door-access-controller/config";
import { pushBrokerEnvelopes } from "@/lib/access-control";
import { verifyAllowlist } from "@/plugins/door-access-controller/allowlistCrypto";
import { encryptCode, recipientIndexKey, credHashFor } from "@/plugins/door-access-controller/cardCrypto";

const MEMBER_RULE = { id: "m", roles: ["member"], doors: ["front"], windows: [] };
const activeMember = { userID: "u1", role: "member", membership: { type: "co-op", status: "active", subscriptionStatus: "ACTIVE" } };
const CODE = "CODEONE1234567890abcd"; // the plaintext card code

let SIGNING_KEY;
beforeAll(() => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  SIGNING_KEY = privateKey.export({ type: "pkcs8", format: "der" }).toString("base64");
  process.env.DOOR_ALLOWLIST_SIGNING_KEY = SIGNING_KEY;
  process.env.DOOR_ALLOWLIST_VERIFY_KEY = publicKey.export({ type: "spki", format: "der" }).toString("base64");
  process.env.DOOR_CARD_ENC_KEY = "test-enc-key";
  process.env.DOOR_CARD_INDEX_KEY = "test-index-master-key";
});
beforeEach(() => {
  jest.clearAllMocks();
  resolveConfig.mockResolvedValue({ requireGoodStanding: true, allowAdminBypass: true, defaultTimezone: "America/Chicago", offlineTtlMinutes: 30 });
  Model.getPolicyDoc.mockResolvedValue({ rules: [MEMBER_RULE], accountOverrides: {} });
  Model.listDoors.mockResolvedValue([{ doorId: "front" }]);
  Model.listCards.mockResolvedValue([{ userID: "u1", codeEnc: encryptCode(CODE), status: "active", credentialType: "nfc" }]);
  UsersService.getUserByQuery.mockResolvedValue(activeMember);
  let v = 0;
  Model.nextEnvelopeVersion.mockImplementation(async () => (v += 1)); // strictly monotonic
  pushBrokerEnvelopes.mockResolvedValue({ connected: true, relayed: 1, rejected: 0 });
  delete process.env.BROKER_DOOR_MAP;
  process.env.DOOR_ALLOWLIST_SIGNING_KEY = SIGNING_KEY; // (re)ensure signing ready
});

test("builds one signed, verifiable envelope per owned door, re-keyed to the broker, and pushes it", async () => {
  process.env.BROKER_DOOR_MAP = JSON.stringify({ "broker-a": ["front"] });
  const res = await Service.refreshBrokerEnvelopes({ now: new Date("2026-08-24T19:00:00Z") });

  expect(res).toMatchObject({ pushed: true, brokers: 1, brokersPushed: 1, brokersOffline: 0 });
  expect(pushBrokerEnvelopes).toHaveBeenCalledTimes(1);
  const [brokerId, envelopes] = pushBrokerEnvelopes.mock.calls[0];
  expect(brokerId).toBe("broker-a");
  expect(envelopes).toHaveLength(1);
  const env = envelopes[0];
  expect(verifyAllowlist(env)).toBe(true);                 // real signature
  expect(env.payload.doorId).toBe("front");                // doorId-bound (F2)
  expect(env.payload.expiresAt).toBe("2026-08-24T19:30:00.000Z");
  // credHash is the card code HMAC'd under broker-a's OWN derived key (F1 re-key)
  const expected = credHashFor(recipientIndexKey("broker-a"), Buffer.from(CODE));
  expect(env.payload.entries).toEqual([{ credHash: expected, windows: [] }]);
});

test("per-recipient re-key: the SAME card yields a DIFFERENT credHash for a different broker", async () => {
  process.env.BROKER_DOOR_MAP = JSON.stringify({ "broker-a": ["front"], "broker-b": ["front"] });
  await Service.refreshBrokerEnvelopes({});
  const byBroker = Object.fromEntries(pushBrokerEnvelopes.mock.calls.map(([id, envs]) => [id, envs[0].payload.entries[0].credHash]));
  expect(byBroker["broker-a"]).not.toBe(byBroker["broker-b"]);
  expect(byBroker["broker-a"]).toBe(credHashFor(recipientIndexKey("broker-a"), Buffer.from(CODE)));
  expect(byBroker["broker-b"]).toBe(credHashFor(recipientIndexKey("broker-b"), Buffer.from(CODE)));
});

test("signing key not set → skipped, nothing pushed (fail-secure)", async () => {
  process.env.BROKER_DOOR_MAP = JSON.stringify({ "broker-a": ["front"] });
  delete process.env.DOOR_ALLOWLIST_SIGNING_KEY;
  const res = await Service.refreshBrokerEnvelopes({});
  expect(res).toEqual({ pushed: false, reason: "signing-key-not-set" });
  expect(pushBrokerEnvelopes).not.toHaveBeenCalled();
});

test("no BROKER_DOOR_MAP → no-brokers no-op", async () => {
  const res = await Service.refreshBrokerEnvelopes({});
  expect(res).toEqual({ pushed: false, reason: "no-brokers" });
  expect(pushBrokerEnvelopes).not.toHaveBeenCalled();
});

test("a broker that isn't connected (503) is counted offline, not fatal", async () => {
  process.env.BROKER_DOOR_MAP = JSON.stringify({ "broker-a": ["front"] });
  pushBrokerEnvelopes.mockResolvedValue({ connected: false, relayed: 0, rejected: 0 });
  const res = await Service.refreshBrokerEnvelopes({});
  expect(res).toMatchObject({ pushed: true, brokersPushed: 0, brokersOffline: 1 });
});

test("one broker's failure does not abort the others (per-broker fail-secure)", async () => {
  process.env.BROKER_DOOR_MAP = JSON.stringify({ "broker-a": ["front"], "broker-b": ["front"] });
  pushBrokerEnvelopes.mockImplementation(async (id) => {
    if (id === "broker-a") throw new Error("transport boom");
    return { connected: true, relayed: 1, rejected: 0 };
  });
  const res = await Service.refreshBrokerEnvelopes({});
  expect(pushBrokerEnvelopes).toHaveBeenCalledTimes(2); // both attempted
  expect(res).toMatchObject({ pushed: true, brokersPushed: 1 }); // broker-b still landed
});

test("a prototype-pollution broker key in BROKER_DOOR_MAP is dropped (L3, CWE-1321)", async () => {
  process.env.BROKER_DOOR_MAP = JSON.stringify({ "__proto__": ["front"], "broker-a": ["front"] });
  const res = await Service.refreshBrokerEnvelopes({});
  expect(res).toMatchObject({ brokers: 1 }); // only broker-a, __proto__ filtered
  expect(pushBrokerEnvelopes.mock.calls.map(([id]) => id)).toEqual(["broker-a"]);
  expect(({}).polluted).toBeUndefined(); // no global prototype pollution
});

test("_repushBestEffort fans the change out to brokers too", async () => {
  const spy = jest.spyOn(Service, "refreshBrokerEnvelopes").mockResolvedValue({ pushed: false, reason: "no-brokers" });
  await Service._repushBestEffort();
  expect(spy).toHaveBeenCalledTimes(1);
  spy.mockRestore();
});
