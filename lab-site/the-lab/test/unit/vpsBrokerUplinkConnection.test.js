// vps/lib/brokerUplink.js connection driver + relay + multi-member registry (S2c-2 glue + S5 HA),
// tested with a fake ws — no express, no real sockets. Covers the per-connection state machine
// (authn-before-act, wrong-bearer-closes), the registry lifecycle incl. HA (active+standby share one
// brokerId → both tracked + fed), and relayEnvelopes (owned-door scope, all-members, not-connected).

import { makeBrokerRegistry, makeBrokerUplink, makeUplinkConnection, relayEnvelopes } from "../../vps/lib/brokerUplink.js";

const WS_OPEN = 1;
function fakeWs() {
  return {
    readyState: WS_OPEN,
    sent: [],
    closed: false,
    send(s) { if (this.closed) throw new Error("closed"); this.sent.push(JSON.parse(s)); },
    close() { this.closed = true; this.readyState = 3; },
    last() { return this.sent[this.sent.length - 1]; },
  };
}
function mkUplink(overrides = {}) {
  const doorMap = new Map([["b1", new Set(["door-a"])], ["b2", new Set(["door-z"])]]);
  return makeBrokerUplink({
    authorizeScan: async () => ({ granted: true, mode: "online" }),
    authenticate: (s) => (s === "sek-one" ? "b1" : s === "sek-two" ? "b2" : null),
    doorMap,
    ...overrides,
  });
}

describe("makeUplinkConnection — per-connection state machine", () => {
  test("auth with a good bearer registers the broker and acks", async () => {
    const registry = makeBrokerRegistry();
    const ws = fakeWs();
    const conn = makeUplinkConnection({ uplink: mkUplink(), registry })(ws);
    await conn.message(JSON.stringify({ t: "auth", secret: "sek-one" }));
    expect(ws.last()).toEqual({ t: "auth_result", ok: true });
    expect(registry.conns("b1")).toEqual([ws]);
    expect(conn.brokerId()).toBe("b1");
  });

  test("onConnect fires with brokerId on successful auth — not before, not on a bad bearer (S2c-2c)", async () => {
    const connected = [];
    const onConnect = (id) => connected.push(id);
    const ws = fakeWs();
    const conn = makeUplinkConnection({ uplink: mkUplink(), registry: makeBrokerRegistry(), onConnect })(ws);
    await conn.message(JSON.stringify({ t: "authz", id: 1, doorId: "door-a", code: "c" })); // pre-auth
    expect(connected).toEqual([]);
    const bad = fakeWs();
    await makeUplinkConnection({ uplink: mkUplink(), registry: makeBrokerRegistry(), onConnect })(bad)
      .message(JSON.stringify({ t: "auth", secret: "nope" }));
    expect(connected).toEqual([]); // wrong bearer → no resync
    await conn.message(JSON.stringify({ t: "auth", secret: "sek-one" }));
    expect(connected).toEqual(["b1"]);
  });

  test("a throwing onConnect never breaks the connection", async () => {
    const ws = fakeWs();
    const conn = makeUplinkConnection({ uplink: mkUplink(), registry: makeBrokerRegistry(), onConnect: () => { throw new Error("boom"); } })(ws);
    await conn.message(JSON.stringify({ t: "auth", secret: "sek-one" }));
    expect(ws.last()).toEqual({ t: "auth_result", ok: true }); // auth still completed
  });

  test("auth with a wrong bearer → ok:false AND the socket is closed (deny-by-default)", async () => {
    const registry = makeBrokerRegistry();
    const ws = fakeWs();
    const conn = makeUplinkConnection({ uplink: mkUplink(), registry })(ws);
    await conn.message(JSON.stringify({ t: "auth", secret: "nope" }));
    expect(ws.last()).toEqual({ t: "auth_result", ok: false });
    expect(ws.closed).toBe(true);
    expect(registry.count("b1")).toBe(0);
  });

  test("authz BEFORE auth is denied and never touches the door (authn-before-act)", async () => {
    let scanCalls = 0;
    const uplink = mkUplink({ authorizeScan: async () => { scanCalls++; return { granted: true }; } });
    const ws = fakeWs();
    const conn = makeUplinkConnection({ uplink, registry: makeBrokerRegistry() })(ws);
    await conn.message(JSON.stringify({ t: "authz", id: 1, doorId: "door-a", code: "c" }));
    expect(ws.last()).toMatchObject({ t: "authz_result", id: 1, granted: false, reason: "UNAUTHENTICATED" });
    expect(scanCalls).toBe(0);
  });

  test("after auth, authz for an owned door proxies; an unowned door is denied", async () => {
    const ws = fakeWs();
    const conn = makeUplinkConnection({ uplink: mkUplink(), registry: makeBrokerRegistry() })(ws);
    await conn.message(JSON.stringify({ t: "auth", secret: "sek-one" }));
    await conn.message(JSON.stringify({ t: "authz", id: 2, doorId: "door-z", code: "c" })); // b2's door
    expect(ws.last()).toMatchObject({ id: 2, granted: false, reason: "DOOR_NOT_OWNED" });
    await conn.message(JSON.stringify({ t: "authz", id: 3, doorId: "door-a", code: "c" }));
    expect(ws.last()).toMatchObject({ id: 3, granted: true });
  });

  test("ping → pong; malformed JSON ignored", async () => {
    const ws = fakeWs();
    const conn = makeUplinkConnection({ uplink: mkUplink(), registry: makeBrokerRegistry() })(ws);
    await conn.message(JSON.stringify({ t: "ping" }));
    expect(ws.last()).toEqual({ t: "pong" });
    const before = ws.sent.length;
    await conn.message("{not json");
    expect(ws.sent.length).toBe(before);
  });

  test("per-connection log meta (ip) is merged into every driver log event (forensics)", async () => {
    const events = [];
    const log = (event, fields) => events.push({ event, fields });
    const ws = fakeWs();
    const conn = makeUplinkConnection({ uplink: mkUplink(), registry: makeBrokerRegistry(), log })(ws, { ip: "10.0.0.9" });
    await conn.message(JSON.stringify({ t: "auth", secret: "nope" })); // auth-failed
    expect(events.find((e) => e.event === "broker.auth-failed").fields).toMatchObject({ ip: "10.0.0.9" });
  });

  test("HA: two members share one brokerId — both tracked; closing one leaves the other (S5)", async () => {
    const registry = makeBrokerRegistry();
    const uplink = mkUplink();
    const ws1 = fakeWs();
    const c1 = makeUplinkConnection({ uplink, registry })(ws1);
    await c1.message(JSON.stringify({ t: "auth", secret: "sek-one" }));
    const ws2 = fakeWs();
    const c2 = makeUplinkConnection({ uplink, registry })(ws2);
    await c2.message(JSON.stringify({ t: "auth", secret: "sek-one" }));
    expect(registry.count("b1")).toBe(2);                 // BOTH members registered (not replaced)
    c1.close();                                            // one member drops
    expect(registry.conns("b1")).toEqual([ws2]);          // the other stays (seamless failover)
    c2.close();
    expect(registry.count("b1")).toBe(0);
  });

  test("close removes only THIS connection's ws (idempotent, no cross-removal)", async () => {
    const registry = makeBrokerRegistry();
    const ws = fakeWs();
    const conn = makeUplinkConnection({ uplink: mkUplink(), registry })(ws);
    await conn.message(JSON.stringify({ t: "auth", secret: "sek-one" }));
    conn.close();
    conn.close();                                          // second close is a no-op
    expect(registry.count("b1")).toBe(0);
  });
});

describe("relayEnvelopes (HA — all members)", () => {
  test("relays owned envelopes to EVERY live member; drops unowned", () => {
    const registry = makeBrokerRegistry();
    const ws1 = fakeWs(); const ws2 = fakeWs();
    registry.add("b1", ws1); registry.add("b1", ws2);
    const r = relayEnvelopes({ uplink: mkUplink(), registry }, "b1", [
      { payload: { doorId: "door-a" } }, { payload: { doorId: "door-x" } },
    ]);
    expect(r).toEqual({ connected: true, relayed: 1, rejected: 1, members: 2 });
    const env = { t: "envelope", signed: { payload: { doorId: "door-a" } } };
    expect(ws1.sent).toEqual([env]);
    expect(ws2.sent).toEqual([env]);                       // both members got it
  });
  test("broker not connected → connected:false, nothing relayed", () => {
    const r = relayEnvelopes({ uplink: mkUplink(), registry: makeBrokerRegistry() }, "b1", [{ payload: { doorId: "door-a" } }]);
    expect(r).toEqual({ connected: false, relayed: 0, rejected: 0, members: 0 });
  });
  test("a closed (non-OPEN) member is skipped; a live member still receives", () => {
    const registry = makeBrokerRegistry();
    const dead = fakeWs(); dead.readyState = 3;
    const live = fakeWs();
    registry.add("b1", dead); registry.add("b1", live);
    const r = relayEnvelopes({ uplink: mkUplink(), registry }, "b1", [{ payload: { doorId: "door-a" } }]);
    expect(r).toMatchObject({ connected: true, relayed: 1, members: 1 }); // only the live member counts
    expect(live.sent.length).toBe(1);
    expect(dead.sent.length).toBe(0);
  });
});
