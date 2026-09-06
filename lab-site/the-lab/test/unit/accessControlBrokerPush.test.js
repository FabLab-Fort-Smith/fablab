// pushBrokerEnvelopes (S2c-2b transport): bearer + URL + a bounded timeout (L1), and the 503
// (broker-not-connected) vs ok vs failure handling. global.fetch is stubbed.

import { pushBrokerEnvelopes } from "@/lib/access-control";

const ENV = { url: "http://socket.test", secret: "api-sek" };
let calls;
beforeEach(() => {
  process.env.ACCESS_CONTROL_API_URL = ENV.url;
  process.env.SOCKET_API_SECRET = ENV.secret;
  calls = [];
  global.fetch = jest.fn(async (url, opts) => {
    calls.push({ url, opts });
    return { ok: true, status: 200, json: async () => ({ relayed: 2, rejected: 1 }) };
  });
});

test("POSTs the batch to the broker relay with bearer + a timeout signal (L1)", async () => {
  const r = await pushBrokerEnvelopes("broker-a", [{ payload: { doorId: "front" } }]);
  expect(r).toEqual({ connected: true, relayed: 2, rejected: 1 });
  expect(calls).toHaveLength(1);
  const { url, opts } = calls[0];
  expect(url).toBe("http://socket.test/api/v2/broker/broker-a/envelopes");
  expect(opts.method).toBe("POST");
  expect(opts.headers.Authorization).toBe("Bearer api-sek");
  expect(opts.signal).toBeInstanceOf(AbortSignal); // bounded (topic-reliability)
});

test("brokerId is URL-encoded (path-injection safe)", async () => {
  await pushBrokerEnvelopes("a/../b", []);
  expect(calls[0].url).toBe("http://socket.test/api/v2/broker/a%2F..%2Fb/envelopes");
});

test("503 → connected:false (broker offline, not an error)", async () => {
  global.fetch = jest.fn(async () => ({ ok: false, status: 503, json: async () => ({ rejected: 0 }) }));
  const r = await pushBrokerEnvelopes("broker-a", []);
  expect(r).toEqual({ connected: false, relayed: 0, rejected: 0 });
});

test("a non-503 failure throws", async () => {
  global.fetch = jest.fn(async () => ({ ok: false, status: 500, json: async () => ({ error: "boom" }) }));
  await expect(pushBrokerEnvelopes("broker-a", [])).rejects.toThrow("boom");
});

test("missing brokerId throws before any fetch", async () => {
  await expect(pushBrokerEnvelopes("", [])).rejects.toThrow(/brokerId/);
});
