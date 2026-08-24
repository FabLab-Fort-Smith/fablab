// vps/lib/brokerAccess.js — rung-2 offline decision + the S1→S2 crypto parity:
// the CLOUD (S1: allowlistCrypto.signEnvelope + cardCrypto.recipientIndexKey/credHashFor) produces a
// per-door envelope re-keyed for this broker; the BROKER (S2) verifies it and matches a scan with its
// provisioned BROKER_INDEX_KEY — end to end, no shared master key on the broker.

import crypto from "crypto";
import { signEnvelope } from "@/plugins/door-access-controller/allowlistCrypto";
import { recipientIndexKey, credHashFor } from "@/plugins/door-access-controller/cardCrypto";
import { makeBrokerStore } from "../../vps/lib/brokerStore.js";
import { REASON, decideAgainstEnvelope, setEnvelope, authorizeOffline, verifyEnvelope, credHash } from "../../vps/lib/brokerAccess.js";

const BROKER_ID = "broker-1";
const CODE = "TESTtoken0123456789ab";
const future = () => new Date(Date.now() + 3600e3).toISOString();
const past = () => new Date(Date.now() - 1000).toISOString();

// Build a per-door envelope exactly as the cloud (S1) would for this broker.
function cloudEnvelope({ doorId = "front", version = 1, code = CODE, windows = [], expiresAt = future(), tz = "UTC" } = {}) {
  const brokerKey = recipientIndexKey(BROKER_ID);
  const ch = credHashFor(brokerKey, Buffer.from(code, "utf8"));
  return signEnvelope({ doorId, version, issuedAt: new Date().toISOString(), expiresAt, tz, entryCount: 1, entries: [{ credHash: ch, windows }] });
}

beforeAll(() => {
  process.env.DOOR_CARD_INDEX_KEY = "unit-test-index-secret-1111111111"; // master (cloud side only)
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  process.env.DOOR_ALLOWLIST_SIGNING_KEY = privateKey.export({ type: "pkcs8", format: "der" }).toString("base64");
  process.env.DOOR_ALLOWLIST_VERIFY_KEY = publicKey.export({ type: "spki", format: "der" }).toString("base64");
  // The cloud derived this broker's key by HKDF and PROVISIONED it here (base64) — the broker never
  // holds DOOR_CARD_INDEX_KEY. This is what makes the parity real.
  process.env.BROKER_INDEX_KEY = recipientIndexKey(BROKER_ID).toString("base64");
});

describe("S1→S2 parity + rung-2 decide", () => {
  test("a cloud-signed, broker-re-keyed envelope GRANTS the matching code", () => {
    const env = cloudEnvelope();
    expect(verifyEnvelope(env)).toBe(true);
    expect(decideAgainstEnvelope(env, { doorId: "front", code: CODE })).toEqual({ granted: true, reason: REASON.GRANTED });
  });

  test("broker credHash equals the cloud's recipientIndexKey re-key for this broker", () => {
    expect(credHash(CODE)).toBe(credHashFor(recipientIndexKey(BROKER_ID), Buffer.from(CODE, "utf8")));
    // a DIFFERENT recipient's key would not match — a stolen edge key can't open the broker's copy
    expect(credHash(CODE)).not.toBe(credHashFor(recipientIndexKey("edge-x"), Buffer.from(CODE, "utf8")));
  });

  test("deny-by-default paths", () => {
    expect(decideAgainstEnvelope(cloudEnvelope(), { doorId: "front", code: "wrong-code" })).toEqual({ granted: false, reason: REASON.UNKNOWN_CREDENTIAL });
    // doorId binding (F2): a valid door-A envelope must not satisfy a door-B decision
    expect(decideAgainstEnvelope(cloudEnvelope({ doorId: "front" }), { doorId: "back", code: CODE })).toEqual({ granted: false, reason: REASON.DOOR_MISMATCH });
    // expired
    expect(decideAgainstEnvelope(cloudEnvelope({ expiresAt: past() }), { doorId: "front", code: CODE })).toEqual({ granted: false, reason: REASON.EXPIRED });
    // tampered signature
    const bad = cloudEnvelope(); bad.payload.entries[0].credHash = "deadbeef";
    expect(decideAgainstEnvelope(bad, { doorId: "front", code: CODE })).toEqual({ granted: false, reason: REASON.BAD_SIGNATURE });
  });

  test("time windows: grant inside, NO_WINDOW outside", () => {
    // Monday 2026-08-24 12:00 UTC — allow Mon 08:00–17:00 (expiry pinned after `now`)
    const now = new Date("2026-08-24T12:00:00Z");
    const exp = "2026-08-24T23:00:00Z";
    const okEnv = cloudEnvelope({ windows: [{ days: [1], start: "08:00", end: "17:00" }], expiresAt: exp });
    expect(decideAgainstEnvelope(okEnv, { doorId: "front", code: CODE, now })).toEqual({ granted: true, reason: REASON.GRANTED });
    const outEnv = cloudEnvelope({ windows: [{ days: [1], start: "08:00", end: "11:00" }], expiresAt: exp });
    expect(decideAgainstEnvelope(outEnv, { doorId: "front", code: CODE, now })).toEqual({ granted: false, reason: REASON.NO_WINDOW });
  });
});

describe("setEnvelope + authorizeOffline (store-backed)", () => {
  let dir, store;
  beforeEach(async () => {
    const fs = await import("fs/promises"); const os = await import("os"); const path = await import("path");
    dir = path.join(os.tmpdir(), "ba-" + crypto.randomBytes(6).toString("hex"));
    await fs.mkdir(dir, { recursive: true });
    store = makeBrokerStore({ dir });
  });

  test("setEnvelope rejects a forged push (bad signature), stores a valid one", async () => {
    const forged = cloudEnvelope(); forged.sig = Buffer.from("nope").toString("base64");
    expect(await setEnvelope(store, forged)).toEqual({ stored: false, reason: REASON.BAD_SIGNATURE });
    expect(await setEnvelope(store, cloudEnvelope({ version: 1 }))).toEqual({ stored: true, version: 1 });
  });

  test("authorizeOffline: no envelope → NO_ENVELOPE (fail-secure); stored → decides", async () => {
    expect(await authorizeOffline(store, { doorId: "front", code: CODE })).toEqual({ granted: false, reason: REASON.NO_ENVELOPE });
    await setEnvelope(store, cloudEnvelope({ version: 1 }));
    expect(await authorizeOffline(store, { doorId: "front", code: CODE })).toEqual({ granted: true, reason: REASON.GRANTED });
  });

  test("setEnvelope enforces anti-rollback via the store", async () => {
    await setEnvelope(store, cloudEnvelope({ version: 3 }));
    expect(await setEnvelope(store, cloudEnvelope({ version: 2 }))).toEqual({ stored: false, reason: "stale-version" });
  });
});

describe("fail-secure on misconfig / bad data (F-3)", () => {
  test("a missing/short BROKER_INDEX_KEY denies (error), never throws", () => {
    const env = cloudEnvelope();
    const saved = process.env.BROKER_INDEX_KEY;
    try {
      delete process.env.BROKER_INDEX_KEY;
      expect(decideAgainstEnvelope(env, { doorId: "front", code: CODE })).toEqual({ granted: false, reason: REASON.ERROR });
      process.env.BROKER_INDEX_KEY = Buffer.alloc(8).toString("base64"); // wrong length
      expect(decideAgainstEnvelope(env, { doorId: "front", code: CODE })).toEqual({ granted: false, reason: REASON.ERROR });
    } finally {
      process.env.BROKER_INDEX_KEY = saved;
    }
  });

  test("a non-parseable expiresAt is treated as EXPIRED (NaN <= now guard)", () => {
    const env = cloudEnvelope({ expiresAt: "not-a-date" });
    expect(decideAgainstEnvelope(env, { doorId: "front", code: CODE })).toEqual({ granted: false, reason: REASON.EXPIRED });
  });
});
