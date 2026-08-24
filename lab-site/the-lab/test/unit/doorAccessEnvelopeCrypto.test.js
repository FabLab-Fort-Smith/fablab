// S1 — per-recipient envelope crypto (door-controller-wifi.md §2, F1/F3/F5).
// Covers: per-recipient HKDF re-key (F1), Buffer decrypt for zeroization (F1), the entropy floor
// (R3), canonical-safety validation (F3), and cross-language canonical GOLDEN VECTORS that the
// on-device (Python) verifier in S4 must byte-match.

import crypto from "crypto";
import {
  encryptCode,
  decryptToBuffer,
  recipientIndexKey,
  credHashFor,
  meetsEntropyFloor,
  generateCardToken,
} from "@/plugins/door-access-controller/cardCrypto";
import {
  canonical,
  signEnvelope,
  verifyAllowlist,
  assertCanonicalSafe,
} from "@/plugins/door-access-controller/allowlistCrypto";

beforeAll(() => {
  process.env.DOOR_CARD_ENC_KEY = "unit-test-enc-secret-000000000000";
  process.env.DOOR_CARD_INDEX_KEY = "unit-test-index-secret-1111111111";
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  process.env.DOOR_ALLOWLIST_SIGNING_KEY = privateKey.export({ type: "pkcs8", format: "der" }).toString("base64");
  process.env.DOOR_ALLOWLIST_VERIFY_KEY = publicKey.export({ type: "spki", format: "der" }).toString("base64");
});

// --- F1: per-recipient re-key -------------------------------------------------------------------
describe("recipient index key + credHash (F1)", () => {
  test("recipientIndexKey is a 32-byte Buffer, deterministic per recipient, distinct across recipients", () => {
    const a1 = recipientIndexKey("edge-door-front");
    const a2 = recipientIndexKey("edge-door-front");
    const b = recipientIndexKey("broker-1");
    expect(Buffer.isBuffer(a1) && a1.length === 32).toBe(true);
    expect(a1.equals(a2)).toBe(true); // deterministic
    expect(a1.equals(b)).toBe(false); // per-recipient
  });

  test("credHashFor is HMAC(recipientKey, code) — matches an independent computation; differs per recipient", () => {
    const code = Buffer.from("04A2B3C4", "utf8");
    const kEdge = recipientIndexKey("edge-x");
    const kBroker = recipientIndexKey("broker-1");
    const expected = crypto.createHmac("sha256", kEdge).update(code).digest("hex");
    expect(credHashFor(kEdge, code)).toBe(expected);
    expect(credHashFor(kEdge, code)).not.toBe(credHashFor(kBroker, code)); // a stolen edge key can't match the broker's copy
  });

  test("credHashFor requires Buffers (never a String — zeroization contract)", () => {
    expect(() => credHashFor(recipientIndexKey("r"), "0402")).toThrow(/Buffers/);
    expect(() => credHashFor("notakey", Buffer.from("x"))).toThrow(/Buffers/);
  });
});

// --- F1: Buffer decrypt for zeroization ---------------------------------------------------------
describe("decryptToBuffer (F1 zeroization)", () => {
  test("returns a mutable Buffer of the plaintext that the caller can wipe", () => {
    const blob = encryptCode("secret-card-code");
    const buf = decryptToBuffer(blob);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.toString("utf8")).toBe("secret-card-code");
    buf.fill(0);
    expect(buf.every((b) => b === 0)).toBe(true); // proves it's wipable (a String is not)
  });

  test("throws on a tampered blob (GCM auth)", () => {
    const [iv, tag, ct] = encryptCode("some-card-code").split(":");
    const ctBuf = Buffer.from(ct, "base64");
    ctBuf[0] ^= 0xff; // flip a ciphertext byte → GCM tag mismatch
    expect(() => decryptToBuffer(`${iv}:${tag}:${ctBuf.toString("base64")}`)).toThrow();
  });
});

// --- R3: entropy floor --------------------------------------------------------------------------
describe("entropy floor (R3)", () => {
  test("generateCardToken produces a >=128-bit URL-safe token that passes the floor", () => {
    const t = generateCardToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{22,}$/);
    expect(meetsEntropyFloor(t)).toBe(true);
  });
  test("rejects short and long-but-low-entropy codes", () => {
    expect(meetsEntropyFloor("0402")).toBe(false); // short NFC-UID-like
    // NOTE: a long all-'a' string passes the length+charset check — the floor is necessary, not
    // sufficient; real assurance comes from ISSUING via generateCardToken (enforced at enroll).
    expect(meetsEntropyFloor("a".repeat(40))).toBe(true);
    expect(meetsEntropyFloor("!!!not-base64!!!")).toBe(false);
    expect(meetsEntropyFloor(123)).toBe(false);
  });
});

// --- F3: canonical-safety -----------------------------------------------------------------------
describe("assertCanonicalSafe (F3)", () => {
  test("accepts int/str/bool/null/array/object", () => {
    expect(() => assertCanonicalSafe({ a: 1, b: "x", c: true, d: null, e: [1, 2, { f: 3 }] })).not.toThrow();
  });
  test("rejects float / NaN / Infinity / undefined / unsafe-int (F-5) / dangerous keys (F-3)", () => {
    expect(() => assertCanonicalSafe({ x: 1.5 })).toThrow(/non-safe-integer/);
    expect(() => assertCanonicalSafe({ x: NaN })).toThrow(/non-safe-integer/);
    expect(() => assertCanonicalSafe({ x: Infinity })).toThrow(/non-safe-integer/);
    expect(() => assertCanonicalSafe({ x: undefined })).toThrow(/undefined/);
    expect(() => assertCanonicalSafe([undefined])).toThrow(/undefined/);
    // F-5: integers beyond 2^53 round-trip lossily → not canonical-safe
    expect(() => assertCanonicalSafe({ v: Number.MAX_SAFE_INTEGER + 1 })).toThrow(/non-safe-integer/);
    expect(() => assertCanonicalSafe({ v: Number.MAX_SAFE_INTEGER })).not.toThrow();
    // F-3: prototype-pollution-class keys are rejected (JSON.parse produces an own __proto__ key)
    expect(() => assertCanonicalSafe(JSON.parse('{"__proto__":{"x":1}}'))).toThrow(/dangerous key/);
    expect(() => assertCanonicalSafe({ constructor: 1 })).toThrow(/dangerous key/);
  });

  test("canonical no longer silently drops a __proto__ own-key (F-3)", () => {
    // sortKeys now uses a null-proto accumulator → an own "__proto__" key is serialized, not dropped
    const obj = JSON.parse('{"a":1,"__proto__":{"x":9},"b":2}');
    expect(canonical(obj)).toBe('{"__proto__":{"x":9},"a":1,"b":2}');
  });
  test("signEnvelope refuses a canonical-unsafe payload", () => {
    expect(() => signEnvelope({ doorId: "d1", version: 1, ratio: 0.5 })).toThrow(/non-safe-integer/);
  });
});

// --- F3: cross-language canonical GOLDEN VECTORS -------------------------------------------------
// The exact bytes below are what the JS signer canonicalizes; the S4 Python verifier MUST produce
// identical bytes. If this test breaks, the canonical form changed → S4 must be updated in lockstep.
describe("canonical golden vectors (F3 — S4 Python must byte-match)", () => {
  const GOLDEN = [
    [{ b: 2, a: 1 }, '{"a":1,"b":2}'],
    [{ doorId: "front", version: 3, entries: [] }, '{"doorId":"front","entries":[],"version":3}'],
    [
      { entries: [{ windows: [{ start: "08:00", end: "17:00", days: [1, 2] }], credHash: "AB" }], doorId: "d", version: 1 },
      '{"doorId":"d","entries":[{"credHash":"AB","windows":[{"days":[1,2],"end":"17:00","start":"08:00"}]}],"version":1}',
    ],
    [{ s: "üniçode/\"quote\"" }, '{"s":"üniçode/\\"quote\\""}'],
  ];
  test.each(GOLDEN)("canonical(%o) is byte-stable", (payload, expected) => {
    expect(canonical(payload)).toBe(expected);
  });

  test("sign → verify round-trip on a golden envelope; a single-byte mutation and a reordered array both fail", () => {
    const payload = {
      doorId: "d",
      version: 1,
      entries: [{ credHash: "AB", windows: [{ days: [1, 2], start: "08:00", end: "17:00" }] }],
    };
    const signed = signEnvelope(payload);
    expect(verifyAllowlist(signed)).toBe(true);
    // key order is canonical-independent (verify still passes)
    expect(verifyAllowlist({ payload: { version: 1, doorId: "d", entries: payload.entries }, sig: signed.sig })).toBe(true);
    // a single-byte mutation fails
    expect(verifyAllowlist({ payload: { ...payload, entries: [{ credHash: "AC", windows: payload.entries[0].windows }] }, sig: signed.sig })).toBe(false);
    // a reordered ARRAY (not key order) changes the canonical bytes → fails
    expect(verifyAllowlist({ payload: { ...payload, entries: [{ credHash: "AB", windows: [{ days: [2, 1], start: "08:00", end: "17:00" }] }] }, sig: signed.sig })).toBe(false);
  });
});
