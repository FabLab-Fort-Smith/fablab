// Broker container health (S2c-3 #6). SCOPING: this endpoint binds 127.0.0.1 ONLY — never the LAN.
// The broker's only LAN surface is the mTLS Link-A listener; liveness/readiness is a container-local
// concern (the Docker HEALTHCHECK curls it over loopback), so it must not be reachable off-box (an
// unauthenticated readiness/uplink-status probe on the LAN is needless exposure — deny-by-default).

import http from "http";

/**
 * Build the health payload from the broker's current status. Pure (testable). Carries no secrets:
 * only readiness, uplink up/down, and the door count — never keys, the bearer, or a scan code.
 * @param {{ready?:boolean, uplinkUp?:boolean, doors?:number}} [status]
 * @returns {{status:string, ready:boolean, uplink:string, doors:number}}
 */
export function healthPayload({ ready = false, uplinkUp = false, doors = 0 } = {}) {
  return {
    status: ready ? "ok" : "not-ready",
    ready: Boolean(ready),
    uplink: uplinkUp ? "up" : "down", // rung-1 reachability (offline fallback still serves when down)
    doors: Number.isFinite(doors) ? doors : 0,
  };
}

/**
 * Start a loopback-only health server. `getStatus()` is called per request and fed to healthPayload;
 * 200 when ready, 503 otherwise (so orchestrators gate traffic). Bound to 127.0.0.1 — do NOT change
 * the host to a routable address (#6 scoping).
 * @param {() => {ready?:boolean, uplinkUp?:boolean, doors?:number}} getStatus
 * @param {{host?:string, port?:number}} [opts]
 * @returns {import("http").Server}
 */
export function startHealthServer(getStatus, { host = "127.0.0.1", port = 9090 } = {}) {
  const server = http.createServer((req, res) => {
    let s;
    try { s = healthPayload(getStatus()); } catch { s = healthPayload({ ready: false }); }
    res.writeHead(s.ready ? 200 : 503, { "content-type": "application/json" });
    res.end(JSON.stringify(s));
  });
  server.listen(port, host); // loopback ONLY — never bind the LAN interface
  server.unref?.();
  return server;
}

const BrokerHealth = { healthPayload, startHealthServer };
export default BrokerHealth;
