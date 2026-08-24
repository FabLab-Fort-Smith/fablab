// vps/lib/brokerResync.js (S2c-2c) — the socket-server → app resync request + per-broker cooldown.

import { makeRequestBrokerResync, makeResyncTrigger } from "../../vps/lib/brokerResync.js";

describe("makeRequestBrokerResync", () => {
  const env = { APP_INTERNAL_URL: "http://app.internal", INTERNAL_API_SECRET: "isek" };
  test("POSTs {brokerId} with the internal bearer + a timeout signal; true on ok", async () => {
    const calls = [];
    const fetchImpl = async (url, opts) => { calls.push({ url, opts }); return { ok: true, status: 200 }; };
    const req = makeRequestBrokerResync({ env, fetchImpl });
    expect(await req("broker-a")).toBe(true);
    expect(calls[0].url).toBe("http://app.internal/api/internal/broker-resync");
    expect(calls[0].opts.method).toBe("POST");
    expect(calls[0].opts.headers.authorization).toBe("Bearer isek");
    expect(JSON.parse(calls[0].opts.body)).toEqual({ brokerId: "broker-a" });
    expect(calls[0].opts.signal).toBeInstanceOf(AbortSignal);
  });
  test("false (no throw) when not configured", async () => {
    expect(await makeRequestBrokerResync({ env: {}, fetchImpl: async () => ({ ok: true }) })("b")).toBe(false);
  });
  test("false on non-ok and on fetch throw (best-effort, never throws)", async () => {
    expect(await makeRequestBrokerResync({ env, fetchImpl: async () => ({ ok: false, status: 500 }) })("b")).toBe(false);
    expect(await makeRequestBrokerResync({ env, fetchImpl: async () => { throw new Error("boom"); } })("b")).toBe(false);
  });
  test("never logs the secret", async () => {
    const logs = [];
    const req = makeRequestBrokerResync({ env, fetchImpl: async () => { throw new Error("x"); }, log: (e, f) => logs.push({ e, f }) });
    await req("broker-a");
    expect(JSON.stringify(logs)).not.toContain("isek");
  });
});

describe("makeResyncTrigger (per-broker cooldown)", () => {
  test("fires immediately, then suppresses the same broker within the cooldown", async () => {
    let t = 1000;
    const fired = [];
    const trigger = makeResyncTrigger({ resync: async (b) => fired.push(b), cooldownMs: 100, now: () => t });
    trigger("b1"); trigger("b1");            // second is within cooldown → suppressed
    await Promise.resolve();
    expect(fired).toEqual(["b1"]);
    t += 100;                                 // cooldown elapsed
    trigger("b1");
    await Promise.resolve();
    expect(fired).toEqual(["b1", "b1"]);
  });
  test("cooldown is per-broker", async () => {
    let t = 0;
    const fired = [];
    const trigger = makeResyncTrigger({ resync: async (b) => fired.push(b), cooldownMs: 100, now: () => t });
    trigger("b1"); trigger("b2");
    await Promise.resolve();
    expect(fired.sort()).toEqual(["b1", "b2"]);
  });
  test("a rejecting resync doesn't throw out of the trigger (fire-and-forget)", async () => {
    const trigger = makeResyncTrigger({ resync: async () => { throw new Error("boom"); } });
    expect(() => trigger("b1")).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
  });
  test("empty brokerId is ignored", async () => {
    const fired = [];
    makeResyncTrigger({ resync: async (b) => fired.push(b) })("");
    await Promise.resolve();
    expect(fired).toEqual([]);
  });
  test("requires a resync fn", () => {
    expect(() => makeResyncTrigger({})).toThrow(/resync/);
  });
});
