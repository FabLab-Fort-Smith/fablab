// vps/lib/brokerHealth.js (S2c-3 #6) — the loopback-only broker health payload + server.

import { healthPayload, startHealthServer } from "../../vps/lib/brokerHealth.js";

describe("healthPayload (pure)", () => {
  test("ready + uplink up", () => {
    expect(healthPayload({ ready: true, uplinkUp: true, doors: 3 }))
      .toEqual({ status: "ok", ready: true, uplink: "up", doors: 3 });
  });
  test("ready but uplink down still reports ready (offline fallback serves)", () => {
    expect(healthPayload({ ready: true, uplinkUp: false, doors: 1 }))
      .toEqual({ status: "ok", ready: true, uplink: "down", doors: 1 });
  });
  test("not ready → not-ok, defaults are safe", () => {
    expect(healthPayload()).toEqual({ status: "not-ready", ready: false, uplink: "down", doors: 0 });
    expect(healthPayload({ ready: false })).toMatchObject({ ready: false, status: "not-ready" });
  });
  test("carries no secrets — only status/ready/uplink/doors keys", () => {
    expect(Object.keys(healthPayload({ ready: true }))).toEqual(["status", "ready", "uplink", "doors"]);
  });
});

describe("startHealthServer (loopback)", () => {
  let server;
  afterEach(() => new Promise((r) => (server ? server.close(r) : r())));

  function get(port) {
    return fetch(`http://127.0.0.1:${port}/`).then(async (r) => ({ status: r.status, body: await r.json() }));
  }
  async function listen(getStatus) {
    server = startHealthServer(getStatus, { port: 0 }); // ephemeral
    await new Promise((r) => server.on("listening", r));
    return server.address().port;
  }

  test("binds 127.0.0.1 only (not the LAN/0.0.0.0)", async () => {
    await listen(() => ({ ready: true }));
    expect(server.address().address).toBe("127.0.0.1");
  });
  test("200 when ready, with the payload", async () => {
    const port = await listen(() => ({ ready: true, uplinkUp: true, doors: 2 }));
    const { status, body } = await get(port);
    expect(status).toBe(200);
    expect(body).toMatchObject({ status: "ok", uplink: "up", doors: 2 });
  });
  test("503 when not ready (orchestrator gates traffic)", async () => {
    const port = await listen(() => ({ ready: false }));
    expect((await get(port)).status).toBe(503);
  });
  test("a throwing getStatus fails closed to 503, doesn't crash", async () => {
    const port = await listen(() => { throw new Error("boom"); });
    expect((await get(port)).status).toBe(503);
  });
});
