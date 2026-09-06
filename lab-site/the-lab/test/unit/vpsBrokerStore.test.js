// vps/lib/brokerStore.js — per-door envelope cache: atomic anti-rollback (F5, SEC F-1/F-2),
// verify-inside-the-lock, and path-safety (CWE-22).

import crypto from "crypto";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { makeBrokerStore } from "../../vps/lib/brokerStore.js";

const env = (doorId, version) => ({ payload: { doorId, version, entries: [] }, sig: "x", alg: "ed25519" });
const OK = { verify: () => true }; // store unit tests inject a stub verify (crypto is covered elsewhere)

let dir;
beforeEach(async () => {
  dir = path.join(os.tmpdir(), "broker-store-" + crypto.randomBytes(6).toString("hex"));
  await fs.mkdir(dir, { recursive: true });
});
afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }); });

test("ready() requires a dir", () => {
  expect(makeBrokerStore({ dir: "" }).ready()).toBe(false);
  expect(makeBrokerStore({ dir }).ready()).toBe(true);
});

test("put → get; newer version replaces; version of record is the file", async () => {
  const s = makeBrokerStore({ dir });
  expect(await s.putEnvelope(env("front", 1), OK)).toEqual({ stored: true, version: 1 });
  expect(await s.putEnvelope(env("front", 2), OK)).toEqual({ stored: true, version: 2 });
  expect((await s.getEnvelope("front")).payload.version).toBe(2);
  expect(await s.highWater("front")).toBe(2);
});

test("anti-rollback: an equal-or-older version is rejected (F5)", async () => {
  const s = makeBrokerStore({ dir });
  await s.putEnvelope(env("front", 5), OK);
  expect(await s.putEnvelope(env("front", 5), OK)).toEqual({ stored: false, reason: "stale-version" });
  expect(await s.putEnvelope(env("front", 4), OK)).toEqual({ stored: false, reason: "stale-version" });
  expect((await s.getEnvelope("front")).payload.version).toBe(5);
});

test("high-water is per-door and derived from the file → survives a fresh instance (restart)", async () => {
  await makeBrokerStore({ dir }).putEnvelope(env("front", 3), OK);
  await makeBrokerStore({ dir }).putEnvelope(env("back", 1), OK);
  const s2 = makeBrokerStore({ dir }); // "restart"
  expect(await s2.highWater("front")).toBe(3);
  expect(await s2.putEnvelope(env("front", 2), OK)).toEqual({ stored: false, reason: "stale-version" });
  expect(new Set(await s2.listDoors())).toEqual(new Set(["front", "back"]));
});

test("verify is REQUIRED and runs inside the lock (F-2): no verify / failing verify never advances state", async () => {
  const s = makeBrokerStore({ dir });
  await s.putEnvelope(env("front", 1), OK);
  expect(await s.putEnvelope(env("front", 9))).toEqual({ stored: false, reason: "no-verify" }); // missing verify
  expect(await s.putEnvelope(env("front", 9), { verify: () => false })).toEqual({ stored: false, reason: "bad-signature" });
  // an unverified/forged high version did NOT poison the high-water → a real v2 still stores
  expect(await s.highWater("front")).toBe(1);
  expect(await s.putEnvelope(env("front", 2), OK)).toEqual({ stored: true, version: 2 });
});

test("CONCURRENT same-door puts (F-1): resting version is the max; no lower version ever wins", async () => {
  const s = makeBrokerStore({ dir });
  const versions = [3, 1, 2, 5, 4];
  const results = await Promise.all(versions.map((v) => s.putEnvelope(env("front", v), OK)));
  const stored = results.filter((r) => r.stored).map((r) => r.version);
  // whatever interleaving, the final file is the max and monotonic non-decreasing acceptance
  expect((await s.getEnvelope("front")).payload.version).toBe(5);
  expect(await s.highWater("front")).toBe(5);
  expect(Math.max(...stored)).toBe(5);
  // every accepted version was strictly greater than all previously-accepted ones (serialized)
  expect(stored).toEqual([...stored].sort((a, b) => a - b));
});

test("rejects a malformed envelope before any state change", async () => {
  const s = makeBrokerStore({ dir });
  expect(await s.putEnvelope({ payload: { version: 1 }, sig: "x" }, OK)).toEqual({ stored: false, reason: "bad-envelope" });
  expect(await s.putEnvelope({ payload: { doorId: "front", version: 1.5 }, sig: "x" }, OK)).toEqual({ stored: false, reason: "bad-envelope" });
});

test("a disk-write failure fails closed with io-error, not a throw (N-2)", async () => {
  const s = makeBrokerStore({ dir });
  await fs.writeFile(path.join(dir, "doors"), "x"); // occupy <dir>/doors as a FILE → mkdir/write fails
  expect(await s.putEnvelope(env("front", 1), OK)).toEqual({ stored: false, reason: "io-error" });
});

test("path-safety: a traversal doorId is rejected", async () => {
  const s = makeBrokerStore({ dir });
  await expect(s.getEnvelope("../../etc/passwd")).rejects.toThrow(/invalid doorId/);
  await expect(s.putEnvelope(env("..", 1), OK)).rejects.toThrow(/invalid doorId/);
  await expect(s.getEnvelope("a/b")).rejects.toThrow(/invalid doorId/);
});
