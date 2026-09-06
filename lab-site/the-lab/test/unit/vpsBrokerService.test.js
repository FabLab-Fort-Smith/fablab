// vps/lib/brokerService.js (S2b-1) — the rung 1→2 decision ladder + envelope ingest.

import crypto from "crypto";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { signEnvelope } from "@/plugins/door-access-controller/allowlistCrypto";
import { recipientIndexKey, credHashFor } from "@/plugins/door-access-controller/cardCrypto";
import { makeBrokerStore } from "../../vps/lib/brokerStore.js";
import { handleScan, ingestEnvelope } from "../../vps/lib/brokerService.js";

const BROKER_ID = "broker-1";
const CODE = "TESTtoken0123456789ab";
const future = () => new Date(Date.now() + 3600e3).toISOString();

function cloudEnvelope({ doorId = "front", version = 1, code = CODE, windows = [] } = {}) {
  const ch = credHashFor(recipientIndexKey(BROKER_ID), Buffer.from(code, "utf8"));
  return signEnvelope({ doorId, version, issuedAt: new Date().toISOString(), expiresAt: future(), tz: "UTC", entryCount: 1, entries: [{ credHash: ch, windows }] });
}

let dir, store;
beforeAll(() => {
  process.env.DOOR_CARD_INDEX_KEY = "unit-test-index-secret-1111111111";
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  process.env.DOOR_ALLOWLIST_SIGNING_KEY = privateKey.export({ type: "pkcs8", format: "der" }).toString("base64");
  process.env.DOOR_ALLOWLIST_VERIFY_KEY = publicKey.export({ type: "spki", format: "der" }).toString("base64");
  process.env.BROKER_INDEX_KEY = recipientIndexKey(BROKER_ID).toString("base64");
});
beforeEach(async () => {
  dir = path.join(os.tmpdir(), "bsvc-" + crypto.randomBytes(6).toString("hex"));
  await fs.mkdir(dir, { recursive: true });
  store = makeBrokerStore({ dir });
});
afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }); });

describe("handleScan ladder", () => {
  test("offline (no cloud): grants from the cached envelope", async () => {
    await ingestEnvelope(store, cloudEnvelope());
    expect(await handleScan({ store }, { doorId: "front", code: CODE })).toEqual({ granted: true, reason: "granted", mode: "offline" });
  });

  test("offline with no envelope → fail-secure deny", async () => {
    expect(await handleScan({ store }, { doorId: "front", code: CODE })).toEqual({ granted: false, reason: "no-envelope", mode: "offline" });
  });

  test("rung 1: a reachable cloud is authoritative (wins even when offline would deny)", async () => {
    // no envelope stored → offline would deny; cloud grants → online grant
    const cloudAuthorize = jest.fn(async () => ({ granted: true, reason: "granted" }));
    expect(await handleScan({ store, cloudAuthorize }, { doorId: "front", code: CODE })).toEqual({ granted: true, reason: "granted", mode: "online" });
    expect(cloudAuthorize).toHaveBeenCalledWith({ doorId: "front", code: CODE });
  });

  test("cloud authoritative DENY is honored, not overridden by a grant-capable offline envelope", async () => {
    await ingestEnvelope(store, cloudEnvelope()); // offline WOULD grant this code
    const cloudAuthorize = jest.fn(async () => ({ granted: false, reason: "denied" }));
    // the cloud revoked access → the online deny wins; we must NOT fall through to the stale offline grant
    expect(await handleScan({ store, cloudAuthorize }, { doorId: "front", code: CODE })).toEqual({ granted: false, reason: "denied", mode: "online" });
  });

  test("cloud unreachable (throws) → offline fallback", async () => {
    await ingestEnvelope(store, cloudEnvelope());
    const cloudAuthorize = jest.fn(async () => { throw new Error("ECONNREFUSED"); });
    expect(await handleScan({ store, cloudAuthorize }, { doorId: "front", code: CODE })).toEqual({ granted: true, reason: "granted", mode: "offline" });
  });

  test("malformed cloud result never fails open → offline fallback", async () => {
    const cloudAuthorize = jest.fn(async () => ({ granted: "yes" })); // bad shape
    // no envelope → offline denies; proves we did NOT trust the malformed grant
    expect(await handleScan({ store, cloudAuthorize }, { doorId: "front", code: CODE })).toEqual({ granted: false, reason: "no-envelope", mode: "offline" });
  });

  test("bad request (missing doorId/code) → deny", async () => {
    expect(await handleScan({ store }, { code: CODE })).toEqual({ granted: false, reason: "bad-request", mode: "offline" });
    expect(await handleScan({ store }, { doorId: "front" })).toEqual({ granted: false, reason: "bad-request", mode: "offline" });
  });
});

describe("ingestEnvelope", () => {
  test("verifies + stores a valid envelope; rejects a forged push; enforces anti-rollback", async () => {
    expect(await ingestEnvelope(store, cloudEnvelope({ version: 2 }))).toEqual({ stored: true, version: 2 });
    const forged = cloudEnvelope({ version: 3 }); forged.sig = Buffer.from("nope").toString("base64");
    expect(await ingestEnvelope(store, forged)).toEqual({ stored: false, reason: "bad-signature" });
    expect(await ingestEnvelope(store, cloudEnvelope({ version: 1 }))).toEqual({ stored: false, reason: "stale-version" });
  });
});
