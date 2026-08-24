// vps/lib/brokerConfig.js — fail-closed load + validation of the broker runtime config (S2b/S2c).

import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { loadBrokerConfig, brokerConfigReady } from "../../vps/lib/brokerConfig.js";

let dir;
const ENV_KEYS = [
  "BROKER_TLS_CERT", "BROKER_TLS_KEY", "BROKER_CA_ROOT", "BROKER_LISTEN_PORT", "BROKER_LISTEN_HOST",
  "CLOUD_UPLINK_URL", "BROKER_UPLINK_SECRET", "BROKER_INDEX_KEY", "DOOR_ALLOWLIST_VERIFY_KEY", "BROKER_ENVELOPE_DIR",
];
let saved;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "bcfg-"));
  const cert = path.join(dir, "broker.crt"), key = path.join(dir, "broker.key"), ca = path.join(dir, "ca.crt");
  fs.writeFileSync(cert, "CERTDATA");
  fs.writeFileSync(key, "KEYDATA");
  fs.writeFileSync(ca, "CADATA");
  const { publicKey } = crypto.generateKeyPairSync("ed25519");
  process.env.BROKER_TLS_CERT = cert;
  process.env.BROKER_TLS_KEY = key;
  process.env.BROKER_CA_ROOT = ca;
  process.env.BROKER_LISTEN_PORT = "8443";
  delete process.env.BROKER_LISTEN_HOST;
  process.env.CLOUD_UPLINK_URL = "wss://cloud.example/broker";
  process.env.BROKER_UPLINK_SECRET = "uplink-secret";
  process.env.BROKER_INDEX_KEY = crypto.randomBytes(32).toString("base64");
  process.env.DOOR_ALLOWLIST_VERIFY_KEY = publicKey.export({ type: "spki", format: "der" }).toString("base64");
  process.env.BROKER_ENVELOPE_DIR = path.join(dir, "env");
});
afterEach(() => {
  for (const k of ENV_KEYS) (saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]));
  fs.rmSync(dir, { recursive: true, force: true });
});

test("loads a fully-provisioned config", () => {
  const cfg = loadBrokerConfig();
  expect(cfg.tls.cert.toString()).toBe("CERTDATA");
  expect(cfg.tls.key.toString()).toBe("KEYDATA");
  expect(cfg.tls.caRoot.toString()).toBe("CADATA");
  expect(cfg.tls.listenPort).toBe(8443);
  expect(cfg.tls.listenHost).toBe("0.0.0.0"); // default
  expect(cfg.uplink.url).toBe("wss://cloud.example/broker");
  expect(cfg.brokerIndexKey.length).toBe(32);
  expect(cfg.envelopeDir).toBe(path.join(dir, "env"));
  expect(brokerConfigReady().ready).toBe(true);
});

test("fail-closed: a missing required var throws a specific error", () => {
  delete process.env.BROKER_UPLINK_SECRET;
  expect(() => loadBrokerConfig()).toThrow(/BROKER_UPLINK_SECRET is not configured/);
  expect(brokerConfigReady().ready).toBe(false);
});

test("fail-closed: an unreadable/missing cert file throws", () => {
  process.env.BROKER_TLS_KEY = path.join(dir, "does-not-exist.key");
  expect(() => loadBrokerConfig()).toThrow(/BROKER_TLS_KEY: cannot read file/);
});

test("fail-closed: an empty cert file throws", () => {
  fs.writeFileSync(process.env.BROKER_TLS_CERT, "");
  expect(() => loadBrokerConfig()).toThrow(/BROKER_TLS_CERT: file .* is empty/);
});

test("fail-closed: the uplink URL must be wss:// (no ws:// / plaintext)", () => {
  process.env.CLOUD_UPLINK_URL = "ws://cloud.example/broker";
  expect(() => loadBrokerConfig()).toThrow(/must be wss:\/\//);
});

test("fail-closed: BROKER_INDEX_KEY must decode to 32 bytes", () => {
  process.env.BROKER_INDEX_KEY = Buffer.alloc(16).toString("base64");
  expect(() => loadBrokerConfig()).toThrow(/must decode to 32 bytes/);
});

test("fail-closed: a bad allowlist verify key is rejected at boot", () => {
  process.env.DOOR_ALLOWLIST_VERIFY_KEY = Buffer.from("not-a-key").toString("base64");
  expect(() => loadBrokerConfig()).toThrow(/not a valid base64 spki public key/);
});

test("fail-closed: bad listen ports are rejected (0, non-numeric)", () => {
  for (const bad of ["70000", "0", "abc", "-1", "8443.5"]) {
    process.env.BROKER_LISTEN_PORT = bad;
    expect(() => loadBrokerConfig()).toThrow(/must be a valid port/);
  }
});

test("BROKER_LISTEN_HOST override is honored", () => {
  process.env.BROKER_LISTEN_HOST = "127.0.0.1";
  expect(loadBrokerConfig().tls.listenHost).toBe("127.0.0.1");
});

test("fail-closed: a non-Ed25519 verify key is rejected at boot", () => {
  const { publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  process.env.DOOR_ALLOWLIST_VERIFY_KEY = publicKey.export({ type: "spki", format: "der" }).toString("base64");
  expect(() => loadBrokerConfig()).toThrow(/must be Ed25519/);
});

test("secret hygiene: a validation error (and the readiness probe) never leak a secret VALUE", () => {
  process.env.BROKER_UPLINK_SECRET = "SUPERSECRET-uplink-token";
  process.env.BROKER_INDEX_KEY = "not-32-bytes"; // force a sibling validation error
  let msg = "";
  try { loadBrokerConfig(); } catch (e) { msg = String(e.message); }
  expect(msg).toMatch(/BROKER_INDEX_KEY must decode to 32 bytes/);
  const probe = JSON.stringify(brokerConfigReady());
  for (const blob of [msg, probe]) {
    expect(blob).not.toContain("SUPERSECRET-uplink-token");
    expect(blob).not.toContain("not-32-bytes"); // not even the offending value, only its length
  }
});
