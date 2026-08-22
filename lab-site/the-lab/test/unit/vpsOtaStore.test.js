// vps/lib/otaStore.js — filesystem store: put/getLatest/pin + path-safety.

import crypto from "crypto";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { makeStore } from "../../vps/lib/otaStore.js";

const signed = (role, version) => ({
  manifest: { role, version, minVersion: "1.0.0", sha256: "a".repeat(64), size: 1, blobKey: `firmware/${role}/${version}.bin` },
  sig: "x", alg: "ed25519",
});

let dir;
beforeEach(async () => {
  dir = path.join(os.tmpdir(), "ota-store-" + crypto.randomBytes(6).toString("hex"));
  await fs.mkdir(dir, { recursive: true });
});
afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }); });

test("ready() requires dir + blobBase", () => {
  expect(makeStore({ dir, blobBase: "" }).ready()).toBe(false);
  expect(makeStore({ dir, blobBase: "https://b" }).ready()).toBe(true);
});

test("put → getManifest / getLatestManifest (semver-max, not lexical)", async () => {
  const s = makeStore({ dir, blobBase: "https://b" });
  await s.putManifest(signed("pico", "1.9.0"));
  await s.putManifest(signed("pico", "1.10.0"));
  expect((await s.getManifest("pico", "1.9.0")).manifest.version).toBe("1.9.0");
  expect((await s.getLatestManifest("pico")).manifest.version).toBe("1.10.0"); // numeric compare
});

test("getLatestManifest → null when nothing published", async () => {
  const s = makeStore({ dir, blobBase: "https://b" });
  expect(await s.getLatestManifest("pi-zero")).toBeNull();
});

test("pins: device-specific overrides role-wide", async () => {
  const s = makeStore({ dir, blobBase: "https://b" });
  await s.setPin("pico", "1.2.0");                 // role-wide
  await s.setPin("pico:door-front", "1.4.0");      // device
  expect(await s.getPin("pico", "door-front")).toBe("1.4.0");
  expect(await s.getPin("pico", "door-back")).toBe("1.2.0");
});

test("blobUrl joins base + key without double slashes", () => {
  const s = makeStore({ dir, blobBase: "https://b/" });
  expect(s.blobUrl("/firmware/pico/1.0.0.bin")).toBe("https://b/firmware/pico/1.0.0.bin");
});

test("path-safety: bad role/version are rejected (no traversal)", async () => {
  const s = makeStore({ dir, blobBase: "https://b" });
  await expect(s.getManifest("../../etc", "1.0.0")).rejects.toThrow(/invalid role/);
  await expect(s.getManifest("pico", "../../evil")).rejects.toThrow(/invalid version/);
});
