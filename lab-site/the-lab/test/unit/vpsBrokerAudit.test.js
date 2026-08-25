// vps/lib/brokerAudit.js — the socket-server → app fetch caller for the edge audit relay (S6-b-c1).
// Maps HTTP → the tri-state verdict, fail-secure toward "deferred" (the edge keeps the batch), and
// never logs the secret / records / signature.

import { makeRequestBrokerAudit } from "../../vps/lib/brokerAudit.js";

const ENV = { APP_INTERNAL_URL: "http://app.internal", INTERNAL_API_SECRET: "s3cr3t" };
const REC = [{ prev: "", bootEpoch: "b", seq: 0, ts: 1, event: {}, hash: "h" }];
const BATCH = { edgeId: "front-01", records: REC, signature: "sig" };
const res = (status) => ({ ok: status >= 200 && status < 300, status });

test("POSTs to /api/internal/broker-audit with the bearer + full batch body", async () => {
  let call = null;
  const fetchImpl = async (url, opts) => { call = { url, opts }; return res(200); };
  const audit = makeRequestBrokerAudit({ env: ENV, fetchImpl });
  expect(await audit(BATCH)).toBe("accepted");
  expect(call.url).toBe("http://app.internal/api/internal/broker-audit");
  expect(call.opts.headers.authorization).toBe("Bearer s3cr3t");
  expect(JSON.parse(call.opts.body)).toEqual(BATCH); // edgeId + records + signature forwarded
});

test("HTTP → verdict mapping: 200→accepted, 400→rejected, 409/5xx→deferred", async () => {
  const at = (status) => makeRequestBrokerAudit({ env: ENV, fetchImpl: async () => res(status) })(BATCH);
  expect(await at(200)).toBe("accepted");
  expect(await at(400)).toBe("rejected"); // bad-signature / unregistered / malformed — retry won't help
  expect(await at(409)).toBe("deferred"); // CAS conflict — retry
  expect(await at(500)).toBe("deferred");
  expect(await at(503)).toBe("deferred");
});

test("network error / timeout / null response → deferred (never throws, edge keeps the batch)", async () => {
  expect(await makeRequestBrokerAudit({ env: ENV, fetchImpl: async () => { throw new Error("ECONNREFUSED"); } })(BATCH)).toBe("deferred");
  expect(await makeRequestBrokerAudit({ env: ENV, fetchImpl: async () => null })(BATCH)).toBe("deferred");
});

test("not configured / empty batch / missing signature → deferred, no fetch", async () => {
  const fetchImpl = jest.fn(async () => res(200));
  expect(await makeRequestBrokerAudit({ env: {}, fetchImpl })(BATCH)).toBe("deferred"); // no URL/secret
  expect(await makeRequestBrokerAudit({ env: ENV, fetchImpl })({ edgeId: "e", records: [], signature: "s" })).toBe("deferred");
  expect(await makeRequestBrokerAudit({ env: ENV, fetchImpl })({ edgeId: "e", records: REC })).toBe("deferred"); // no sig
  expect(fetchImpl).not.toHaveBeenCalled();
});

test("never logs the secret, records, or signature", async () => {
  const lines = [];
  const log = (event, fields) => lines.push({ event, fields });
  const audit = makeRequestBrokerAudit({ env: ENV, fetchImpl: async () => res(400), log });
  await audit(BATCH);
  const dump = JSON.stringify(lines);
  expect(dump).not.toContain("s3cr3t");
  expect(dump).not.toContain("sig");
  expect(dump).not.toContain("hash");
  expect(lines.some((l) => l.fields && l.fields.edgeId === "front-01")).toBe(true); // edgeId+status is fine
});
