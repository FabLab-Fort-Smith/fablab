// Signing for the offline allowlist snapshot (Flow C). Ed25519 (asymmetric) so the app
// holds the PRIVATE signing key and the socket-server/device holds only the PUBLIC verify
// key — a socket-server compromise cannot forge a snapshot. Keys are base64-encoded DER
// (pkcs8 private / spki public) in env; no fallbacks (fail loud).
//
// Generate a keypair:
//   node -e "const{generateKeyPairSync}=require('crypto');const{publicKey,privateKey}=generateKeyPairSync('ed25519');\
//   console.log('DOOR_ALLOWLIST_SIGNING_KEY='+privateKey.export({type:'pkcs8',format:'der'}).toString('base64'));\
//   console.log('DOOR_ALLOWLIST_VERIFY_KEY='+publicKey.export({type:'spki',format:'der'}).toString('base64'))"

import crypto from "crypto";

const PRIV_ENV = "DOOR_ALLOWLIST_SIGNING_KEY";
const PUB_ENV = "DOOR_ALLOWLIST_VERIFY_KEY";

/** @returns {boolean} true when the private signing key is set (the app can sign). */
export function allowlistSigningReady() {
  return Boolean(process.env[PRIV_ENV]);
}

function privateKey() {
  const v = process.env[PRIV_ENV];
  if (!v) throw new Error(`${PRIV_ENV} is not configured`);
  return crypto.createPrivateKey({ key: Buffer.from(v, "base64"), format: "der", type: "pkcs8" });
}

function publicKeyFromEnv() {
  const v = process.env[PUB_ENV];
  if (!v) throw new Error(`${PUB_ENV} is not configured`);
  return crypto.createPublicKey({ key: Buffer.from(v, "base64"), format: "der", type: "spki" });
}

/**
 * Deterministic (canonical) JSON: object keys sorted recursively so a re-serialized payload
 * signs/verifies identically regardless of key order in transit. Arrays keep their order.
 * @param {*} value @returns {string}
 */
export function canonical(value) {
  return JSON.stringify(sortKeys(value));
}
function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") {
    return Object.keys(v).sort().reduce((acc, k) => {
      acc[k] = sortKeys(v[k]);
      return acc;
    }, {});
  }
  return v;
}

/**
 * Sign a payload → a self-contained signed envelope.
 * @param {object} payload @returns {{payload:object, sig:string, alg:"ed25519"}}
 */
export function signAllowlist(payload) {
  const sig = crypto.sign(null, Buffer.from(canonical(payload)), privateKey());
  return { payload, sig: sig.toString("base64"), alg: "ed25519" };
}

/**
 * Verify a signed envelope. Returns false on any problem (bad shape, wrong/absent key, bad
 * signature) — never throws.
 * @param {{payload:object, sig:string}} signed
 * @param {crypto.KeyObject} [publicKey]  defaults to DOOR_ALLOWLIST_VERIFY_KEY
 * @returns {boolean}
 */
export function verifyAllowlist(signed, publicKey) {
  try {
    if (!signed || !signed.payload || !signed.sig) return false;
    const pk = publicKey || publicKeyFromEnv();
    return crypto.verify(null, Buffer.from(canonical(signed.payload)), pk, Buffer.from(signed.sig, "base64"));
  } catch {
    return false;
  }
}
