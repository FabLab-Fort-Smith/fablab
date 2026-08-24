// On-site broker configuration + cert loader (S2b prep for the S2c container/transport). Loads and
// FAIL-CLOSED validates everything the broker runtime needs, so a misprovisioned broker refuses to
// start rather than coming up insecure (master §2 fail-closed, topic-config-environments "validate at
// startup"). Certs are loaded from FILE PATHS (mounted into the container, internal-CA-issued) — never
// baked into the image; keys are read at boot, not logged.
//
// Env:
//   Link A (edges → broker, mTLS):   BROKER_TLS_CERT, BROKER_TLS_KEY (broker server cert/key),
//                                    BROKER_CA_ROOT (verify edge client certs), BROKER_LISTEN_PORT
//   Link B (broker → cloud, WSS):    CLOUD_UPLINK_URL (wss:// only), BROKER_UPLINK_SECRET (service cred)
//   Crypto:                          BROKER_INDEX_KEY (base64 32B), DOOR_ALLOWLIST_VERIFY_KEY (base64 spki)
//   Store:                           BROKER_ENVELOPE_DIR

import fs from "fs";
import crypto from "crypto";

function req(name) {
  const v = process.env[name];
  if (!v || !String(v).trim()) throw new Error(`${name} is not configured`);
  return v;
}

function readFileStrict(name) {
  const p = req(name);
  let data;
  try {
    data = fs.readFileSync(p);
  } catch (e) {
    throw new Error(`${name}: cannot read file at "${p}" (${e.code || e.message})`);
  }
  if (!data.length) throw new Error(`${name}: file at "${p}" is empty`);
  return data;
}

function base64Key(name) {
  const b = Buffer.from(req(name), "base64");
  if (b.length !== 32) throw new Error(`${name} must decode to 32 bytes (got ${b.length})`);
  return b;
}

/**
 * Load + validate the broker config. Throws on the FIRST problem with a specific message (fail-closed).
 * Returns typed config; the raw key/cert Buffers are held only in the returned object (not logged).
 * @returns {{tls:{cert:Buffer,key:Buffer,caRoot:Buffer,listenPort:number,listenHost:string},
 *            uplink:{url:string,secret:string}, brokerIndexKey:Buffer, allowlistVerifyKeyB64:string,
 *            envelopeDir:string}}
 */
export function loadBrokerConfig() {
  // Link B uplink MUST be wss:// (mutually authenticated + encrypted — an online grant is trusted
  // with no signature backstop, so a plaintext/ws:// uplink would let a MITM forge grants — #151).
  const url = req("CLOUD_UPLINK_URL");
  if (!url.startsWith("wss://")) throw new Error(`CLOUD_UPLINK_URL must be wss:// (got "${url.split(":")[0]}://")`);

  const listenPort = Number(process.env.BROKER_LISTEN_PORT || 8443);
  if (!Number.isInteger(listenPort) || listenPort < 1 || listenPort > 65535) {
    throw new Error(`BROKER_LISTEN_PORT must be a valid port (got "${process.env.BROKER_LISTEN_PORT}")`);
  }

  const cfg = {
    tls: {
      cert: readFileStrict("BROKER_TLS_CERT"),
      key: readFileStrict("BROKER_TLS_KEY"),
      caRoot: readFileStrict("BROKER_CA_ROOT"),
      listenPort,
      listenHost: process.env.BROKER_LISTEN_HOST || "0.0.0.0",
    },
    uplink: { url, secret: req("BROKER_UPLINK_SECRET") },
    brokerIndexKey: base64Key("BROKER_INDEX_KEY"),
    allowlistVerifyKeyB64: req("DOOR_ALLOWLIST_VERIFY_KEY"),
    envelopeDir: req("BROKER_ENVELOPE_DIR"),
  };
  // Fail at boot (not per-scan) if the verify key isn't a valid Ed25519 spki public key — asserting
  // the algorithm catches a mis-provisioned RSA/EC key here rather than on the first envelope verify.
  let pk;
  try {
    pk = crypto.createPublicKey({ key: Buffer.from(cfg.allowlistVerifyKeyB64, "base64"), format: "der", type: "spki" });
  } catch {
    throw new Error("DOOR_ALLOWLIST_VERIFY_KEY is not a valid base64 spki public key");
  }
  if (pk.asymmetricKeyType !== "ed25519") {
    throw new Error(`DOOR_ALLOWLIST_VERIFY_KEY must be Ed25519 (got ${pk.asymmetricKeyType})`);
  }
  return cfg;
}

/** Non-throwing readiness probe (which required vars/files are missing) — for a health endpoint. */
export function brokerConfigReady() {
  try {
    loadBrokerConfig();
    return { ready: true, missing: [] };
  } catch (e) {
    return { ready: false, missing: [String(e.message)] };
  }
}

const BrokerConfig = { loadBrokerConfig, brokerConfigReady };
export default BrokerConfig;
