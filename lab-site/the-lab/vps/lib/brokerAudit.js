// vps/lib/brokerAudit.js — the socket-server side of the edge audit relay (S6-b-c1). When a broker
// relays an edge-signed audit batch up Link-B (`{t:"audit", edgeId, records, signature}`), the
// socket-server forwards it to the APP, which verifies the edge signature + runs the fail-closed anchor
// (S6-b-a/S6-a). Mirrors brokerResync.js: POST APP_INTERNAL_URL/api/internal/broker-audit with the
// INTERNAL_API_SECRET bearer. The socket-server is a RELAY — it never inspects `records` (may carry
// Restricted content) and never verifies the signature (the app holds the edge pubkeys).
//
// The reply verdict drives the EDGE's durable ack cursor (via the broker), so the HTTP result maps to a
// deliberate tri-state, fail-secure toward "the edge keeps the records":
//   200 (ingested, incl. dedup/alerts) → "accepted"  (edge advances its cursor)
//   400 (bad-edgeId/oversize/malformed/unregistered-edge/bad-signature) → "rejected" (retry won't help)
//   409 conflict / 5xx / network / timeout / not-configured → "deferred" (edge keeps + retries)

/**
 * Build requestBrokerAudit({edgeId, records, signature}) → Promise<"accepted"|"rejected"|"deferred">.
 * Deps injectable for tests. NEVER throws (any failure → "deferred") and NEVER logs the secret,
 * `records`, or the signature.
 * @param {{env?:object, fetchImpl?:Function, timeoutMs?:number, log?:Function}} [deps]
 */
export function makeRequestBrokerAudit({ env = process.env, fetchImpl, timeoutMs = 5000, log = () => {} } = {}) {
  const doFetch = fetchImpl || ((...a) => fetch(...a));
  return async function requestBrokerAudit({ edgeId, records, signature } = {}) {
    const appUrl = env.APP_INTERNAL_URL;
    const secret = env.INTERNAL_API_SECRET;
    // Not configured, or nothing to relay → "deferred": the edge keeps the batch (never a false accept).
    if (!appUrl || !secret || !edgeId || !Array.isArray(records) || records.length === 0 || typeof signature !== "string") {
      return "deferred";
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const r = await doFetch(`${appUrl}/api/internal/broker-audit`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${secret}` },
        body: JSON.stringify({ edgeId, records, signature }),
        signal: controller.signal,
      });
      if (!r) return "deferred";
      if (r.ok) { log("audit.ingested", { edgeId }); return "accepted"; }
      if (r.status === 400) { log("audit.rejected", { edgeId, status: 400 }); return "rejected"; } // won't retry-fix
      log("audit.deferred", { edgeId, status: r.status }); // 409 conflict / 5xx → retry later
      return "deferred";
    } catch (e) {
      log("audit.error", { edgeId, reason: (e && e.message) || String(e) }); // never the secret/records
      return "deferred";
    } finally {
      clearTimeout(timer);
    }
  };
}

const BrokerAudit = { makeRequestBrokerAudit };
export default BrokerAudit;
