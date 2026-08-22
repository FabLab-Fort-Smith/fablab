// Offline access for the socket-server (door-access addon, Flow C). When the app core is
// unreachable, the socket-server decides from the last SIGNED allowlist snapshot the addon
// pushed. This is a faithful PORT of the addon's canonical logic
// (src/plugins/door-access-controller/{allowlistCrypto,offlineDecision,policy}.js); a parity
// test (test/unit/doorAccessOfflineParity.test.js) + the pinned blind-index vector keep the two
// in lockstep. It never derives membership — it only replays a signed, expiring grant.
//
// Env on the socket-server:
//   DOOR_ALLOWLIST_VERIFY_KEY  Ed25519 PUBLIC key (base64 spki DER) — verify the snapshot
//   DOOR_CARD_INDEX_KEY        HMAC secret — recompute a scanned code's blind index (credHash)

import crypto from "crypto";

export const OFFLINE_REASON = {
  NO_SNAPSHOT: "no-snapshot",
  BAD_SIGNATURE: "bad-signature",
  EXPIRED: "expired",
  UNKNOWN_CREDENTIAL: "unknown-credential",
  NO_DOOR: "no-door",
  NO_WINDOW: "no-window",
  GRANTED: "granted",
};

// --- crypto (ported) --------------------------------------------------------------------
function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") return Object.keys(v).sort().reduce((a, k) => ((a[k] = sortKeys(v[k])), a), {});
  return v;
}
function canonical(value) {
  return JSON.stringify(sortKeys(value));
}
function verifyKey() {
  const v = process.env.DOOR_ALLOWLIST_VERIFY_KEY;
  if (!v) throw new Error("DOOR_ALLOWLIST_VERIFY_KEY is not configured");
  return crypto.createPublicKey({ key: Buffer.from(v, "base64"), format: "der", type: "spki" });
}
export function verifySnapshot(signed) {
  try {
    if (!signed || !signed.payload || !signed.sig) return false;
    return crypto.verify(null, Buffer.from(canonical(signed.payload)), verifyKey(), Buffer.from(signed.sig, "base64"));
  } catch {
    return false;
  }
}
export function blindIndex(code) {
  const secret = process.env.DOOR_CARD_INDEX_KEY;
  if (!secret) throw new Error("DOOR_CARD_INDEX_KEY is not configured");
  return crypto.createHmac("sha256", crypto.createHash("sha256").update(secret).digest()).update(String(code)).digest("hex");
}

// --- time window (ported) ---------------------------------------------------------------
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
 * Decide against a signed snapshot. Deny-by-default. `tz` falls back to the snapshot's tz.
 * @param {{payload:object, sig:string}} signed
 * @param {{credHash:string, doorId:string, now?:Date, tz?:string}} q
 * @returns {{granted:boolean, reason:string}}
 */
export function decideOffline(signed, { credHash, doorId, now = new Date(), tz }) {
  if (!verifySnapshot(signed)) return { granted: false, reason: OFFLINE_REASON.BAD_SIGNATURE };
  const p = signed.payload || {};
  if (!p.expiresAt || new Date(p.expiresAt).getTime() <= now.getTime()) return { granted: false, reason: OFFLINE_REASON.EXPIRED };
  const zone = tz || p.tz || "UTC";
  const entry = (p.entries || []).find((e) => e.credHash === credHash);
  if (!entry) return { granted: false, reason: OFFLINE_REASON.UNKNOWN_CREDENTIAL };
  const door = (entry.entries || []).find((d) => d.doorId === doorId);
  if (!door) return { granted: false, reason: OFFLINE_REASON.NO_DOOR };
  if (!door.windows || door.windows.length === 0) return { granted: true, reason: OFFLINE_REASON.GRANTED };
  return door.windows.some((w) => inWindow(now, zone, w)) ? { granted: true, reason: OFFLINE_REASON.GRANTED } : { granted: false, reason: OFFLINE_REASON.NO_WINDOW };
}

// --- snapshot store (in-memory; a restart falls back to fail-secure until the next push) --
let currentSnapshot = null;

/** Store a pushed snapshot AFTER verifying its signature (rejects a forged push). */
export function setSnapshot(signed) {
  if (!verifySnapshot(signed)) return { stored: false, reason: OFFLINE_REASON.BAD_SIGNATURE };
  currentSnapshot = signed;
  return { stored: true, expiresAt: signed.payload?.expiresAt, entryCount: signed.payload?.entryCount };
}
export function getSnapshot() {
  return currentSnapshot;
}
export function clearSnapshot() {
  currentSnapshot = null;
}
export function snapshotStatus(now = new Date()) {
  if (!currentSnapshot) return { hasSnapshot: false };
  const p = currentSnapshot.payload || {};
  return { hasSnapshot: true, expiresAt: p.expiresAt, entryCount: p.entryCount, expired: !p.expiresAt || new Date(p.expiresAt).getTime() <= now.getTime() };
}

/**
 * Authorize a scanned code offline against the stored snapshot.
 * @param {{code:string, doorId:string, now?:Date, tz?:string}} q
 * @returns {{granted:boolean, reason:string}}
 */
export function authorizeOffline({ code, doorId, now = new Date(), tz }) {
  if (!currentSnapshot) return { granted: false, reason: OFFLINE_REASON.NO_SNAPSHOT };
  return decideOffline(currentSnapshot, { credHash: blindIndex(code), doorId, now, tz });
}

const OfflineAccess = { OFFLINE_REASON, verifySnapshot, blindIndex, decideOffline, setSnapshot, getSnapshot, clearSnapshot, snapshotStatus, authorizeOffline };
export default OfflineAccess;
