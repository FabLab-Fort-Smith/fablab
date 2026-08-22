// vps/lib/otaServer.js — publish + resolveManifest (pin + anti-rollback) + setPin.
// Store is injected (in-memory stub), so no disk needed.

import crypto from "crypto";
import { signManifest } from "../../vps/lib/otaManifest.js";
import { publish, resolveManifest, setPin, pinKey } from "../../vps/lib/otaServer.js";

const manifest = (over = {}) => ({
  role: "pico", version: "1.4.0", minVersion: "1.0.0",
  sha256: "a".repeat(64), size: 1024, blobKey: `firmware/pico/${over.version || "1.4.0"}.bin`,
  ...over,
});

// Minimal in-memory store matching the otaStore interface.
function memStore() {
  const manifests = new Map(); // `${role}/${version}` -> signed
  const pins = new Map();      // pinKey -> version
  return {
    manifests, pins,
    async getManifest(role, v) { return manifests.get(`${role}/${v}`) || null; },
    async getLatestManifest(role) {
      const vs = [...manifests.keys()].filter((k) => k.startsWith(`${role}/`)).map((k) => k.split("/")[1]).sort();
      return vs.length ? manifests.get(`${role}/${vs[vs.length - 1]}`) : null;
    },
    async putManifest(signed) { manifests.set(`${signed.manifest.role}/${signed.manifest.version}`, signed); },
    async getPin(role, deviceId) { return (deviceId && pins.get(`${role}:${deviceId}`)) || pins.get(role) || null; },
    async setPin(key, v) { pins.set(key, v); },
    blobUrl(key) { return `https://blobs.example/${key}`; },
  };
}

beforeAll(() => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  process.env.DOOR_FW_SIGNING_KEY = privateKey.export({ type: "pkcs8", format: "der" }).toString("base64");
  process.env.DOOR_FW_VERIFY_KEY = publicKey.export({ type: "spki", format: "der" }).toString("base64");
});

test("publish stores a validly-signed manifest", async () => {
  const store = memStore();
  const out = await publish({ store, signed: signManifest(manifest({ version: "1.4.0" })) });
  expect(out).toEqual({ ok: true, role: "pico", version: "1.4.0" });
  expect(store.manifests.has("pico/1.4.0")).toBe(true);
});

test("publish rejects a bad signature (nothing stored)", async () => {
  const store = memStore();
  const signed = signManifest(manifest());
  signed.sig = Buffer.from("nope").toString("base64");
  const out = await publish({ store, signed });
  expect(out).toEqual({ ok: false, reason: "bad-signature" });
  expect(store.manifests.size).toBe(0);
});

test("resolveManifest: nothing published → upToDate", async () => {
  const store = memStore();
  const out = await resolveManifest({ store, role: "pico", deviceId: "door-front", currentVersion: "1.0.0" });
  expect(out).toEqual({ upToDate: true, reason: "none-published" });
});

test("resolveManifest: newer latest → update envelope with blob URL", async () => {
  const store = memStore();
  await publish({ store, signed: signManifest(manifest({ version: "1.4.0" })) });
  const out = await resolveManifest({ store, role: "pico", deviceId: "door-front", currentVersion: "1.3.0" });
  expect(out.update).toBe(true);
  expect(out.version).toBe("1.4.0");
  expect(out.blobUrl).toBe("https://blobs.example/firmware/pico/1.4.0.bin");
  expect(out.sig).toBeTruthy();
});

test("resolveManifest: equal version → upToDate (anti-rollback path)", async () => {
  const store = memStore();
  await publish({ store, signed: signManifest(manifest({ version: "1.3.0" })) });
  const out = await resolveManifest({ store, role: "pico", deviceId: "door-front", currentVersion: "1.3.0" });
  expect(out).toEqual({ upToDate: true, reason: "not-newer" });
});

test("device pin overrides latest", async () => {
  const store = memStore();
  await publish({ store, signed: signManifest(manifest({ version: "1.4.0" })) });
  await publish({ store, signed: signManifest(manifest({ version: "1.5.0" })) });
  // Pin this device to 1.4.0 even though 1.5.0 is latest.
  expect(await setPin({ store, role: "pico", deviceId: "door-front", version: "1.4.0" })).toEqual({ ok: true });
  const out = await resolveManifest({ store, role: "pico", deviceId: "door-front", currentVersion: "1.3.0" });
  expect(out.version).toBe("1.4.0");
  // A different device (no pin) still gets latest.
  const other = await resolveManifest({ store, role: "pico", deviceId: "door-back", currentVersion: "1.3.0" });
  expect(other.version).toBe("1.5.0");
});

test("setPin rejects an unpublished version", async () => {
  const store = memStore();
  await publish({ store, signed: signManifest(manifest({ version: "1.4.0" })) });
  expect(await setPin({ store, role: "pico", version: "9.9.9" })).toEqual({ ok: false, reason: "version-not-published" });
});

test("pinKey composes device-specific vs role-wide", () => {
  expect(pinKey("pico", "door-front")).toBe("pico:door-front");
  expect(pinKey("pico")).toBe("pico");
});
