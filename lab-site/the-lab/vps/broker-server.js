// On-site broker server (S2c-1) — the imperative shell that wires the transports to the tested
// decision core (brokerService/brokerProtocol) and store (brokerStore), with the config + TLS
// hardening from brokerConfig/brokerTls. See docs/architecture/door-controller-wifi.md §2/§3/§4.
//
// Link A (edges → broker): an mTLS TLS server. A connection without a CA-signed client cert is
//   dropped at the handshake; the authenticated cert CN (edgeId) is mapped to a doorId via the
//   provisioned registry (server-derived, never from the message). Newline-delimited JSON.
// Link B (broker → cloud): a WSS client the broker DIALS OUT, with the cloud cert validated + pinned
//   (rejectUnauthorized). After the handshake it sends the broker bearer, receives per-door envelope
//   pushes (→ ingestEnvelope), and serves as the `cloudAuthorize` channel for online scans.
//
// Fail-secure throughout; observability on fallback / io-error / bad-signature (#151). This shell is
// integration/deploy-tested; the unit-tested security bits live in brokerTls/brokerProtocol/brokerService.

import fs from "fs";
import tls from "tls";
import crypto from "crypto";
import { pathToFileURL } from "url";
import { WebSocket } from "ws";
import { loadBrokerConfig } from "./lib/brokerConfig.js";
import { makeBrokerStore } from "./lib/brokerStore.js";
import { edgeListenerTlsOptions, uplinkTlsOptions } from "./lib/brokerTls.js";
import { handleEdgeMessage } from "./lib/brokerProtocol.js";
import { makeLineDecoder, makeReplayGuard } from "./lib/brokerFraming.js";
import { ingestEnvelope } from "./lib/brokerService.js";
import { startHealthServer } from "./lib/brokerHealth.js";
import { makeEdgeDenylist } from "./lib/brokerDenylist.js";

const EDGE_IDLE_MS = 60000;         // drop an idle/held edge connection (fail-secure)
const UPLINK_MAX_PAYLOAD = 512 * 1024; // an envelope push is small; cap it (CWE-400)

const log = (event, fields = {}) => console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...fields }));

/** Load the doorId registry (edgeId → doorId), server-side source of truth. Missing → empty (deny). */
function loadRegistry() {
  const p = process.env.BROKER_REGISTRY;
  if (!p) return {};
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (e) {
    log("registry.load-error", { reason: e.code || e.message });
    return {};
  }
}

// --- Link B: the cloud uplink (dial out) --------------------------------------------------------
function startUplink(cfg, store) {
  const pending = new Map(); // authz correlation id → {resolve, timer}
  const auditPending = new Map(); // audit correlation id → {resolve, timer}
  let ws = null;
  let backoff = 1;

  function drainPending(reason) {
    for (const [, p] of pending) { clearTimeout(p.timer); p.resolve(null); } // null → offline fallback, at once
    pending.clear();
    // Audit relays in flight when the uplink drops resolve "deferred": the edge keeps the records (its
    // durable store-and-forward) and retries on the next flush. Never lose or falsely-ack an audit.
    for (const [, p] of auditPending) { clearTimeout(p.timer); p.resolve("deferred"); }
    auditPending.clear();
    if (reason) log("uplink.pending-drained", { reason });
  }

  function connect() {
    ws = new WebSocket(cfg.uplink.url, { ...uplinkTlsOptions(cfg), maxPayload: UPLINK_MAX_PAYLOAD });
    ws.on("open", () => {
      backoff = 1;
      ws.send(JSON.stringify({ t: "auth", secret: cfg.uplink.secret })); // bearer, post-TLS
      log("uplink.up", { url: redactUrl(cfg.uplink.url) });
    });
    ws.on("message", async (data) => {
      let m;
      try { m = JSON.parse(data); } catch { return; }
      if (m.t === "envelope" && m.signed) {
        const r = await ingestEnvelope(store, m.signed);
        if (!r.stored) log("ingest.rejected", { reason: r.reason, doorId: m.signed?.payload?.doorId });
        else log("ingest.stored", { doorId: m.signed.payload.doorId, version: r.version });
      } else if (m.t === "authz_result" && m.id && pending.has(m.id)) {
        const p = pending.get(m.id); pending.delete(m.id); clearTimeout(p.timer);
        p.resolve(m && typeof m.granted === "boolean" ? { granted: m.granted, reason: m.reason } : null);
      } else if (m.t === "audit_result" && m.id && auditPending.has(m.id)) {
        const p = auditPending.get(m.id); auditPending.delete(m.id); clearTimeout(p.timer);
        // Only the cloud's explicit verdict advances the edge; anything else → deferred (edge retries).
        p.resolve(m.status === "accepted" || m.status === "rejected" ? m.status : "deferred");
      }
    });
    ws.on("close", () => { drainPending("uplink-closed"); log("uplink.down", {}); scheduleReconnect(); }); // F3: fall to offline at once
    ws.on("error", (e) => { log("uplink.error", { reason: e.code || e.message }); try { ws.close(); } catch { /* noop */ } });
  }
  function scheduleReconnect() {
    setTimeout(connect, backoff * 1000).unref?.();
    backoff = Math.min(backoff * 2, 30);
  }

  /** cloudAuthorize: proxy a scan to the cloud over the uplink; reject (→ offline) if down/timeout. */
  function cloudAuthorize({ doorId, code }) {
    return new Promise((resolve, reject) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return reject(new Error("uplink-down"));
      const id = crypto.randomUUID();
      const timer = setTimeout(() => { pending.delete(id); reject(new Error("uplink-timeout")); }, 3000);
      timer.unref?.();
      pending.set(id, { resolve, timer });
      ws.send(JSON.stringify({ t: "authz", id, doorId, code }));
    });
  }

  /**
   * relayAudit: forward one edge-signed audit batch up to the cloud and resolve the cloud's verdict.
   * Resolves "deferred" (never rejects) if the uplink is down or the cloud doesn't answer in time — the
   * edge then keeps the records and retries. The broker holds NO audit state of its own (the edge is the
   * durable buffer); `records` is relayed opaquely (may contain Restricted content — never logged here).
   */
  function relayAudit({ edgeId, records, signature }) {
    return new Promise((resolve) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return resolve("deferred");
      const id = crypto.randomUUID();
      const timer = setTimeout(() => { auditPending.delete(id); resolve("deferred"); }, 5000);
      timer.unref?.();
      auditPending.set(id, { resolve, timer });
      try { ws.send(JSON.stringify({ t: "audit", id, edgeId, records, signature })); }
      catch { auditPending.delete(id); clearTimeout(timer); resolve("deferred"); }
    });
  }

  connect();
  return {
    cloudAuthorize,
    relayAudit,
    up: () => Boolean(ws && ws.readyState === WebSocket.OPEN), // rung-1 uplink reachable? (health #6)
    close: () => { try { ws?.close(); } catch { /* noop */ } },
  };
}
function redactUrl(u) { try { const x = new URL(u); return `${x.protocol}//${x.host}${x.pathname}`; } catch { return "?"; } }

// --- Link A: the edge mTLS listener -------------------------------------------------------------
function startEdgeListener(cfg, store, registry, cloudAuthorize, denylist = { isDenied: () => false }, relayAudit = null) {
  const server = tls.createServer(edgeListenerTlsOptions(cfg), (socket) => {
    // rejectUnauthorized already dropped anyone without a CA-signed cert; derive doorId from the cert.
    const cert = socket.getPeerCertificate?.();
    const edgeId = cert && cert.subject ? cert.subject.CN : null;
    // F7 revocation: a CA-signed cert whose CN is deny-listed is refused here (no CRL yet). Drop the
    // connection before any door processing — the edge is revoked regardless of its valid cert.
    if (edgeId && denylist.isDenied(edgeId)) { log("edge.denied", { edgeId }); socket.destroy(); return; }
    const doorId = edgeId ? registry[edgeId] : undefined; // server-derived; unknown edge → no door → deny
    const decoder = makeLineDecoder({});   // F1: bounded buffer (no newline-less flood)
    const guard = makeReplayGuard({});     // F2: dedup only when requestId+nonce present; bounded
    socket.setEncoding("utf8");
    socket.setTimeout(EDGE_IDLE_MS, () => socket.destroy()); // F1: no indefinitely-held connections
    socket.on("data", async (chunk) => {
      const { overflow, lines } = decoder.push(chunk);
      if (overflow) { log("edge.line-overflow", { doorId }); socket.destroy(); return; } // F1: drop a flooding edge
      for (const line of lines) {
        if (!line) continue;
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }
        if (msg.t === "scan" && guard.check(msg.requestId, msg.nonce) === "duplicate") {
          log("scan.replay-dropped", { doorId }); // F2: log, never silently swallow
          continue;
        }
        const resp = await handleEdgeMessage(msg, { store, cloudAuthorize, doorId, edgeId, relayAudit });
        if (resp) {
          // F4: audit the security-relevant event — an OFFLINE GRANT (decided locally, not centrally
          // audited until reconnect, #151) — rather than every offline result incl. denies.
          if (resp.t === "result" && resp.mode === "offline" && resp.granted) log("scan.offline-grant", { doorId });
          // Observe an audit relay's outcome (edgeId only; records/signature are never logged).
          if (resp.t === "audit_ack") log("audit.relayed", { edgeId, status: resp.status });
          try { socket.write(JSON.stringify(resp) + "\n"); } catch { /* client gone */ }
        }
      }
    });
    socket.on("timeout", () => socket.destroy());
    socket.on("error", () => { /* transient edge disconnect; fail-secure (nothing pulses) */ });
  });
  server.on("tlsClientError", (e) => log("edge.tls-error", { reason: e.code || e.message })); // rejected certs
  server.listen(cfg.tls.listenPort, cfg.tls.listenHost, () => log("edge.listening", { host: cfg.tls.listenHost, port: cfg.tls.listenPort }));
  return server;
}

export function run() {
  const cfg = loadBrokerConfig(); // fail-closed: a misprovisioned broker never starts
  const store = makeBrokerStore({ dir: cfg.envelopeDir });
  const registry = loadRegistry();
  const uplink = startUplink(cfg, store);
  const denylist = makeEdgeDenylist({ path: cfg.edgeDenylistPath, log }); // F7 edge revocation (optional)
  startEdgeListener(cfg, store, registry, uplink.cloudAuthorize, denylist, uplink.relayAudit);
  // Loopback-only health for the container HEALTHCHECK (#6) — NEVER bound to the LAN.
  startHealthServer(
    () => ({ ready: true, uplinkUp: uplink.up(), doors: Object.keys(registry).length }),
    { port: Number(process.env.BROKER_HEALTH_PORT) || 9090 },
  );
  log("broker.started", { envelopeDir: cfg.envelopeDir, doors: Object.keys(registry).length });
}

// Entrypoint guard: run() only when executed directly (not when imported by a test). pathToFileURL
// handles paths with spaces/non-ASCII correctly (F5).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) run();
