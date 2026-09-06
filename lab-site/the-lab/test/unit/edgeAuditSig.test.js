// verifyEdgeBatchSig (S6-b-a): the cloud verify half of edge audit-batch signing. Includes a GOLDEN
// vector whose signature was produced by the Python edge signer (`crypto.sign_audit_batch`) over the
// same `canonical({edgeId, records})` bytes — proving JS↔Py byte-parity of the signed message.

import crypto from "crypto";

import { verifyEdgeBatchSig } from "@/plugins/door-access-controller/edgeAuditSig";
import { canonical } from "@/plugins/door-access-controller/allowlistCrypto";

// Golden: keypair + signature generated once and reproduced identically by the Python edge signer
// (deterministic Ed25519 over identical canonical bytes — asserted in edge/tests/test_sign_audit.py).
const GOLDEN = {
  pub: "MCowBQYDK2VwAyEA3xiHh6m1l34Uel0nPYxtRscqmJoWxEAMLna67JVfF+Q=",
  edgeId: "edge-1",
  records: [
    { prev: "", bootEpoch: "b", seq: 0, ts: 1000, event: { doorId: "front", granted: true, reason: "granted", mode: "offline" }, hash: "H0" },
    { prev: "H0", bootEpoch: "b", seq: 1, ts: 1001, event: { doorId: "front", granted: false, reason: "no-window", mode: "offline" }, hash: "H1" },
  ],
  sig: "a/HhnoAOMXx1DzXehOnYtHtYcfPFTzGMrNajJJjI8NBJ3wPq+GbPKSXZomovJHS0UOzSqG8S2SC3Ro8xu/BNBQ==",
};

test("GOLDEN: the Python-signed batch verifies in JS (byte-parity of the signed message)", () => {
  expect(verifyEdgeBatchSig(GOLDEN.pub, GOLDEN.edgeId, GOLDEN.records, GOLDEN.sig)).toBe(true);
});

test("any mutation of the signed bytes fails verification (fail-secure)", () => {
  const tamperedRecords = JSON.parse(JSON.stringify(GOLDEN.records));
  tamperedRecords[0].event.granted = false; // flip a decision
  expect(verifyEdgeBatchSig(GOLDEN.pub, GOLDEN.edgeId, tamperedRecords, GOLDEN.sig)).toBe(false);
  expect(verifyEdgeBatchSig(GOLDEN.pub, "other-edge", GOLDEN.records, GOLDEN.sig)).toBe(false); // rebind edgeId
});

test("bad key / bad sig / malformed input all return false, never throw", () => {
  expect(verifyEdgeBatchSig("not-a-key", GOLDEN.edgeId, GOLDEN.records, GOLDEN.sig)).toBe(false);
  expect(verifyEdgeBatchSig(GOLDEN.pub, GOLDEN.edgeId, GOLDEN.records, "not-a-sig")).toBe(false);
  expect(verifyEdgeBatchSig(GOLDEN.pub, GOLDEN.edgeId, GOLDEN.records, "")).toBe(false);
  expect(verifyEdgeBatchSig(null, null, null, null)).toBe(false);
  expect(verifyEdgeBatchSig(undefined, GOLDEN.edgeId, GOLDEN.records, GOLDEN.sig)).toBe(false);
});

test("a non-Ed25519 key is rejected rather than mis-verifying", () => {
  const rsa = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 }).publicKey
    .export({ type: "spki", format: "der" }).toString("base64");
  expect(verifyEdgeBatchSig(rsa, GOLDEN.edgeId, GOLDEN.records, GOLDEN.sig)).toBe(false);
});

test("a freshly generated JS keypair round-trips (sign in JS, verify here)", () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const pub = publicKey.export({ type: "spki", format: "der" }).toString("base64");
  const records = [{ prev: "", bootEpoch: "z", seq: 0, ts: 5, event: { doorId: "back", granted: true, reason: "granted", mode: "offline" }, hash: "x" }];
  const sig = crypto.sign(null, Buffer.from(canonical({ edgeId: "e9", records })), privateKey).toString("base64");
  expect(verifyEdgeBatchSig(pub, "e9", records, sig)).toBe(true);
  expect(verifyEdgeBatchSig(pub, "e9", records.concat(records), sig)).toBe(false); // extra record
});
