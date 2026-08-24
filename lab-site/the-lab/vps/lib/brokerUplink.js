// Cloud side of Link-B (S2c-2): the pure, testable core the socket-server wires to accept a broker's
// dial-out WSS uplink. The broker authenticates with a bearer (constant-time), then proxies online
// scans (`authz`) and receives per-door envelope pushes. Design §13 S2c decision (c): Link-B is
// verified-TLS-server-auth + a broker bearer (NOT mTLS) — the broker pins the cloud cert on its side.
//
// Security posture (master §2, std-owasp-api):
//   - Deny-by-default: an unknown/mismatched bearer authenticates to NO broker.
//   - Authn-before-act: authz is refused until the connection is bearer-authenticated (the caller
//     enforces the connection state; scope + rate-limit are enforced here).
//   - Owned-door scope (BOLA/API1): a broker may only authorize / receive envelopes for doors bound
//     to its brokerId in the door map — never a firehose, never another broker's door.
//   - Cost-DoS bound (API4/CWE-400): per-broker authz rate limit.
//   - The scan `code` is Restricted/PII (§5) and is NEVER logged here or returned to the wire.

import crypto from "crypto";

/** Constant-time string equality; false on type/length mismatch. */
export function timingSafeEqualStr(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * Parse BROKER_UPLINK_SECRETS (JSON `{brokerId: secret}`) — mirrors loadDeviceSecrets. Malformed or
 * non-object → {} (fail-closed: no brokers authenticate).
 * @param {string|undefined} [raw=process.env.BROKER_UPLINK_SECRETS]
 * @returns {Record<string,string>}
 */
export function loadBrokerSecrets(raw = process.env.BROKER_UPLINK_SECRETS) {
  if (!raw) return {};
  try {
    const p = JSON.parse(raw);
    if (!p || typeof p !== "object" || Array.isArray(p)) return {};
    const out = {};
    for (const [k, v] of Object.entries(p)) if (typeof v === "string" && v) out[k] = v;
    return out;
  } catch {
    return {};
  }
}

/**
 * Parse BROKER_DOOR_MAP (JSON `{brokerId: [doorId,...]}`) into a Map<brokerId, Set<doorId>>. Malformed
 * → empty map (fail-closed: a broker with no mapped doors owns nothing).
 * @param {string|undefined} [raw=process.env.BROKER_DOOR_MAP]
 * @returns {Map<string, Set<string>>}
 */
export function loadBrokerDoorMap(raw = process.env.BROKER_DOOR_MAP) {
  const map = new Map();
  if (!raw) return map;
  let p;
  try { p = JSON.parse(raw); } catch { return map; }
  if (!p || typeof p !== "object" || Array.isArray(p)) return map;
  for (const [brokerId, doors] of Object.entries(p)) {
    if (!Array.isArray(doors)) continue;
    map.set(brokerId, new Set(doors.filter((d) => typeof d === "string" && d)));
  }
  return map;
}

/**
 * Authenticate a presented bearer against the configured broker secrets, constant-time. Compares
 * against EVERY configured broker (no early return) so a match doesn't leak which brokerId via timing.
 * @param {Record<string,string>} secrets
 * @returns {(secret:string)=>string|null} brokerId of the sole match, else null (deny-by-default)
 */
export function makeBrokerAuth(secrets) {
  const entries = Object.entries(secrets || {});
  return function authenticate(secret) {
    let matched = null;
    for (const [brokerId, expected] of entries) {
      if (timingSafeEqualStr(secret, expected)) matched = brokerId;
    }
    return matched;
  };
}

/**
 * Fixed-window per-broker rate limiter for authz (bound cost-DoS). Injectable clock for tests.
 * @param {{limit?:number, windowMs?:number, now?:()=>number}} [opts]
 * @returns {(brokerId:string)=>boolean} allow?
 */
export function makeRateLimiter({ limit = 30, windowMs = 10000, now = () => Date.now() } = {}) {
  const buckets = new Map(); // brokerId -> { start, count }
  return function allow(brokerId) {
    const t = now();
    const b = buckets.get(brokerId);
    if (!b || t - b.start >= windowMs) {
      buckets.set(brokerId, { start: t, count: 1 });
      return true;
    }
    if (b.count >= limit) return false;
    b.count += 1;
    return true;
  };
}

/**
 * Build the cloud uplink decision core.
 * @param {object} deps
 * @param {(args:{cardId:string,doorId:string,tz?:string})=>Promise<object>} deps.authorizeScan - shared decision path.
 * @param {(secret:string)=>string|null} deps.authenticate - from makeBrokerAuth.
 * @param {Map<string,Set<string>>} deps.doorMap - brokerId -> owned doorIds.
 * @param {(brokerId:string)=>boolean} [deps.allow] - rate limiter (from makeRateLimiter).
 */
export function makeBrokerUplink({ authorizeScan, authenticate, doorMap, allow = () => true }) {
  if (typeof authorizeScan !== "function") throw new Error("makeBrokerUplink requires authorizeScan");
  if (typeof authenticate !== "function") throw new Error("makeBrokerUplink requires authenticate");
  const owns = (brokerId, doorId) => Boolean(brokerId && doorMap?.get(brokerId)?.has(doorId));

  return {
    owns,
    /** Verify a bearer → brokerId | null (deny-by-default). */
    authenticate,
    /**
     * Decide an `authz` scan proxied up from a broker. Fail-secure: any missing state, scope
     * violation, or rate-limit → denied. NEVER logs/echoes the code.
     * @param {{brokerId:string|null, id:any, doorId:string, code:string, tz?:string}} msg
     * @returns {Promise<{t:'authz_result', id:any, granted:boolean, reason?:string}>}
     */
    async handleAuthz({ brokerId, id, doorId, code, tz } = {}) {
      if (!brokerId) return { t: "authz_result", id, granted: false, reason: "UNAUTHENTICATED" };
      if (!doorId || typeof code !== "string" || !code) {
        return { t: "authz_result", id, granted: false, reason: "MISSING_FIELDS" };
      }
      if (!owns(brokerId, doorId)) return { t: "authz_result", id, granted: false, reason: "DOOR_NOT_OWNED" };
      if (!allow(brokerId)) return { t: "authz_result", id, granted: false, reason: "RATE_LIMITED" };
      const decision = await authorizeScan({ cardId: code, doorId, tz });
      return { t: "authz_result", id, granted: Boolean(decision.granted), reason: decision.reason, mode: decision.mode };
    },
    /**
     * Filter a batch of signed envelopes to only those whose payload.doorId this broker owns
     * (defense-in-depth BOLA before relaying down). Returns the accepted list + rejected doorIds.
     * @param {string|null} brokerId
     * @param {Array<{payload?:{doorId?:string}}>} envelopes
     */
    scopeEnvelopes(brokerId, envelopes) {
      const accepted = [];
      const rejected = [];
      for (const e of Array.isArray(envelopes) ? envelopes : []) {
        const doorId = e && e.payload && e.payload.doorId;
        if (typeof doorId === "string" && owns(brokerId, doorId)) accepted.push(e);
        else rejected.push(doorId ?? null);
      }
      return { accepted, rejected };
    },
  };
}

const WS_OPEN = 1; // ws.readyState OPEN — kept as a literal so this pure module doesn't import `ws`.

function safeSend(ws, obj) {
  try { ws.send(JSON.stringify(obj)); return true; } catch { return false; }
}

/**
 * Per-connection driver for a broker uplink socket (functional core; the socket-server shell just
 * feeds it raw messages + close). Holds this connection's authenticated brokerId. Deny-by-default:
 * a wrong bearer closes the socket; authz before auth is denied by handleAuthz.
 * @param {object} deps
 * @param {ReturnType<typeof makeBrokerUplink>} deps.uplink
 * @param {Map<string,object>} deps.brokers - shared brokerId -> ws registry (mutated here).
 * @param {(event:string,fields?:object)=>void} [deps.log]
 * @returns {(ws:object)=>{message:(raw:any)=>Promise<void>, close:()=>void, brokerId:()=>string|null}}
 */
export function makeUplinkConnection({ uplink, brokers, log = () => {} }) {
  return function accept(ws) {
    let brokerId = null; // null until the bearer authenticates (authn-before-act)
    return {
      brokerId: () => brokerId,
      async message(raw) {
        let m;
        try { m = JSON.parse(raw); } catch { return; }
        if (m.t === "auth") {
          const id = uplink.authenticate(typeof m.secret === "string" ? m.secret : "");
          if (!id) { // never reveal which part failed
            log("broker.auth-failed", {});
            safeSend(ws, { t: "auth_result", ok: false });
            try { ws.close(); } catch { /* gone */ }
            return;
          }
          brokerId = id;
          brokers.set(brokerId, ws); // newer conn replaces old (HA failover / reconnect)
          log("broker.authenticated", { brokerId });
          safeSend(ws, { t: "auth_result", ok: true });
        } else if (m.t === "authz") {
          const resp = await uplink.handleAuthz({ brokerId, id: m.id, doorId: m.doorId, code: m.code, tz: m.tz });
          log("broker.authz", { brokerId: brokerId || "?", doorId: m.doorId, granted: resp.granted, reason: resp.reason });
          if (ws.readyState === WS_OPEN) safeSend(ws, resp);
        } else if (m.t === "ping") {
          safeSend(ws, { t: "pong" });
        }
      },
      close() {
        if (brokerId && brokers.get(brokerId) === ws) {
          brokers.delete(brokerId);
          log("broker.disconnected", { brokerId });
        }
      },
    };
  };
}

/**
 * Relay a batch of signed envelopes down a connected broker's uplink, scoped to owned doors (BOLA).
 * @param {{uplink:ReturnType<typeof makeBrokerUplink>, brokers:Map<string,object>}} ctx
 * @param {string} brokerId
 * @param {Array} envelopes
 * @returns {{connected:boolean, relayed:number, rejected:number}}
 */
export function relayEnvelopes({ uplink, brokers }, brokerId, envelopes) {
  const { accepted, rejected } = uplink.scopeEnvelopes(brokerId, envelopes);
  const ws = brokers.get(brokerId);
  if (!ws || ws.readyState !== WS_OPEN) return { connected: false, relayed: 0, rejected: rejected.length };
  let relayed = 0;
  for (const signed of accepted) if (safeSend(ws, { t: "envelope", signed })) relayed += 1;
  return { connected: true, relayed, rejected: rejected.length };
}

const BrokerUplink = {
  timingSafeEqualStr, loadBrokerSecrets, loadBrokerDoorMap, makeBrokerAuth, makeRateLimiter, makeBrokerUplink,
  makeUplinkConnection, relayEnvelopes,
};
export default BrokerUplink;
