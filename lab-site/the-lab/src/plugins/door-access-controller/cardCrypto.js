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

// --- offline-envelope re-keying (door-controller-wifi.md §2, F1) ---------------------------------
// An offline tier (broker / edge) matches a scan with a keyed HMAC of the card code. It must NOT
// hold the system-wide DOOR_CARD_INDEX_KEY, so the cloud re-keys each recipient's envelope with a
// PER-RECIPIENT key derived by HKDF from the master. A leaked recipient key compromises only that
// recipient's scope and never the master (HKDF is one-way).

const HKDF_INFO_PREFIX = "dooraccess/index/v1|";

/**
 * Derive a per-recipient index key from the master DOOR_CARD_INDEX_KEY.
 * @param {string} recipientId  e.g. an edgeDeviceId or a brokerId (server-assigned, collision-free)
 * @returns {Buffer} 32-byte key
 */
export function recipientIndexKey(recipientId) {
  if (typeof recipientId !== "string" || !recipientId) throw new Error("recipientId is required");
  const info = Buffer.from(HKDF_INFO_PREFIX + recipientId, "utf8");
  // salt intentionally empty: the ikm (keyBytes) is already a fixed 32-byte high-entropy key.
  return Buffer.from(crypto.hkdfSync("sha256", keyBytes(IDX_ENV), Buffer.alloc(0), info, 32));
}

/**
 * Re-keyed blind index for a recipient, over a PLAINTEXT-CODE BUFFER (not a String — so the caller
 * can zeroize it; §2 F1). @param {Buffer} recipientKey @param {Buffer} codeBuf @returns {string} hex
 */
export function credHashFor(recipientKey, codeBuf) {
  if (!Buffer.isBuffer(recipientKey) || !Buffer.isBuffer(codeBuf)) throw new Error("credHashFor requires Buffers");
  return crypto.createHmac("sha256", recipientKey).update(codeBuf).digest("hex");
}

/**
 * Decrypt a stored card code to a MUTABLE Buffer so the caller can `fill(0)` it after use
 * (String from decryptCode is immutable and unwipable — §2 F1 zeroization). Throws on tamper.
 * @param {string} blob @returns {Buffer}
 */
export function decryptToBuffer(blob) {
  const [ivb, tagb, ctb] = String(blob).split(":");
  if (!ivb || !tagb || !ctb) throw new Error("malformed card ciphertext");
  const decipher = crypto.createDecipheriv("aes-256-gcm", keyBytes(ENC_ENV), Buffer.from(ivb, "base64"));
  decipher.setAuthTag(Buffer.from(tagb, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ctb, "base64")), decipher.final()]);
}

// --- entropy floor (door-controller-wifi.md §5, F1/R3) -------------------------------------------
// A recipient index key only bounds a leaked key's damage if the code space is large. QR/app codes
// must be system-issued ≥128-bit CSPRNG tokens; NFC-UIDs cannot meet this and are an accepted risk.

const TOKEN_BYTES = 16; // 128-bit
// base64url of 16 bytes = 22 chars; require the system charset + length to reject low-entropy codes
// like a long "aaaa…". This gates NEW enrollments; it is a necessary-not-sufficient proxy for
// "system-issued" — pair it with issuing via generateCardToken().
const TOKEN_RE = /^[A-Za-z0-9_-]{22,}$/;

/** Generate a system card token: URL-safe base64 of 128 bits of CSPRNG. @returns {string} */
export function generateCardToken() {
  return crypto.randomBytes(TOKEN_BYTES).toString("base64url");
}

/**
 * Does a code meet the entropy floor for high-assurance credential types (qr/app)?
 * @param {string} code @returns {boolean}
 */
export function meetsEntropyFloor(code) {
  return typeof code === "string" && TOKEN_RE.test(code);
}
