import crypto from "crypto";
import { verifySquareSignature } from "@/lib/squareSignature";

const URL = "https://example.com/api/v1/square/webhooks/payment";
const KEY = "test-signing-key";
const BODY = JSON.stringify({ type: "payment.updated", id: "evt_1" });

const sign = (body, url, key) =>
  crypto.createHmac("sha256", key).update(url + body).digest("base64");

describe("verifySquareSignature (SEC-03 fail-closed, SEC-16 constant-time)", () => {
  test("fails closed when the signing key is missing/empty", () => {
    const sig = sign(BODY, URL, KEY);
    expect(verifySquareSignature(BODY, sig, URL, undefined)).toBe(false);
    expect(verifySquareSignature(BODY, sig, URL, "")).toBe(false);
  });

  test("fails closed when the signature header is missing", () => {
    expect(verifySquareSignature(BODY, "", URL, KEY)).toBe(false);
  });

  test("rejects a signature made with a different key", () => {
    expect(verifySquareSignature(BODY, sign(BODY, URL, "other-key"), URL, KEY)).toBe(false);
  });

  test("rejects a tampered body", () => {
    expect(verifySquareSignature(BODY + "x", sign(BODY, URL, KEY), URL, KEY)).toBe(false);
  });

  test("does not throw on a malformed base64 signature", () => {
    expect(verifySquareSignature(BODY, "!!!not-base64!!!", URL, KEY)).toBe(false);
  });

  test("accepts a correctly computed signature", () => {
    expect(verifySquareSignature(BODY, sign(BODY, URL, KEY), URL, KEY)).toBe(true);
  });
});
