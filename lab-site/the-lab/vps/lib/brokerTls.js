// TLS option builders for the broker's two links (S2c) — pure functions so the security-critical
// hardening flags are unit-asserted (docs/architecture/door-controller-wifi.md §3, #151).
//
// Link A (edges → broker): an mTLS server — REQUIRE + VERIFY a CA-signed client cert.
// Link B (broker → cloud):  a TLS client that MUST verify the cloud's server cert (rejectUnauthorized)
//   and pin the CA — a plaintext/unvalidated uplink would let a MITM forge online grants, which have
//   no signature backstop. The bearer (BROKER_UPLINK_SECRET) is sent only AFTER TLS (in the shell).

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
 * TLS client options for the Link-B cloud uplink. Pins the CA and REQUIRES server-cert validation —
 * the load-bearing rung-1 control (#151). If the broker also presents its cert here, the uplink is
 * full mTLS (stronger than a bearer alone); the bearer is still sent post-handshake by the shell.
 * @param {{tls:{cert:Buffer,key:Buffer,caRoot:Buffer}, uplink:{url:string}}} cfg
 */
export function uplinkTlsOptions(cfg) {
  let servername;
  try { servername = new URL(cfg.uplink.url).hostname; } catch { servername = undefined; }
  return {
    ca: cfg.tls.caRoot,
    cert: cfg.tls.cert,         // present the broker cert too → mTLS on Link B (defense in depth)
    key: cfg.tls.key,
    rejectUnauthorized: true,   // NEVER disable — verify the cloud's server cert
    minVersion: "TLSv1.2",
    servername,                 // SNI + hostname verification target
  };
}

const BrokerTls = { edgeListenerTlsOptions, uplinkTlsOptions };
export default BrokerTls;
