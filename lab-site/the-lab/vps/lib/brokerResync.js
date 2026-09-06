// vps/lib/brokerResync.js — the socket-server side of reconnect resync (S2c-2c). When a broker's
// Link-B uplink authenticates, the socket-server asks the APP to rebuild + push that broker's current
// envelopes (the app holds the master key + card store; the socket-server only relays). Mirrors the
// existing app-core call in scanAuthorize.js: POST APP_INTERNAL_URL/api/internal/broker-resync with the
// INTERNAL_API_SECRET bearer. Best-effort + fail-open-for-availability (a failed resync just means the
// broker refreshes on the next change/TTL — never blocks the uplink), bounded by a timeout + per-broker
// cooldown so a flapping broker can't hammer the app.

/**
 * Build requestBrokerResync(brokerId) → Promise<boolean> (ok?). Deps injectable for tests. Resolves
 * false (never throws) when the app URL/secret aren't configured or the call fails — the caller treats
 * resync as best-effort. NEVER logs the secret.
 * @param {{env?:object, fetchImpl?:Function, timeoutMs?:number, log?:Function}} [deps]
 */
export function makeRequestBrokerResync({ env = process.env, fetchImpl, timeoutMs = 5000, log = () => {} } = {}) {
  const doFetch = fetchImpl || ((...a) => fetch(...a));
  return async function requestBrokerResync(brokerId) {
    const appUrl = env.APP_INTERNAL_URL;
    const secret = env.INTERNAL_API_SECRET;
    if (!appUrl || !secret || !brokerId) return false; // not configured / nothing to do — best-effort
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const r = await doFetch(`${appUrl}/api/internal/broker-resync`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
        body: JSON.stringify({ brokerId }),
        signal: controller.signal,
      });
      if (!r || !r.ok) { log('resync.failed', { brokerId, status: r && r.status }); return false; }
      log('resync.requested', { brokerId });
      return true;
    } catch (e) {
      log('resync.error', { brokerId, reason: (e && e.message) || String(e) }); // never the secret
      return false;
    } finally {
      clearTimeout(timer);
    }
  };
}

/**
 * Wrap a resync fn with a per-broker cooldown so a flapping/reconnecting broker can't trigger a rebuild
 * storm on the app (CWE-400). Fires immediately on the first call for a broker, then suppresses further
 * calls for that broker within `cooldownMs`. Injectable clock. Fire-and-forget (returns void).
 * @param {{resync:(brokerId:string)=>Promise<any>, cooldownMs?:number, now?:()=>number, log?:Function}} deps
 */
export function makeResyncTrigger({ resync, cooldownMs = 10000, now = () => Date.now(), log = () => {} }) {
  if (typeof resync !== 'function') throw new Error('makeResyncTrigger requires a resync fn');
  const last = new Map(); // brokerId -> last-fired ms
  return function trigger(brokerId) {
    if (!brokerId) return;
    const t = now();
    const prev = last.get(brokerId);
    if (prev != null && t - prev < cooldownMs) { log('resync.cooldown', { brokerId }); return; }
    last.set(brokerId, t);
    Promise.resolve(resync(brokerId)).catch(() => { /* best-effort; already logged inside resync */ });
  };
}

const BrokerResync = { makeRequestBrokerResync, makeResyncTrigger };
export default BrokerResync;
