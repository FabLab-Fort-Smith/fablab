// vps/lib/otaManifest.js — OTA manifest signing/verify + anti-rollback eligibility.
// Ed25519 keypair generated per run; env keys set like the offline-allowlist interop test.

import crypto from "crypto";
import {
  canonical, compareSemver, validateManifest,
  signManifest, verifyManifest, isEligibleUpdate,
  fwSigningReady, fwVerifyReady,
} from "../../vps/lib/otaManifest.js";

const goodManifest = (over = {}) => ({
  role: "pico",
  version: "1.4.0",
  minVersion: "1.0.0",
  sha256: "a".repeat(64),
  size: 184320,
  blobKey: "firmware/pico/1.4.0.bin",
  builtAt: "2026-08-22T00:00:00Z",
  commit: "deadbeef",
  ...over,
});

beforeAll(() => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  process.env.DOOR_FW_SIGNING_KEY = privateKey.export({ type: "pkcs8", format: "der" }).toString("base64");
  process.env.DOOR_FW_VERIFY_KEY = publicKey.export({ type: "spki", format: "der" }).toString("base64");
});

test("readiness flags reflect the env keys", () => {
  expect(fwSigningReady()).toBe(true);
  expect(fwVerifyReady()).toBe(true);
});

test("canonical is key-order independent", () => {
  expect(canonical({ b: 1, a: 2 })).toBe(canonical({ a: 2, b: 1 }));
  expect(canonical({ a: 1 })).not.toBe(canonical({ a: 2 }));
});

test("compareSemver orders correctly", () => {
  expect(compareSemver("1.0.0", "1.0.1")).toBe(-1);
  expect(compareSemver("1.2.0", "1.1.9")).toBe(1);
  expect(compareSemver("2.0.0", "2.0.0")).toBe(0);
  expect(compareSemver("1.10.0", "1.9.0")).toBe(1); // numeric, not lexical
});

test("validateManifest catches shape/format problems", () => {
  expect(validateManifest(goodManifest())).toEqual([]);
  expect(validateManifest(goodManifest({ role: "nope" }))[0]).toMatch(/role/);
  expect(validateManifest(goodManifest({ version: "1.4" }))[0]).toMatch(/version/);
  expect(validateManifest(goodManifest({ sha256: "xyz" }))[0]).toMatch(/sha256/);
  expect(validateManifest(goodManifest({ size: 0 }))[0]).toMatch(/size/);
  expect(validateManifest(goodManifest({ blobKey: "" })).some((e) => /blobKey/.test(e))).toBe(true);
  expect(validateManifest(goodManifest({ version: "1.0.0", minVersion: "2.0.0" })).some((e) => /minVersion must be <=/.test(e))).toBe(true);
});

test("sign → verify roundtrip", () => {
  const signed = signManifest(goodManifest());
  expect(signed.alg).toBe("ed25519");
  expect(verifyManifest(signed)).toBe(true);
});

test("verify fails on a tampered manifest (1 field changed after signing)", () => {
  const signed = signManifest(goodManifest());
  signed.manifest.version = "9.9.9"; // tamper
  expect(verifyManifest(signed)).toBe(false);
});

test("verify fails against the wrong public key", () => {
  const signed = signManifest(goodManifest());
  const other = crypto.generateKeyPairSync("ed25519").publicKey;
  expect(verifyManifest(signed, other)).toBe(false);
});

test("signing an invalid manifest throws (fail loud in CI)", () => {
  expect(() => signManifest(goodManifest({ sha256: "bad" }))).toThrow(/invalid manifest/);
});

describe("isEligibleUpdate (anti-rollback + staging gate)", () => {
  test("newer signed version → eligible", () => {
    const signed = signManifest(goodManifest({ version: "1.4.0" }));
    expect(isEligibleUpdate({ signed, role: "pico", currentVersion: "1.3.0" })).toEqual({ eligible: true, reason: "ok", version: "1.4.0" });
  });
  test("equal version → not-newer (up to date)", () => {
    const signed = signManifest(goodManifest({ version: "1.3.0" }));
    expect(isEligibleUpdate({ signed, role: "pico", currentVersion: "1.3.0" }).reason).toBe("not-newer");
  });
  test("older version → not-newer (anti-rollback / downgrade blocked)", () => {
    const signed = signManifest(goodManifest({ version: "1.2.0" }));
    expect(isEligibleUpdate({ signed, role: "pico", currentVersion: "1.3.0" }).reason).toBe("not-newer");
  });
  test("role mismatch → rejected", () => {
    const signed = signManifest(goodManifest({ role: "pi-zero", version: "1.4.0" }));
    expect(isEligibleUpdate({ signed, role: "pico", currentVersion: "1.0.0" }).reason).toBe("role-mismatch");
  });
  test("current below manifest.minVersion → staged upgrade required", () => {
    const signed = signManifest(goodManifest({ version: "2.0.0", minVersion: "1.5.0" }));
    expect(isEligibleUpdate({ signed, role: "pico", currentVersion: "1.0.0" }).reason).toBe("below-min-version");
  });
  test("bad signature → bad-signature (fail closed)", () => {
    const signed = signManifest(goodManifest({ version: "1.4.0" }));
    signed.sig = Buffer.from("nope").toString("base64");
    expect(isEligibleUpdate({ signed, role: "pico", currentVersion: "1.0.0" }).reason).toBe("bad-signature");
  });
});
