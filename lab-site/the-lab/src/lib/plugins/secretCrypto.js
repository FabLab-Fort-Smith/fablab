// Encryption-at-rest for addon (plugin) `type:"secret"` config values.
//
// Addon secrets (integration API keys, webhook signing keys, etc.) are Restricted
// data (the-lab/CLAUDE.md §3/§5): they are NEVER persisted in the clear. This
// module is the ONLY place addon secrets are turned into/out of ciphertext:
//   - at rest: AES-256-GCM with a RANDOM IV + auth tag (authenticated encryption;
//     no CBC/ECB/static-IV — CWE-311/327), mirroring the vetted construction in
//     src/plugins/door-access-controller/cardCrypto.js.
//   - key: a purpose-separated 32-byte subkey derived via HKDF-SHA256 from the
//     app's single required ENCRYPTION_KEY, so no new provisioned secret is needed
//     and the addon-secret key is domain-separated from PII-field encryption
//     (separate keys per purpose — topic-cryptography).
//
// Crypto FAILS CLOSED: a missing key throws (no `|| ''` fallback), and a tampered
// ciphertext throws on the GCM auth check. The stored envelope is self-describing
// (`ENVELOPE_PREFIX`) so we can tell ciphertext from a freshly-entered plaintext
// and never double-encrypt or leak a value.

import crypto from "crypto";

/** Marker prefix identifying an addon-secret ciphertext envelope. */
export const ENVELOPE_PREFIX = "enc:v1:gcm:";
const KEY_ENV = "ENCRYPTION_KEY";
// Fixed, non-secret HKDF salt + info for domain separation from other uses of the
// same master key. Changing these would invalidate existing ciphertext.
const HKDF_SALT = Buffer.from("the-lab:addon-secret:salt:v1", "utf8");
const HKDF_INFO = Buffer.from("the-lab:addon-config-secret:v1", "utf8");

/**
 * Derive the 32-byte AES key. Throws (fail loud/closed) if ENCRYPTION_KEY is unset.
 * @returns {Buffer}
 */
function deriveKey() {
  const master = process.env[KEY_ENV];
  if (!master) throw new Error(`${KEY_ENV} is not configured`);
  return Buffer.from(crypto.hkdfSync("sha256", Buffer.from(master, "utf8"), HKDF_SALT, HKDF_INFO, 32));
}

/**
 * True when a value is an addon-secret ciphertext envelope produced by this module.
 * @param {unknown} value
 * @returns {boolean}
 */
export function isEncrypted(value) {
  return typeof value === "string" && value.startsWith(ENVELOPE_PREFIX);
}

/**
 * Encrypt a plaintext addon secret for storage.
 * Envelope: `enc:v1:gcm:<iv_b64>:<tag_b64>:<ciphertext_b64>`.
 * @param {string} plaintext
 * @returns {string} the ciphertext envelope
 */
export function encryptSecret(plaintext) {
  const iv = crypto.randomBytes(12); // 96-bit nonce, GCM standard
  const cipher = crypto.createCipheriv("aes-256-gcm", deriveKey(), iv);
  const ct = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENVELOPE_PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

/**
 * Decrypt a stored addon-secret envelope. Throws if malformed or tampered
 * (GCM auth failure) — callers handle by failing closed.
 * @param {string} envelope
 * @returns {string} the plaintext secret
 */
export function decryptSecret(envelope) {
  if (!isEncrypted(envelope)) throw new Error("not an addon-secret envelope");
  const [ivB64, tagB64, ctB64] = envelope.slice(ENVELOPE_PREFIX.length).split(":");
  if (!ivB64 || !tagB64 || !ctB64) throw new Error("malformed addon-secret ciphertext");
  const decipher = crypto.createDecipheriv("aes-256-gcm", deriveKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]).toString("utf8");
}

/**
 * Return a copy of a config with every `type:"secret"` field encrypted for storage.
 * An already-encrypted value is left untouched (idempotent — this is what preserves
 * a blank-patch: the stored ciphertext passes through unchanged and is never
 * re-encrypted or exposed). Non-secret fields are copied verbatim.
 * @param {object} schema - the plugin's configSchema
 * @param {object} config - the validated config to persist
 * @returns {Record<string, any>}
 */
export function encryptSecretConfig(schema = {}, config = {}) {
  const out = {};
  for (const [k, v] of Object.entries(config || {})) {
    if (schema?.[k]?.type === "secret" && typeof v === "string" && v.length > 0 && !isEncrypted(v)) {
      out[k] = encryptSecret(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Return a copy of a config with every ciphertext-envelope value decrypted for
 * server-side point-of-use (e.g. handing config to a plugin's runtime). Schema-
 * agnostic: only values that are addon-secret envelopes are decrypted; everything
 * else is copied verbatim. Throws if any envelope is tampered (fail closed).
 * @param {object} config
 * @returns {Record<string, any>}
 */
export function decryptSecretConfig(config = {}) {
  const out = {};
  for (const [k, v] of Object.entries(config || {})) {
    out[k] = isEncrypted(v) ? decryptSecret(v) : v;
  }
  return out;
}
