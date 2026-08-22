// OTA firmware manifest signing/verification + anti-rollback eligibility.
// See docs/architecture/ota-updates.md. Ed25519 (asymmetric): CI holds the PRIVATE signing key
// (DOOR_FW_SIGNING_KEY, vault-only) and every device + the socket-server hold only the PUBLIC verify
// key (DOOR_FW_VERIFY_KEY) — a server/store compromise cannot forge firmware. These are DEDICATED
// keys, separate from the addon's allowlist keys (separation of duties).
//
// Generate a keypair (values are base64 DER — pkcs8 private / spki public):
//   node -e "const{generateKeyPairSync}=require('crypto');const{publicKey,privateKey}=generateKeyPairSync('ed25519');\
//   console.log('DOOR_FW_SIGNING_KEY='+privateKey.export({type:'pkcs8',format:'der'}).toString('base64'));\
//   console.log('DOOR_FW_VERIFY_KEY='+publicKey.export({type:'spki',format:'der'}).toString('base64'))"

import crypto from "crypto";

const PRIV_ENV = "DOOR_FW_SIGNING_KEY";
const PUB_ENV = "DOOR_FW_VERIFY_KEY";

const ROLES = ["pico", "pi-zero"];
const SHA256_RE = /^[0-9a-f]{64}$/;
const SEMVER_RE = /^\d+\.\d+\.\d+$/; // major.minor.patch (no pre-release/build metadata)

/** @returns {boolean} true when the private signing key is set (CI can sign). */
export function fwSigningReady() {
  return Boolean(process.env[PRIV_ENV]);
}

/** @returns {boolean} true when the public verify key is set (server/device can verify). */
export function fwVerifyReady() {
  return Boolean(process.env[PUB_ENV]);
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
 * Deterministic (canonical) JSON: object keys sorted recursively so a re-serialized manifest
 * signs/verifies identically regardless of key order. Arrays keep order. (Same scheme as the
 * addon's allowlistCrypto.canonical, so the two stay mentally interchangeable.)
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
 * Parse "a.b.c" → [a,b,c] ints. Throws on a non-semver string (fail loud — callers validate first).
 * @param {string} s @returns {number[]}
 */
function parseSemver(s) {
  if (typeof s !== "string" || !SEMVER_RE.test(s)) throw new Error(`invalid semver: ${s}`);
  return s.split(".").map((n) => parseInt(n, 10));
}

/**
 * Compare two semver strings. @returns {-1|0|1} (a<b → -1, a==b → 0, a>b → 1).
 */
export function compareSemver(a, b) {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] < pb[i]) return -1;
    if (pa[i] > pb[i]) return 1;
  }
  return 0;
}

/**
 * Validate a manifest's shape + field types/formats. Returns an array of problems ([] = valid).
 * Does NOT check the signature — see verifyManifest. Structural gate before trusting any field.
 * @param {object} m @returns {string[]}
 */
export function validateManifest(m) {
  const errs = [];
  if (!m || typeof m !== "object") return ["manifest is not an object"];
  if (!ROLES.includes(m.role)) errs.push(`role must be one of ${ROLES.join("|")}`);
  if (!SEMVER_RE.test(String(m.version))) errs.push("version must be semver x.y.z");
  if (!SEMVER_RE.test(String(m.minVersion))) errs.push("minVersion must be semver x.y.z");
  if (!SHA256_RE.test(String(m.sha256))) errs.push("sha256 must be 64 lowercase hex chars");
  if (!Number.isInteger(m.size) || m.size <= 0) errs.push("size must be a positive integer");
  if (typeof m.blobKey !== "string" || !m.blobKey) errs.push("blobKey is required");
  // minVersion must not exceed version (a manifest that can never be applied is a config error).
  if (SEMVER_RE.test(String(m.version)) && SEMVER_RE.test(String(m.minVersion)) &&
      compareSemver(m.minVersion, m.version) > 0) {
    errs.push("minVersion must be <= version");
  }
  return errs;
}

/**
 * Sign a manifest → a self-contained signed envelope. Throws if the manifest is invalid or the
 * signing key is absent (fail loud in CI).
 * @param {object} manifest @returns {{manifest:object, sig:string, alg:"ed25519"}}
 */
export function signManifest(manifest) {
  const errs = validateManifest(manifest);
  if (errs.length) throw new Error(`cannot sign invalid manifest: ${errs.join("; ")}`);
  const sig = crypto.sign(null, Buffer.from(canonical(manifest)), privateKey());
  return { manifest, sig: sig.toString("base64"), alg: "ed25519" };
}

/**
 * Verify a signed envelope's signature + shape. Returns false on ANY problem (bad shape, invalid
 * manifest, wrong/absent key, bad signature) — never throws. Integrity of the BLOB is checked
 * separately by the device (SHA-256 == manifest.sha256) after download.
 * @param {{manifest:object, sig:string}} signed
 * @param {crypto.KeyObject} [publicKey] defaults to DOOR_FW_VERIFY_KEY
 * @returns {boolean}
 */
export function verifyManifest(signed, publicKey) {
  try {
    if (!signed || !signed.manifest || !signed.sig) return false;
    if (validateManifest(signed.manifest).length) return false;
    const pk = publicKey || publicKeyFromEnv();
    return crypto.verify(null, Buffer.from(canonical(signed.manifest)), pk, Buffer.from(signed.sig, "base64"));
  } catch {
    return false;
  }
}

/**
 * Decide whether a device should apply a signed manifest — the anti-rollback + staging gate.
 * Verifies the signature, then: role matches, version strictly newer than current, and the device's
 * current version is >= the manifest's minVersion (staged upgrades). Fail-closed on any error.
 * @param {object} args
 * @param {{manifest:object, sig:string}} args.signed
 * @param {string} args.role            the asking device's role
 * @param {string} args.currentVersion  the device's committed version (semver)
 * @param {crypto.KeyObject} [args.publicKey]
 * @returns {{eligible:boolean, reason:string, version?:string}}
 */
export function isEligibleUpdate({ signed, role, currentVersion, publicKey } = {}) {
  try {
    if (!verifyManifest(signed, publicKey)) return { eligible: false, reason: "bad-signature" };
    const m = signed.manifest;
    if (m.role !== role) return { eligible: false, reason: "role-mismatch" };
    if (!SEMVER_RE.test(String(currentVersion))) return { eligible: false, reason: "bad-current-version" };
    if (compareSemver(m.version, currentVersion) <= 0) return { eligible: false, reason: "not-newer" }; // up-to-date / anti-rollback
    if (compareSemver(currentVersion, m.minVersion) < 0) return { eligible: false, reason: "below-min-version" }; // staged upgrade required
    return { eligible: true, reason: "ok", version: m.version };
  } catch {
    return { eligible: false, reason: "error" };
  }
}
