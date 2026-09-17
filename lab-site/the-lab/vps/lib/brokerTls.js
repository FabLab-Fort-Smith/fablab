// TLS option builders for the broker's two links (S2c) — pure functions so the security-critical
// hardening flags are unit-asserted (docs/architecture/door-controller-wifi.md §3, #151).
//
// Link A (edges → broker): an mTLS server — REQUIRE + VERIFY a CA-signed client cert (internal CA).
// Link B (broker → cloud):  a TLS client that MUST verify the cloud's server cert (rejectUnauthorized)
//   + hostname (SNI/servername) — a plaintext/unvalidated uplink would let a MITM forge online grants,
//   which have no signature backstop. The bearer (BROKER_UPLINK_SECRET) is sent only AFTER TLS.
//   Trust anchor for the CLOUD cert is SEPARATE from the internal edge CA: the cloud endpoint is
//   TLS-terminated at the edge proxy with a PUBLIC (e.g. Let's Encrypt) cert, so by default the uplink
//   verifies against Node's bundled public roots. Reusing the internal `caRoot` here (its old value)
//   made Link-B impossible (UNABLE_TO_GET_ISSUER_CERT_LOCALLY), and widening `caRoot` to public roots
//   would break Link-A (any public cert could impersonate an edge) — hence the split. Set the optional
//   BROKER_UPLINK_CA to PIN a specific cloud CA/cert (recommended for production hardening).

/**
 * mTLS server options for the Link-A edge listener. `requestCert` + `rejectUnauthorized` mean a
 * connection without a CA-signed client cert is dropped at the TLS layer (before any app message).
 * @param {{tls:{cert:Buffer,key:Buffer,caRoot:Buffer}}} cfg  from loadBrokerConfig()
 */
export function edgeListenerTlsOptions(cfg) {
  return {
    cert: cfg.tls.cert,
    key: cfg.tls.key,
    ca: cfg.tls.caRoot,
    requestCert: true,          // demand a client cert (mTLS)
    rejectUnauthorized: true,   // ...and reject one not signed by our CA
    minVersion: "TLSv1.2",
  };
}

/**
 * TLS client options for the Link-B cloud uplink. REQUIRES server-cert validation (rejectUnauthorized)
 * + hostname verification (servername) — the load-bearing rung-1 control (#151). The cloud trust anchor
 * is SEPARATE from the internal edge CA (see file header): if `cfg.uplink.ca` is set (BROKER_UPLINK_CA)
 * the uplink PINS that CA/cert; otherwise `ca` is omitted so Node verifies against its bundled PUBLIC
 * roots (the cloud is edge-terminated with a public/LE cert). Never sets `caRoot` here — that would
 * fail against a public cert. The broker also presents its cert/key so the uplink is full mTLS where
 * the cloud requests a client cert (defense in depth); the bearer is still sent post-handshake.
 * @param {{tls:{cert:Buffer,key:Buffer}, uplink:{url:string,ca?:Buffer}}} cfg
 */
export function uplinkTlsOptions(cfg) {
  let servername;
  try { servername = new URL(cfg.uplink.url).hostname; } catch { servername = undefined; }
  const opts = {
    cert: cfg.tls.cert,         // present the broker cert too → mTLS on Link B where the cloud asks for it
    key: cfg.tls.key,
    rejectUnauthorized: true,   // NEVER disable — verify the cloud's server cert
    minVersion: "TLSv1.2",
    servername,                 // SNI + hostname verification target
  };
  // Pin the cloud CA when provided (prod hardening); else fall back to Node's bundled public roots.
  if (cfg.uplink?.ca) opts.ca = cfg.uplink.ca;
  return opts;
}

const BrokerTls = { edgeListenerTlsOptions, uplinkTlsOptions };
export default BrokerTls;
