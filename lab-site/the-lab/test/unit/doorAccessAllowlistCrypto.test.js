// Ed25519 signing for the offline allowlist: sign/verify round-trip, canonical (key-order
// independent) payloads, and rejection of tampered payloads / wrong keys.

import crypto from "crypto";
import { signAllowlist, verifyAllowlist, allowlistSigningReady, canonical } from "@/plugins/door-access-controller/allowlistCrypto";

beforeAll(() => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  process.env.DOOR_ALLOWLIST_SIGNING_KEY = privateKey.export({ type: "pkcs8", format: "der" }).toString("base64");
  process.env.DOOR_ALLOWLIST_VERIFY_KEY = publicKey.export({ type: "spki", format: "der" }).toString("base64");
});

test("signing readiness reflects the private key", () => {
  expect(allowlistSigningReady()).toBe(true);
});

test("sign → verify round-trips", () => {
  const signed = signAllowlist({ version: 1, entries: [{ credHash: "C1" }] });
  expect(verifyAllowlist(signed)).toBe(true);
});

test("canonical is key-order independent (verify survives re-ordered keys)", () => {
  const signed = signAllowlist({ a: 1, b: 2, nested: { y: 1, x: 2 } });
  expect(canonical({ b: 2, a: 1, nested: { x: 2, y: 1 } })).toBe(canonical({ a: 1, b: 2, nested: { y: 1, x: 2 } }));
  expect(verifyAllowlist({ payload: { b: 2, a: 1, nested: { x: 2, y: 1 } }, sig: signed.sig })).toBe(true);
});

test("a tampered payload fails verification", () => {
  const signed = signAllowlist({ version: 1, entries: [{ credHash: "C1" }] });
  signed.payload.entries[0].credHash = "HACKED";
  expect(verifyAllowlist(signed)).toBe(false);
});

test("verification fails under a different key", () => {
  const signed = signAllowlist({ version: 1 });
  const other = crypto.generateKeyPairSync("ed25519").publicKey;
  expect(verifyAllowlist(signed, other)).toBe(false);
});

test("malformed envelope → false, never throws", () => {
  expect(verifyAllowlist(null)).toBe(false);
  expect(verifyAllowlist({ payload: { x: 1 } })).toBe(false);
});

test("signing without a private key throws (fail loud)", () => {
  const saved = process.env.DOOR_ALLOWLIST_SIGNING_KEY;
  delete process.env.DOOR_ALLOWLIST_SIGNING_KEY;
  expect(() => signAllowlist({ x: 1 })).toThrow(/DOOR_ALLOWLIST_SIGNING_KEY/);
  process.env.DOOR_ALLOWLIST_SIGNING_KEY = saved;
});
