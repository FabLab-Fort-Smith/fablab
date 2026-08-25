// vps/lib/brokerProtocol.js — Link-A message dispatch (pure). Uses the real brokerService + a
// store-backed envelope so a scan flows end to end; doorId comes from ctx (the cert), never the msg.

import crypto from "crypto";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { signEnvelope } from "@/plugins/door-access-controller/allowlistCrypto";
import { recipientIndexKey, credHashFor } from "@/plugins/door-access-controller/cardCrypto";
import { makeBrokerStore } from "../../vps/lib/brokerStore.js";
import { ingestEnvelope } from "../../vps/lib/brokerService.js";
import { handleEdgeMessage } from "../../vps/lib/brokerProtocol.js";

const BROKER_ID = "broker-1";
const CODE = "TESTtoken0123456789ab";

function cloudEnvelope({ doorId = "front", version = 1, code = CODE } = {}) {
  const ch = credHashFor(recipientIndexKey(BROKER_ID), Buffer.from(code, "utf8"));
  return signEnvelope({ doorId, version, issuedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3600e3).toISOString(), tz: "UTC", entryCount: 1, entries: [{ credHash: ch, windows: [] }] });
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
  dir = path.join(os.tmpdir(), "bproto-" + crypto.randomBytes(6).toString("hex"));
  await fs.mkdir(dir, { recursive: true });
  store = makeBrokerStore({ dir });
});
afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }); });

test("ping → pong; hello → hello_ack; unknown → null", async () => {
  expect(await handleEdgeMessage({ t: "ping" }, {})).toEqual({ t: "pong" });
  expect(await handleEdgeMessage({ t: "hello", edgeId: "e1" }, {})).toEqual({ t: "hello_ack" });
  expect(await handleEdgeMessage({ t: "whatever" }, {})).toBeNull();
  expect(await handleEdgeMessage(null, {})).toBeNull();
});

test("scan → result: offline grant from the cached envelope, echoing requestId (never cred)", async () => {
  await ingestEnvelope(store, cloudEnvelope());
  const resp = await handleEdgeMessage({ t: "scan", cred: CODE, requestId: 7, nonce: "n1" }, { store, doorId: "front" });
  expect(resp).toEqual({ t: "result", requestId: 7, granted: true, reason: "granted", mode: "offline" });
  expect(JSON.stringify(resp)).not.toContain(CODE); // cred never echoed back
});

test("scan uses ctx.doorId (server-derived), NOT any doorId in the message", async () => {
  await ingestEnvelope(store, cloudEnvelope({ doorId: "front" }));
  // message claims doorId "vault", but ctx (the cert) says "front" → decided against "front"
  const resp = await handleEdgeMessage({ t: "scan", cred: CODE, doorId: "vault", requestId: 1 }, { store, doorId: "front" });
  expect(resp.granted).toBe(true);
  // and with ctx.doorId that has no envelope → fail-secure deny (never falls back to the msg's doorId)
  const denied = await handleEdgeMessage({ t: "scan", cred: CODE, doorId: "front", requestId: 2 }, { store, doorId: "vault" });
  expect(denied).toEqual({ t: "result", requestId: 2, granted: false, reason: "no-envelope", mode: "offline" });
});

test("scan with no resolvable doorId (unknown edge) → bad-request deny", async () => {
  const resp = await handleEdgeMessage({ t: "scan", cred: CODE, requestId: 3 }, { store, doorId: undefined });
  expect(resp).toEqual({ t: "result", requestId: 3, granted: false, reason: "bad-request", mode: "offline" });
});

test("online scan: a well-formed cloud grant is authoritative (mode online)", async () => {
  const cloudAuthorize = jest.fn(async () => ({ granted: true, reason: "granted" }));
  const resp = await handleEdgeMessage({ t: "scan", cred: CODE, requestId: 9 }, { store, cloudAuthorize, doorId: "front" });
  expect(resp).toEqual({ t: "result", requestId: 9, granted: true, reason: "granted", mode: "online" });
});

// --- audit relay (S6-b-b): the broker is a stateless pass-through; edgeId comes from ctx (cert), not msg ---

const REC = [{ prev: "", bootEpoch: "b", seq: 0, ts: 1, event: {}, hash: "h" }];

test("audit → relays with the cert edgeId (never the message's) and returns the cloud verdict", async () => {
  const seen = [];
  const relayAudit = async (a) => { seen.push(a); return "accepted"; };
  const resp = await handleEdgeMessage(
    { t: "audit", batchId: "b1", records: REC, signature: "sig", edgeId: "SPOOFED" },
    { edgeId: "front-01", relayAudit }
  );
  expect(resp).toEqual({ t: "audit_ack", batchId: "b1", status: "accepted" });
  expect(seen).toEqual([{ edgeId: "front-01", records: REC, signature: "sig" }]); // cert edgeId, msg id ignored
});

test("audit passes the cloud's rejected/deferred verdict straight through", async () => {
  for (const v of ["rejected", "deferred"]) {
    const resp = await handleEdgeMessage({ t: "audit", batchId: "b", records: REC, signature: "s" }, { edgeId: "e1", relayAudit: async () => v });
    expect(resp.status).toBe(v);
  }
});

test("a malformed / oversize / unsigned batch → rejected, never relayed", async () => {
  const relayAudit = jest.fn(async () => "accepted");
  const bad = [
    { t: "audit", batchId: "b", records: [], signature: "s" },              // empty
    { t: "audit", batchId: "b", records: REC },                             // no signature
    { t: "audit", batchId: "b", records: "nope", signature: "s" },          // not an array
    { t: "audit", batchId: "b", records: Array.from({ length: 1001 }, () => REC[0]), signature: "s" }, // oversize
  ];
  for (const m of bad) {
    const resp = await handleEdgeMessage(m, { edgeId: "e1", relayAudit });
    expect(resp).toMatchObject({ t: "audit_ack", status: "rejected" });
  }
  expect(relayAudit).not.toHaveBeenCalled();
});

test("an unauthenticated connection (no cert edgeId) → rejected, never relayed", async () => {
  const relayAudit = jest.fn(async () => "accepted");
  const resp = await handleEdgeMessage({ t: "audit", batchId: "b", records: REC, signature: "s" }, { relayAudit });
  expect(resp.status).toBe("rejected");
  expect(relayAudit).not.toHaveBeenCalled();
});

test("no relay channel wired, or relay throws → deferred (edge keeps the records)", async () => {
  expect((await handleEdgeMessage({ t: "audit", batchId: "b", records: REC, signature: "s" }, { edgeId: "e1" })).status).toBe("deferred");
  const throwing = async () => { throw new Error("uplink boom"); };
  expect((await handleEdgeMessage({ t: "audit", batchId: "b", records: REC, signature: "s" }, { edgeId: "e1", relayAudit: throwing })).status).toBe("deferred");
});

test("a bogus relay verdict is coerced to deferred (fail-secure, never a false accept)", async () => {
  const resp = await handleEdgeMessage({ t: "audit", batchId: "b", records: REC, signature: "s" }, { edgeId: "e1", relayAudit: async () => "granted" });
  expect(resp.status).toBe("deferred");
});
