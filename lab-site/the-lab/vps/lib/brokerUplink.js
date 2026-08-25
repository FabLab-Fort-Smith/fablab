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
      // Rate-limit BEFORE the ownership check so a misbehaving authed broker can't flood unlimited
      // unowned-door probes (each still hits log + CPU otherwise) — bound ALL authz per broker (L2).
      if (!allow(brokerId)) return { t: "authz_result", id, granted: false, reason: "RATE_LIMITED" };
      if (!owns(brokerId, doorId)) return { t: "authz_result", id, granted: false, reason: "DOOR_NOT_OWNED" };
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
 * Connected-broker registry keyed by brokerId → the SET of live member connections (S5 HA). An
 * active/standby broker pair shares ONE logical brokerId (design §9), so BOTH members' uplinks must be
 * tracked and fed envelopes — a single-slot map would starve the standby and let its rung-2 cache go
 * stale (miss a revocation), breaking seamless failover. Members are bounded by the door-map config.
 */
export function makeBrokerRegistry() {
  const m = new Map(); // brokerId -> Set<ws>
  return {
    add(brokerId, ws) {
      let s = m.get(brokerId);
      if (!s) { s = new Set(); m.set(brokerId, s); }
      s.add(ws);
    },
    remove(brokerId, ws) {
      const s = m.get(brokerId);
      if (s) { s.delete(ws); if (!s.size) m.delete(brokerId); }
    },
    /** Live (OPEN) member connections for a brokerId. */
    conns(brokerId) {
      const s = m.get(brokerId);
      return s ? [...s].filter((w) => w.readyState === WS_OPEN) : [];
    },
    count(brokerId) { return this.conns(brokerId).length; },
  };
}

/**
 * Per-connection driver for a broker uplink socket (functional core; the socket-server shell just
 * feeds it raw messages + close). Holds this connection's authenticated brokerId. Deny-by-default:
 * a wrong bearer closes the socket; authz before auth is denied by handleAuthz.
 * @param {object} deps
 * @param {ReturnType<typeof makeBrokerUplink>} deps.uplink
 * @param {ReturnType<typeof makeBrokerRegistry>} deps.registry - shared multi-member registry (mutated here).
 * @param {(event:string,fields?:object)=>void} [deps.log]
 * @returns {(ws:object, meta?:object)=>{message:(raw:any)=>Promise<void>, close:()=>void, brokerId:()=>string|null}}
 */
export function makeUplinkConnection({ uplink, registry, log = () => {}, onConnect = () => {} }) {
  return function accept(ws, meta = {}) {
    let brokerId = null; // null until the bearer authenticates (authn-before-act)
    const emit = (event, fields = {}) => log(event, { ...meta, ...fields }); // meta = e.g. { ip } for forensics
    return {
      brokerId: () => brokerId,
      async message(raw) {
        let m;
        try { m = JSON.parse(raw); } catch { return; }
        if (m.t === "auth") {
          if (brokerId) { emit("broker.reauth-ignored", { brokerId }); return; } // one identity per conn (F5)
          const id = uplink.authenticate(typeof m.secret === "string" ? m.secret : "");
          if (!id) { // never reveal which part failed
            emit("broker.auth-failed", {});
            safeSend(ws, { t: "auth_result", ok: false });
            try { ws.close(); } catch { /* gone */ }
            return;
          }
          brokerId = id;
          registry.add(brokerId, ws); // track EVERY member (active + standby share one brokerId, S5)
          emit("broker.authenticated", { brokerId });
          safeSend(ws, { t: "auth_result", ok: true });
          try { onConnect(brokerId); } catch { /* best-effort resync trigger — never break the conn */ }
        } else if (m.t === "authz") {
          const resp = await uplink.handleAuthz({ brokerId, id: m.id, doorId: m.doorId, code: m.code, tz: m.tz });
          emit("broker.authz", { brokerId: brokerId || "?", doorId: m.doorId, granted: resp.granted, reason: resp.reason });
          if (ws.readyState === WS_OPEN) safeSend(ws, resp);
        } else if (m.t === "ping") {
          safeSend(ws, { t: "pong" });
        }
      },
      close() {
        if (brokerId) {
          registry.remove(brokerId, ws); // remove only THIS member; the other stays registered
          emit("broker.disconnected", { brokerId });
        }
      },
    };
  };
}

/**
 * Relay a batch of signed envelopes down ALL live members of a broker (S5 HA), scoped to owned doors
 * (BOLA). Each accepted envelope is pushed to every member connection so active + standby caches stay
 * in lockstep (a revocation reaches both). `relayed` counts envelopes delivered to ≥1 member.
 * @param {{uplink:ReturnType<typeof makeBrokerUplink>, registry:ReturnType<typeof makeBrokerRegistry>}} ctx
 * @param {string} brokerId
 * @param {Array} envelopes
 * @returns {{connected:boolean, relayed:number, rejected:number, members:number}}
 */
export function relayEnvelopes({ uplink, registry }, brokerId, envelopes) {
  const { accepted, rejected } = uplink.scopeEnvelopes(brokerId, envelopes);
  const conns = registry.conns(brokerId);
  if (!conns.length) return { connected: false, relayed: 0, rejected: rejected.length, members: 0 };
  let relayed = 0;
  for (const signed of accepted) {
    let delivered = false;
    for (const ws of conns) if (safeSend(ws, { t: "envelope", signed })) delivered = true;
    if (delivered) relayed += 1;
  }
  return { connected: true, relayed, rejected: rejected.length, members: conns.length };
}

const BrokerUplink = {
  timingSafeEqualStr, loadBrokerSecrets, loadBrokerDoorMap, makeBrokerAuth, makeRateLimiter, makeBrokerUplink,
  makeUplinkConnection, relayEnvelopes, makeBrokerRegistry,
};
export default BrokerUplink;
