// Canonical offline access decision (Flow C) — the logic the VPS socket-server runs when the
// app core is unreachable. Kept here (pure, tested) as the reference the socket-server ports:
// verify the signed snapshot, enforce TTL, then match credHash → door → window. DENY BY DEFAULT.
//
// It never derives membership — it only replays a signed, expiring grant the addon precomputed.

import { verifyAllowlist } from "./allowlistCrypto";
import { inWindow } from "./policy";

export const OFFLINE_REASON = {
  BAD_SIGNATURE: "bad-signature",
  EXPIRED: "expired",
  UNKNOWN_CREDENTIAL: "unknown-credential",
  NO_DOOR: "no-door",
  NO_WINDOW: "no-window",
  GRANTED: "granted",
};

/**
 * @param {{payload:{expiresAt:string, entries:Array<{credHash:string, entries:Array<{doorId:string, windows:Array}>}>}, sig:string}} signed
 * @param {{credHash:string, doorId:string, now?:Date, tz?:string, publicKey?:object}} q
 *        `publicKey` defaults to DOOR_ALLOWLIST_VERIFY_KEY; `tz` is the door's timezone.
 * @returns {{granted:boolean, reason:string}}
 */
export function decideOffline(signed, { credHash, doorId, now = new Date(), tz, publicKey }) {
  if (!verifyAllowlist(signed, publicKey)) return { granted: false, reason: OFFLINE_REASON.BAD_SIGNATURE };

  const p = signed.payload || {};
  if (!p.expiresAt || new Date(p.expiresAt).getTime() <= now.getTime()) {
    return { granted: false, reason: OFFLINE_REASON.EXPIRED };
  }
  const zone = tz || p.tz || "UTC"; // caller's tz, else the snapshot's, else UTC
  const entry = (p.entries || []).find((e) => e.credHash === credHash);
  if (!entry) return { granted: false, reason: OFFLINE_REASON.UNKNOWN_CREDENTIAL };

  const door = (entry.entries || []).find((d) => d.doorId === doorId);
  if (!door) return { granted: false, reason: OFFLINE_REASON.NO_DOOR };

  if (!door.windows || door.windows.length === 0) return { granted: true, reason: OFFLINE_REASON.GRANTED };
  const open = door.windows.some((w) => inWindow(now, zone, w));
  return open ? { granted: true, reason: OFFLINE_REASON.GRANTED } : { granted: false, reason: OFFLINE_REASON.NO_WINDOW };
}

const OfflineDecision = { decideOffline, OFFLINE_REASON };
export default OfflineDecision;
