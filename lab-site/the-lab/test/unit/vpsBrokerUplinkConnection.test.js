// vps/lib/brokerUplink.js connection driver + relay (S2c-2 glue), tested with a fake ws — no express,
// no real sockets. Covers the per-connection state machine (authn-before-act, wrong-bearer-closes,
// registry lifecycle) and relayEnvelopes (owned-door scope, not-connected, dead-socket).

import { makeBrokerUplink, makeUplinkConnection, relayEnvelopes } from "../../vps/lib/brokerUplink.js";

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
    const brokers = new Map();
    const ws = fakeWs();
    const conn = makeUplinkConnection({ uplink: mkUplink(), brokers })(ws);
    await conn.message(JSON.stringify({ t: "auth", secret: "sek-one" }));
    expect(ws.last()).toEqual({ t: "auth_result", ok: true });
    expect(brokers.get("b1")).toBe(ws);
    expect(conn.brokerId()).toBe("b1");
  });

  test("auth with a wrong bearer → ok:false AND the socket is closed (deny-by-default)", async () => {
    const brokers = new Map();
    const ws = fakeWs();
    const conn = makeUplinkConnection({ uplink: mkUplink(), brokers })(ws);
    await conn.message(JSON.stringify({ t: "auth", secret: "nope" }));
    expect(ws.last()).toEqual({ t: "auth_result", ok: false });
    expect(ws.closed).toBe(true);
    expect(brokers.size).toBe(0);
  });

  test("authz BEFORE auth is denied and never touches the door (authn-before-act)", async () => {
    const brokers = new Map();
    let scanCalls = 0;
    const uplink = mkUplink({ authorizeScan: async () => { scanCalls++; return { granted: true }; } });
    const ws = fakeWs();
    const conn = makeUplinkConnection({ uplink, brokers })(ws);
    await conn.message(JSON.stringify({ t: "authz", id: 1, doorId: "door-a", code: "c" }));
    expect(ws.last()).toMatchObject({ t: "authz_result", id: 1, granted: false, reason: "UNAUTHENTICATED" });
    expect(scanCalls).toBe(0);
  });

  test("after auth, authz for an owned door proxies; an unowned door is denied", async () => {
    const brokers = new Map();
    const ws = fakeWs();
    const conn = makeUplinkConnection({ uplink: mkUplink(), brokers })(ws);
    await conn.message(JSON.stringify({ t: "auth", secret: "sek-one" }));
    await conn.message(JSON.stringify({ t: "authz", id: 2, doorId: "door-z", code: "c" })); // b2's door
    expect(ws.last()).toMatchObject({ id: 2, granted: false, reason: "DOOR_NOT_OWNED" });
    await conn.message(JSON.stringify({ t: "authz", id: 3, doorId: "door-a", code: "c" }));
    expect(ws.last()).toMatchObject({ id: 3, granted: true });
  });

  test("ping → pong; malformed JSON ignored", async () => {
    const ws = fakeWs();
    const conn = makeUplinkConnection({ uplink: mkUplink(), brokers: new Map() })(ws);
    await conn.message(JSON.stringify({ t: "ping" }));
    expect(ws.last()).toEqual({ t: "pong" });
    const before = ws.sent.length;
    await conn.message("{not json");
    expect(ws.sent.length).toBe(before);
  });

  test("close removes only this connection's entry (a newer conn for the same broker isn't evicted)", async () => {
    const brokers = new Map();
    const uplink = mkUplink();
    const ws1 = fakeWs();
    const c1 = makeUplinkConnection({ uplink, brokers })(ws1);
    await c1.message(JSON.stringify({ t: "auth", secret: "sek-one" }));
    const ws2 = fakeWs();
    const c2 = makeUplinkConnection({ uplink, brokers })(ws2);
    await c2.message(JSON.stringify({ t: "auth", secret: "sek-one" })); // replaces ws1 in the registry
    expect(brokers.get("b1")).toBe(ws2);
    c1.close(); // stale connection closing must NOT evict the live ws2
    expect(brokers.get("b1")).toBe(ws2);
    c2.close();
    expect(brokers.has("b1")).toBe(false);
  });
});

describe("relayEnvelopes", () => {
  test("relays owned envelopes, drops unowned, to a connected broker", () => {
    const brokers = new Map();
    const ws = fakeWs();
    brokers.set("b1", ws);
    const r = relayEnvelopes({ uplink: mkUplink(), brokers }, "b1", [
      { payload: { doorId: "door-a" } }, { payload: { doorId: "door-x" } },
    ]);
    expect(r).toEqual({ connected: true, relayed: 1, rejected: 1 });
    expect(ws.sent).toEqual([{ t: "envelope", signed: { payload: { doorId: "door-a" } } }]);
  });
  test("broker not connected → connected:false, nothing relayed", () => {
    const r = relayEnvelopes({ uplink: mkUplink(), brokers: new Map() }, "b1", [{ payload: { doorId: "door-a" } }]);
    expect(r).toEqual({ connected: false, relayed: 0, rejected: 0 });
  });
  test("a closed (non-OPEN) socket counts as not connected", () => {
    const ws = fakeWs(); ws.readyState = 3;
    const brokers = new Map([["b1", ws]]);
    const r = relayEnvelopes({ uplink: mkUplink(), brokers }, "b1", [{ payload: { doorId: "door-a" } }]);
    expect(r.connected).toBe(false);
  });
});
