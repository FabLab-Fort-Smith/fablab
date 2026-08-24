// vps/lib/brokerUplink.js — the cloud side of Link-B (S2c-2): bearer auth, owned-door scope (BOLA),
// rate limit, fail-secure authz, envelope scoping. Pure core, no sockets.

import {
  timingSafeEqualStr, loadBrokerSecrets, loadBrokerDoorMap, makeBrokerAuth, makeRateLimiter, makeBrokerUplink,
} from "../../vps/lib/brokerUplink.js";

describe("loaders (fail-closed)", () => {
  test("loadBrokerSecrets parses a {brokerId:secret} object, drops non-string values", () => {
    expect(loadBrokerSecrets('{"b1":"s1","b2":"s2","bad":3}')).toEqual({ b1: "s1", b2: "s2" });
  });
  test("loadBrokerSecrets returns {} on malformed / array / missing (no broker authenticates)", () => {
    expect(loadBrokerSecrets(undefined)).toEqual({});
    expect(loadBrokerSecrets("not json")).toEqual({});
    expect(loadBrokerSecrets("[1,2]")).toEqual({});
  });
  test("loadBrokerDoorMap builds Map<brokerId,Set<doorId>>, ignores non-array / non-string doors", () => {
    const m = loadBrokerDoorMap('{"b1":["d1","d2",7],"b2":"nope"}');
    expect([...m.get("b1")]).toEqual(["d1", "d2"]);
    expect(m.has("b2")).toBe(false);
  });
  test("loadBrokerDoorMap returns empty map on malformed", () => {
    expect(loadBrokerDoorMap("{").size).toBe(0);
  });
});

describe("makeBrokerAuth (constant-time, deny-by-default)", () => {
  const auth = makeBrokerAuth({ b1: "secret-one", b2: "secret-two" });
  test("returns the matching brokerId", () => {
    expect(auth("secret-one")).toBe("b1");
    expect(auth("secret-two")).toBe("b2");
  });
  test("returns null for a wrong / empty / non-string secret", () => {
    expect(auth("nope")).toBeNull();
    expect(auth("")).toBeNull();
    expect(auth(undefined)).toBeNull();
  });
  test("no secrets configured → everything denied", () => {
    expect(makeBrokerAuth({})("anything")).toBeNull();
  });
  test("timingSafeEqualStr false on length/type mismatch", () => {
    expect(timingSafeEqualStr("a", "ab")).toBe(false);
    expect(timingSafeEqualStr(1, "1")).toBe(false);
    expect(timingSafeEqualStr("x", "x")).toBe(true);
  });
});

describe("makeRateLimiter (fixed window, injectable clock)", () => {
  test("allows up to the limit per window, then blocks until the window rolls", () => {
    let t = 1000;
    const allow = makeRateLimiter({ limit: 2, windowMs: 100, now: () => t });
    expect(allow("b1")).toBe(true);
    expect(allow("b1")).toBe(true);
    expect(allow("b1")).toBe(false); // over limit
    t += 100; // new window
    expect(allow("b1")).toBe(true);
  });
  test("limits are per-broker", () => {
    let t = 0;
    const allow = makeRateLimiter({ limit: 1, windowMs: 100, now: () => t });
    expect(allow("b1")).toBe(true);
    expect(allow("b2")).toBe(true); // separate bucket
    expect(allow("b1")).toBe(false);
  });
});

describe("makeBrokerUplink.handleAuthz (fail-secure)", () => {
  const doorMap = new Map([["b1", new Set(["door-a", "door-b"])]]);
  function mk(overrides = {}) {
    const calls = [];
    const authorizeScan = async (a) => { calls.push(a); return { granted: true, mode: "online" }; };
    const u = makeBrokerUplink({
      authorizeScan, authenticate: () => "b1", doorMap, allow: () => true, ...overrides,
    });
    return { u, calls };
  }
  test("unauthenticated (brokerId null) → denied, scan never called", async () => {
    const { u, calls } = mk();
    const r = await u.handleAuthz({ brokerId: null, id: 1, doorId: "door-a", code: "x" });
    expect(r).toMatchObject({ t: "authz_result", id: 1, granted: false, reason: "UNAUTHENTICATED" });
    expect(calls).toHaveLength(0);
  });
  test("missing door/code → denied", async () => {
    const { u } = mk();
    expect((await u.handleAuthz({ brokerId: "b1", id: 2, doorId: "", code: "x" })).reason).toBe("MISSING_FIELDS");
    expect((await u.handleAuthz({ brokerId: "b1", id: 3, doorId: "door-a", code: "" })).reason).toBe("MISSING_FIELDS");
  });
  test("door not owned by this broker → denied, scan never called (BOLA)", async () => {
    const { u, calls } = mk();
    const r = await u.handleAuthz({ brokerId: "b1", id: 4, doorId: "someone-elses-door", code: "x" });
    expect(r).toMatchObject({ granted: false, reason: "DOOR_NOT_OWNED" });
    expect(calls).toHaveLength(0);
  });
  test("rate-limited → denied, scan never called", async () => {
    const { u, calls } = mk({ allow: () => false });
    const r = await u.handleAuthz({ brokerId: "b1", id: 5, doorId: "door-a", code: "x" });
    expect(r).toMatchObject({ granted: false, reason: "RATE_LIMITED" });
    expect(calls).toHaveLength(0);
  });
  test("owned + allowed → proxies to authorizeScan and returns its decision", async () => {
    const { u, calls } = mk();
    const r = await u.handleAuthz({ brokerId: "b1", id: 6, doorId: "door-b", code: "the-code", tz: "T" });
    expect(r).toMatchObject({ t: "authz_result", id: 6, granted: true, mode: "online" });
    expect(calls[0]).toEqual({ cardId: "the-code", doorId: "door-b", tz: "T" });
  });
  test("an authoritative online DENY is honored (not fail-open)", async () => {
    const { u } = mk({ authorizeScan: async () => ({ granted: false, reason: "REVOKED", mode: "online" }) });
    const r = await u.handleAuthz({ brokerId: "b1", id: 7, doorId: "door-a", code: "x" });
    expect(r).toMatchObject({ granted: false, reason: "REVOKED" });
  });
});

describe("makeBrokerUplink.scopeEnvelopes (BOLA before relay)", () => {
  const doorMap = new Map([["b1", new Set(["door-a"])]]);
  const u = makeBrokerUplink({ authorizeScan: async () => ({}), authenticate: () => "b1", doorMap });
  test("keeps only envelopes for owned doors; reports the rest as rejected", () => {
    const { accepted, rejected } = u.scopeEnvelopes("b1", [
      { payload: { doorId: "door-a" } },
      { payload: { doorId: "door-x" } },
      { nope: true },
    ]);
    expect(accepted).toEqual([{ payload: { doorId: "door-a" } }]);
    expect(rejected).toEqual(["door-x", null]);
  });
  test("a broker with no mapped doors accepts nothing", () => {
    expect(u.scopeEnvelopes("unknown", [{ payload: { doorId: "door-a" } }]).accepted).toHaveLength(0);
  });
});

test("makeBrokerUplink requires its collaborators", () => {
  expect(() => makeBrokerUplink({ authenticate: () => null })).toThrow(/authorizeScan/);
  expect(() => makeBrokerUplink({ authorizeScan: () => {} })).toThrow(/authenticate/);
});
