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
import readline from "readline";
import crypto from "crypto";
import { WebSocket } from "ws";
import { loadBrokerConfig } from "./lib/brokerConfig.js";
import { makeBrokerStore } from "./lib/brokerStore.js";
import { edgeListenerTlsOptions, uplinkTlsOptions } from "./lib/brokerTls.js";
import { handleEdgeMessage } from "./lib/brokerProtocol.js";
import { ingestEnvelope } from "./lib/brokerService.js";

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
  let ws = null;
  let backoff = 1;

  function connect() {
    ws = new WebSocket(cfg.uplink.url, { ...uplinkTlsOptions(cfg) });
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
      }
    });
    ws.on("close", () => { log("uplink.down", {}); scheduleReconnect(); });
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

  connect();
  return { cloudAuthorize, close: () => { try { ws?.close(); } catch { /* noop */ } } };
}
function redactUrl(u) { try { const x = new URL(u); return `${x.protocol}//${x.host}${x.pathname}`; } catch { return "?"; } }

// --- Link A: the edge mTLS listener -------------------------------------------------------------
function startEdgeListener(cfg, store, registry, cloudAuthorize) {
  const server = tls.createServer(edgeListenerTlsOptions(cfg), (socket) => {
    // rejectUnauthorized already dropped anyone without a CA-signed cert; derive doorId from the cert.
    const cert = socket.getPeerCertificate?.();
    const edgeId = cert && cert.subject ? cert.subject.CN : null;
    const doorId = edgeId ? registry[edgeId] : undefined; // server-derived; unknown edge → no door → deny
    const seen = new Set(); // per-connection replay guard (requestId+nonce)
    const rl = readline.createInterface({ input: socket });
    rl.on("line", async (line) => {
      let msg;
      try { msg = JSON.parse(line); } catch { return; }
      if (msg.t === "scan") {
        const key = `${msg.requestId}:${msg.nonce}`;
        if (seen.has(key)) return; // replay within this connection
        seen.add(key);
      }
      const resp = await handleEdgeMessage(msg, { store, cloudAuthorize, doorId });
      if (resp) {
        if (resp.t === "result" && resp.mode === "offline" && typeof cloudAuthorize === "function") {
          log("scan.offline-fallback", { doorId, reason: resp.reason }); // audit the cloud→offline gap (#151)
        }
        try { socket.write(JSON.stringify(resp) + "\n"); } catch { /* client gone */ }
      }
    });
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
  startEdgeListener(cfg, store, registry, uplink.cloudAuthorize);
  log("broker.started", { envelopeDir: cfg.envelopeDir, doors: Object.keys(registry).length });
}

// Entrypoint guard: run() only when executed directly (not when imported by a test).
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) run();
