// Card-code crypto: authenticated GCM at rest (random IV) + keyed blind index for
// lookup. Proves round-trip, non-determinism, tamper-detection, and that the blind
// index is deterministic per key but not the raw code.

import { encryptCode, decryptCode, blindIndex, cardCryptoReady } from "@/plugins/door-access-controller/cardCrypto";

beforeAll(() => {
  process.env.DOOR_CARD_ENC_KEY = "unit-test-enc-secret-000000000000";
  process.env.DOOR_CARD_INDEX_KEY = "unit-test-index-secret-1111111111";
});

test("cardCryptoReady is true when both keys are set", () => {
  expect(cardCryptoReady()).toBe(true);
});

test("encrypt → decrypt round-trips", () => {
  const code = "04A2B3C4D5E6";
  expect(decryptCode(encryptCode(code))).toBe(code);
});

test("ciphertext is non-deterministic (random IV) but still decrypts", () => {
  const code = "same-card-code";
  const a = encryptCode(code);
  const b = encryptCode(code);
  expect(a).not.toBe(b);
  expect(decryptCode(a)).toBe(code);
  expect(decryptCode(b)).toBe(code);
});

test("blind index is deterministic per input and differs by input", () => {
  expect(blindIndex("card-1")).toBe(blindIndex("card-1"));
  expect(blindIndex("card-1")).not.toBe(blindIndex("card-2"));
  // not the raw code (it's a 64-hex HMAC)
  expect(blindIndex("card-1")).toMatch(/^[0-9a-f]{64}$/);
});

test("a tampered ciphertext fails authentication (throws)", () => {
  const blob = encryptCode("secret-code");
  const [iv, tag, ct] = blob.split(":");
  const flipped = ct[0] === "A" ? "B" : "A";
  const tampered = `${iv}:${tag}:${flipped}${ct.slice(1)}`;
  expect(() => decryptCode(tampered)).toThrow();
});

test("missing key throws (fail loud, no fallback)", () => {
  const saved = process.env.DOOR_CARD_ENC_KEY;
  delete process.env.DOOR_CARD_ENC_KEY;
  expect(() => encryptCode("x")).toThrow(/DOOR_CARD_ENC_KEY/);
  process.env.DOOR_CARD_ENC_KEY = saved;
});
