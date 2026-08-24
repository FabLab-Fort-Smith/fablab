// vps/lib/brokerStore.js — per-door envelope cache with anti-rollback (F5) + path-safety (CWE-22).

import crypto from "crypto";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { makeBrokerStore } from "../../vps/lib/brokerStore.js";

const env = (doorId, version) => ({ payload: { doorId, version, entries: [] }, sig: "x", alg: "ed25519" });

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

test("put → get; newer version replaces", async () => {
  const s = makeBrokerStore({ dir });
  expect(await s.putEnvelope(env("front", 1))).toEqual({ stored: true, version: 1 });
  expect(await s.putEnvelope(env("front", 2))).toEqual({ stored: true, version: 2 });
  expect((await s.getEnvelope("front")).payload.version).toBe(2);
});

test("anti-rollback: an equal-or-older version is rejected (F5)", async () => {
  const s = makeBrokerStore({ dir });
  await s.putEnvelope(env("front", 5));
  expect(await s.putEnvelope(env("front", 5))).toEqual({ stored: false, reason: "stale-version" });
  expect(await s.putEnvelope(env("front", 4))).toEqual({ stored: false, reason: "stale-version" });
  expect((await s.getEnvelope("front")).payload.version).toBe(5); // unchanged
});

test("high-water is per-door and persists across a fresh store instance (survives restart)", async () => {
  await makeBrokerStore({ dir }).putEnvelope(env("front", 3));
  await makeBrokerStore({ dir }).putEnvelope(env("back", 1));
  const s2 = makeBrokerStore({ dir }); // "restart"
  expect(await s2.highWater("front")).toBe(3);
  expect(await s2.highWater("back")).toBe(1);
  expect(await s2.putEnvelope(env("front", 2))).toEqual({ stored: false, reason: "stale-version" }); // rollback still blocked after restart
  expect(new Set(await s2.listDoors())).toEqual(new Set(["front", "back"]));
});

test("rejects a malformed envelope (no doorId / non-integer version)", async () => {
  const s = makeBrokerStore({ dir });
  expect(await s.putEnvelope({ payload: { version: 1 }, sig: "x" })).toEqual({ stored: false, reason: "bad-envelope" });
  expect(await s.putEnvelope({ payload: { doorId: "front", version: 1.5 }, sig: "x" })).toEqual({ stored: false, reason: "bad-envelope" });
});

test("path-safety: a traversal doorId is rejected", async () => {
  const s = makeBrokerStore({ dir });
  await expect(s.getEnvelope("../../etc/passwd")).rejects.toThrow(/invalid doorId/);
  await expect(s.putEnvelope(env("..", 1))).rejects.toThrow(/invalid doorId/);
  await expect(s.getEnvelope("a/b")).rejects.toThrow(/invalid doorId/);
});
