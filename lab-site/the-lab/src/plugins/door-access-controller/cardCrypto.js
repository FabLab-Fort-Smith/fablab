// Card-code cryptography for the door-access addon. Card/QR codes are Restricted/PII
// (the-lab/CLAUDE.md §5), so they are NEVER stored in the clear:
//   - at rest: AES-256-GCM with a RANDOM IV + auth tag (authenticated; no CBC/ECB/static-IV)
//   - lookup:  a keyed HMAC-SHA256 "blind index" so we can find a card without a
//              reversible/deterministic ciphertext to scan against.
// Two independent env secrets (separate keys per purpose). No `|| ''` fallbacks — a
// missing key throws (fail loud). Keys are hashed to 32 bytes so any high-entropy
// secret length works without a "must be exactly 32 chars" foot-gun.

import crypto from "crypto";

const ENC_ENV = "DOOR_CARD_ENC_KEY";
const IDX_ENV = "DOOR_CARD_INDEX_KEY";

/** @returns {boolean} true only when both card keys are configured (used by checkReady). */
export function cardCryptoReady() {
  return Boolean(process.env[ENC_ENV] && process.env[IDX_ENV]);
}

function keyBytes(envName) {
  const v = process.env[envName];
  if (!v) throw new Error(`${envName} is not configured`);
  return crypto.createHash("sha256").update(v).digest(); // 32 bytes
}

/**
 * Encrypt a card code for storage. Format: base64(iv):base64(tag):base64(ciphertext).
 * @param {string} code @returns {string}
 */
export function encryptCode(code) {
  const iv = crypto.randomBytes(12); // 96-bit nonce, GCM standard
  const cipher = crypto.createCipheriv("aes-256-gcm", keyBytes(ENC_ENV), iv);
  const ct = Buffer.concat([cipher.update(String(code), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

/**
 * Decrypt a stored card code. Throws if the blob is tampered (GCM auth failure).
 * @param {string} blob @returns {string}
 */
export function decryptCode(blob) {
  const [ivb, tagb, ctb] = String(blob).split(":");
  if (!ivb || !tagb || !ctb) throw new Error("malformed card ciphertext");
  const decipher = crypto.createDecipheriv("aes-256-gcm", keyBytes(ENC_ENV), Buffer.from(ivb, "base64"));
  decipher.setAuthTag(Buffer.from(tagb, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ctb, "base64")), decipher.final()]).toString("utf8");
}

/**
 * Keyed blind index for equality lookup (never reversible to the code).
 * @param {string} code @returns {string} hex
 */
export function blindIndex(code) {
  return crypto.createHmac("sha256", keyBytes(IDX_ENV)).update(String(code)).digest("hex");
}
