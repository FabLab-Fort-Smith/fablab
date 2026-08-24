// Link-A message dispatch for the broker (S2c) — pure + stateless, so it is unit-testable without a
// socket. The imperative shell (broker-server.js) owns the mTLS transport, per-connection replay
// dedup, and resolving `doorId` from the edge's authenticated cert identity (NEVER from the message
// — server-derived, §5). This module just maps a parsed edge message → a response, fail-secure.
//
// See docs/architecture/door-controller-wifi.md §4 (Link A) and §2 (the rung 1→2 ladder).

import { handleScan } from "./brokerService.js";

/**
 * Dispatch one parsed edge message. Never throws; unknown/malformed → a safe response (or null to
 * ignore). `ctx.doorId` is the connection's authenticated door (resolved by the shell from the mTLS
 * client cert), so a client cannot pick its own door.
 * @param {object} msg  parsed JSON from the edge (untrusted)
 * @param {{ store:object, cloudAuthorize?:Function, doorId:string }} ctx
 * @returns {Promise<object|null>} a response object to send back, or null to send nothing
 */
export async function handleEdgeMessage(msg, ctx = {}) {
  try {
    if (!msg || typeof msg !== "object") return null;
    switch (msg.t) {
      case "ping":
        return { t: "pong" };
      case "hello":
        // The edge announces itself; real auth is the mTLS client cert (transport). Ack only.
        return { t: "hello_ack" };
      case "scan": {
        // `cred` (the card code) is Restricted/PII — used for the decision, never echoed or logged.
        const code = typeof msg.cred === "string" ? msg.cred : msg.code;
        const r = await handleScan(
          { store: ctx.store, cloudAuthorize: ctx.cloudAuthorize },
          { doorId: ctx.doorId, code }
        );
        // Echo requestId so the reader can match the result to its scan (never echo cred/nonce back).
        return { t: "result", requestId: msg.requestId ?? null, granted: r.granted, reason: r.reason, mode: r.mode };
      }
      default:
        return null; // forward-compatible: ignore unknown message types
    }
  } catch {
    // Any unexpected error → a fail-secure deny for a scan, else nothing.
    return msg && msg.t === "scan" ? { t: "result", requestId: (msg && msg.requestId) ?? null, granted: false, reason: "error", mode: "offline" } : null;
  }
}

const BrokerProtocol = { handleEdgeMessage };
export default BrokerProtocol;
