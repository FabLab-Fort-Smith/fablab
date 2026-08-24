// vps/lib/brokerTls.js — the TLS hardening options (#151), asserted directly + proven with a real
// in-process mTLS handshake (openssl-minted throwaway certs; the test self-skips if openssl is absent).

import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import tls from "tls";
import { edgeListenerTlsOptions, uplinkTlsOptions } from "../../vps/lib/brokerTls.js";

function fakeCfg(certDir) {
  return {
    tls: {
      cert: certDir ? fs.readFileSync(path.join(certDir, "broker.crt")) : Buffer.from("CERT"),
      key: certDir ? fs.readFileSync(path.join(certDir, "broker.key")) : Buffer.from("KEY"),
      caRoot: certDir ? fs.readFileSync(path.join(certDir, "ca.crt")) : Buffer.from("CA"),
      listenPort: 0,
      listenHost: "127.0.0.1",
    },
    uplink: { url: "wss://cloud.example:8443/broker" },
  };
}

// --- pure hardening assertions (always run) -----------------------------------------------------
test("edgeListenerTlsOptions demands + verifies a client cert (mTLS)", () => {
  const o = edgeListenerTlsOptions(fakeCfg());
  expect(o.requestCert).toBe(true);
  expect(o.rejectUnauthorized).toBe(true); // reject a client cert not signed by our CA
  expect(o.ca).toBeDefined();
  expect(o.cert).toBeDefined();
  expect(o.key).toBeDefined();
  expect(o.minVersion).toBe("TLSv1.2");
});

test("uplinkTlsOptions verifies + pins the cloud cert (never disabled) and sets SNI", () => {
  const o = uplinkTlsOptions(fakeCfg());
  expect(o.rejectUnauthorized).toBe(true); // the load-bearing rung-1 control (#151)
  expect(o.ca).toBeDefined();
  expect(o.servername).toBe("cloud.example");
  expect(o.minVersion).toBe("TLSv1.2");
});

// --- real in-process mTLS handshake -------------------------------------------------------------
let certDir = null;
beforeAll(() => {
  try {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mtls-"));
    const ossl = (args) => execFileSync("openssl", args, { cwd: dir, stdio: ["ignore", "ignore", "ignore"] });
    const mkKey = (n) => ossl(["genpkey", "-algorithm", "ed25519", "-out", `${n}.key`]);
    const mkSelf = (n, cn) => ossl(["req", "-x509", "-key", `${n}.key`, "-out", `${n}.crt`, "-subj", `/CN=${cn}`, "-days", "1"]);
    const mkSigned = (n, cn) => {
      ossl(["req", "-new", "-key", `${n}.key`, "-subj", `/CN=${cn}`, "-out", `${n}.csr`]);
      ossl(["x509", "-req", "-in", `${n}.csr`, "-CA", "ca.crt", "-CAkey", "ca.key", "-out", `${n}.crt`, "-days", "1", "-CAcreateserial"]);
    };
    mkKey("ca"); mkSelf("ca", "test-ca");
    mkKey("broker"); mkSigned("broker", "broker");
    mkKey("edge"); mkSigned("edge", "door-front");
    mkKey("rogue"); mkSelf("rogue", "rogue"); // self-signed (NOT by our CA)
    certDir = dir;
  } catch {
    certDir = null; // openssl unavailable / failed → the handshake tests self-skip
  }
});
afterAll(() => { if (certDir) fs.rmSync(certDir, { recursive: true, force: true }); });

test("mTLS: a CA-signed client cert is accepted server-side; a rogue self-signed cert is rejected", async () => {
  if (!certDir) { console.warn("openssl unavailable — skipping mTLS handshake test"); return; }
  const read = (n) => fs.readFileSync(path.join(certDir, n));
  const serverAuthed = []; // CNs of clients the SERVER accepted (secureConnection fires only when authorized)
  let rejected = 0;
  const server = tls.createServer(edgeListenerTlsOptions(fakeCfg(certDir)), (sock) => {
    serverAuthed.push(sock.getPeerCertificate()?.subject?.CN);
    sock.on("error", () => {});
  });
  server.on("tlsClientError", () => { rejected += 1; });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;

  const attempt = (clientOpts) => new Promise((resolve) => {
    const c = tls.connect({ port, host: "127.0.0.1", ca: read("ca.crt"), rejectUnauthorized: true, servername: "broker", ...clientOpts }, () => { c.end(); resolve("connected"); });
    c.on("error", () => resolve("error"));
  });

  try {
    // Assert on the SERVER's view (client-side connect status is unreliable for a client-cert reject).
    await attempt({ cert: read("edge.crt"), key: read("edge.key") });   // CA-signed edge
    await attempt({ cert: read("rogue.crt"), key: read("rogue.key") }); // rogue self-signed
    await new Promise((r) => setTimeout(r, 100)); // let server events settle
    expect(serverAuthed).toContain("door-front"); // the CA-signed edge reached the app layer (authorized)
    expect(serverAuthed).not.toContain("rogue");   // the rogue never did
    expect(rejected).toBeGreaterThanOrEqual(1);    // ...it was rejected at the TLS layer
  } finally {
    server.close();
  }
});
