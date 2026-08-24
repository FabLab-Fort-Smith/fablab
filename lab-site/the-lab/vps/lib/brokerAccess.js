// On-site broker: rung-2 offline decision over a per-door signed envelope (Tier 1 — see
// docs/architecture/door-controller-wifi.md §2/§3c). When the cloud is unreachable, the broker
// decides from the cached envelope for the scanned door. Deny-by-default, fail-secure.
//
// The broker holds ONLY its own `BROKER_INDEX_KEY` (a per-broker key the cloud derived by HKDF and
// PROVISIONED here — never the master DOOR_CARD_INDEX_KEY, F1) and the public
// DOOR_ALLOWLIST_VERIFY_KEY. It matches a scan with HMAC(BROKER_INDEX_KEY, code) against the
// envelope's `credHash` values (which the cloud re-keyed with the same broker key).
//
// canonical() is a faithful copy of src/plugins/door-access-controller/allowlistCrypto.canonical
// and vps/lib/offlineAccess.canonical — the cross-language byte-match contract (F3). Keep in lockstep
// (parity test). Env:
//   BROKER_INDEX_KEY           base64 of the 32-byte per-broker HMAC key (provisioned by the cloud)
//   DOOR_ALLOWLIST_VERIFY_KEY  Ed25519 PUBLIC key (base64 spki DER) — verify the envelope signature

import crypto from "crypto";

export const REASON = {
  NO_ENVELOPE: "no-envelope",
  BAD_SIGNATURE: "bad-signature",
  DOOR_MISMATCH: "door-mismatch",
  EXPIRED: "expired",
  UNKNOWN_CREDENTIAL: "unknown-credential",
  NO_WINDOW: "no-window",
  GRANTED: "granted",
};

// --- canonical + verify (copy of the shared contract; do not diverge) --------------------
function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") return Object.keys(v).sort().reduce((a, k) => ((a[k] = sortKeys(v[k])), a), Object.create(null));
  return v;
}
export function canonical(value) {
  return JSON.stringify(sortKeys(value));
}
function verifyKey() {
  const v = process.env.DOOR_ALLOWLIST_VERIFY_KEY;
  if (!v) throw new Error("DOOR_ALLOWLIST_VERIFY_KEY is not configured");
  return crypto.createPublicKey({ key: Buffer.from(v, "base64"), format: "der", type: "spki" });
}

/** Verify a per-door envelope's Ed25519 signature. Never throws. @returns {boolean} */
export function verifyEnvelope(signed) {
  try {
    if (!signed || !signed.payload || !signed.sig) return false;
    return crypto.verify(null, Buffer.from(canonical(signed.payload)), verifyKey(), Buffer.from(signed.sig, "base64"));
  } catch {
    return false;
  }
}

function brokerKeyBytes() {
  const v = process.env.BROKER_INDEX_KEY;
  if (!v) throw new Error("BROKER_INDEX_KEY is not configured");
  const b = Buffer.from(v, "base64");
  if (b.length !== 32) throw new Error("BROKER_INDEX_KEY must be 32 bytes (base64)");
  return b;
}

/** Re-keyed credHash for a scanned code using the broker's provisioned key. @returns {string} hex */
export function credHash(code) {
  return crypto.createHmac("sha256", brokerKeyBytes()).update(String(code)).digest("hex");
}

// --- time window (copy of offlineAccess; keep in lockstep) --------------------------------
function localParts(now, tz) {
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour12: false, weekday: "short", hour: "2-digit", minute: "2-digit" });
  const p = Object.fromEntries(fmt.formatToParts(now).map((x) => [x.type, x.value]));
  const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { day: dayMap[p.weekday], minutes: (parseInt(p.hour, 10) % 24) * 60 + parseInt(p.minute, 10) };
}
function hhmm(s) {
  const [h, m] = String(s).split(":").map((n) => parseInt(n, 10));
  return h * 60 + m;
}
function inWindow(now, tz, w) {
  const { day, minutes } = localParts(now, tz);
  const start = hhmm(w.start), end = hhmm(w.end);
  if (end > start) return w.days.includes(day) && minutes >= start && minutes < end;
  const prev = (day + 6) % 7;
  return (w.days.includes(day) && minutes >= start) || (w.days.includes(prev) && minutes < end);
}

/**
 * Decide a scan against a single already-fetched per-door envelope. Deny-by-default.
 * @param {{payload:object, sig:string}} signed  the envelope cached for `doorId`
 * @param {{doorId:string, code:string, now?:Date, tz?:string}} q
 * @returns {{granted:boolean, reason:string}}
 */
export function decideAgainstEnvelope(signed, { doorId, code, now = new Date(), tz }) {
  if (!verifyEnvelope(signed)) return { granted: false, reason: REASON.BAD_SIGNATURE };
  const p = signed.payload || {};
  if (p.doorId !== doorId) return { granted: false, reason: REASON.DOOR_MISMATCH }; // F2 binding
  if (!p.expiresAt || new Date(p.expiresAt).getTime() <= now.getTime()) return { granted: false, reason: REASON.EXPIRED };
  const entry = (p.entries || []).find((e) => e.credHash === credHash(code));
  if (!entry) return { granted: false, reason: REASON.UNKNOWN_CREDENTIAL };
  const windows = entry.windows || [];
  if (windows.length === 0) return { granted: true, reason: REASON.GRANTED };
  const zone = tz || p.tz || "UTC";
  return windows.some((w) => inWindow(now, zone, w)) ? { granted: true, reason: REASON.GRANTED } : { granted: false, reason: REASON.NO_WINDOW };
}

/**
 * Verify + store a pushed envelope (anti-rollback enforced by the store). Rejects a forged push.
 * @param {object} store  a brokerStore (makeBrokerStore)
 * @param {{payload:object, sig:string}} signed
 * @returns {Promise<{stored:boolean, reason?:string, version?:number}>}
 */
export async function setEnvelope(store, signed) {
  if (!verifyEnvelope(signed)) return { stored: false, reason: REASON.BAD_SIGNATURE };
  return store.putEnvelope(signed);
}

/**
 * Rung-2 decision: fetch this door's cached envelope and decide. Fail-secure (no envelope → deny).
 * @param {object} store @param {{doorId:string, code:string, now?:Date, tz?:string}} q
 * @returns {Promise<{granted:boolean, reason:string}>}
 */
export async function authorizeOffline(store, { doorId, code, now = new Date(), tz }) {
  const signed = await store.getEnvelope(doorId);
  if (!signed) return { granted: false, reason: REASON.NO_ENVELOPE };
  return decideAgainstEnvelope(signed, { doorId, code, now, tz });
}

const BrokerAccess = { REASON, canonical, verifyEnvelope, credHash, decideAgainstEnvelope, setEnvelope, authorizeOffline };
export default BrokerAccess;
