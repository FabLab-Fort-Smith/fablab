// On-site broker service logic (S2b-1) — the request-handling core, transport-agnostic (see
// docs/architecture/door-controller-wifi.md §2 ladder rungs 1–2, §4). The TLS/WSS wiring (the
// mTLS Link-A listener for edges + the cloud Link-B uplink) is S2b-2; the container/deploy is S2c.
// This module is the injectable decision + ingest logic so it is unit-testable without a socket.
//
// The broker is the LOCAL AUTHORITY: online it proxies a scan to the cloud (authoritative + audited
// there); if the cloud is unreachable it falls back to its cached, signed per-door envelope
// (brokerAccess rung 2). Deny-by-default, fail-secure at every rung.

import brokerAccess from "./brokerAccess.js";

/**
 * Decide a scan via the ladder: rung 1 (cloud, authoritative) → rung 2 (cached envelope) → deny.
 * `cloudAuthorize` is injected by the transport (S2b-2): it forwards the scan to the cloud over the
 * broker's uplink and resolves to `{granted, reason}` — or throws / resolves null when the cloud is
 * unreachable, which triggers the offline fallback. It is never trusted to fail *open*: a malformed
 * cloud result also falls through to the offline decision.
 * @param {{ store:object, cloudAuthorize?:(scan:object)=>Promise<{granted:boolean,reason:string}|null> }} deps
 * @param {{ doorId:string, code:string, now?:Date, tz?:string }} scan
 * @returns {Promise<{granted:boolean, reason:string, mode:"online"|"offline"}>}
 */
export async function handleScan({ store, cloudAuthorize }, { doorId, code, now = new Date(), tz } = {}) {
  if (typeof doorId !== "string" || !doorId || typeof code !== "string" || !code) {
    return { granted: false, reason: "bad-request", mode: "offline" };
  }
  // Rung 1 — cloud is the authoritative, audited decision when reachable.
  if (typeof cloudAuthorize === "function") {
    try {
      const r = await cloudAuthorize({ doorId, code });
      if (r && typeof r.granted === "boolean" && typeof r.reason === "string") {
        return { granted: r.granted, reason: r.reason, mode: "online" };
      }
      // malformed/absent result → treat the cloud as unreachable, fall through (never fail open)
    } catch {
      // cloud unreachable / errored → fall through to the offline fallback
    }
  }
  // Rung 2 — decide from the cached signed envelope (fail-secure: no envelope → deny).
  const r = await brokerAccess.authorizeOffline(store, { doorId, code, now, tz });
  return { granted: r.granted, reason: r.reason, mode: "offline" };
}

/**
 * Ingest a per-door envelope pushed by the cloud (down the broker's uplink). Verifies + stores
 * atomically (brokerAccess.setEnvelope → store.putEnvelope: verify + anti-rollback inside the
 * per-door lock). The transport MUST authenticate the cloud before calling this (N-1): a forged
 * push is still rejected here (bad-signature) but authentication bounds resource use up front.
 * @param {object} store @param {{payload:object, sig:string}} signed
 * @returns {Promise<{stored:boolean, reason?:string, version?:number}>}
 */
export async function ingestEnvelope(store, signed) {
  return brokerAccess.setEnvelope(store, signed);
}

const BrokerService = { handleScan, ingestEnvelope };
export default BrokerService;
