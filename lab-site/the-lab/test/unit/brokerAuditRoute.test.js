// The internal broker-audit route (S6-b1): 401 without the internal bearer, 400 without edgeId/records,
// 200 delegating to Service.ingestEdgeAudit, 409 on a CAS conflict, 500 with no internal leak.

jest.mock("@/plugins/door-access-controller/service", () => ({
  __esModule: true,
  default: { ingestEdgeAudit: jest.fn(async () => ({ accepted: 1, duplicates: 0, alerts: [] })) },
}));

import { POST } from "@/app/api/internal/broker-audit/route";
import Service from "@/plugins/door-access-controller/service";

const SECRET = "internal-secret";
const post = (headers, body) => POST(new Request("http://lab.test/api/internal/broker-audit", {
  method: "POST", headers: { "content-type": "application/json", ...headers },
  body: body === undefined ? undefined : JSON.stringify(body),
}));
const REC = [{ prev: "", bootEpoch: "b", seq: 0, ts: 1, event: {}, hash: "h" }];
const SIG = "edge-batch-signature-b64";

beforeAll(() => { process.env.INTERNAL_API_SECRET = SECRET; });
beforeEach(() => jest.clearAllMocks());

test("missing/wrong bearer → 401, service not called", async () => {
  expect((await post({}, { edgeId: "e", records: REC })).status).toBe(401);
  expect((await post({ authorization: "Bearer nope" }, { edgeId: "e", records: REC })).status).toBe(401);
  expect(Service.ingestEdgeAudit).not.toHaveBeenCalled();
});

test("authed but missing edgeId or records → 400", async () => {
  expect((await post({ authorization: `Bearer ${SECRET}` }, { records: REC })).status).toBe(400);
  expect((await post({ authorization: `Bearer ${SECRET}` }, { edgeId: "e" })).status).toBe(400);
  expect(Service.ingestEdgeAudit).not.toHaveBeenCalled();
});

test("valid call → 200, delegates to the service (edgeId, records, signature passed through)", async () => {
  const res = await post({ authorization: `Bearer ${SECRET}` }, { edgeId: "edge-1", records: REC, signature: SIG });
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ accepted: 1 });
  expect(Service.ingestEdgeAudit).toHaveBeenCalledWith({ edgeId: "edge-1", records: REC, signature: SIG });
});

test("a non-string signature is passed as null (service enforces the auth, fail-closed)", async () => {
  await post({ authorization: `Bearer ${SECRET}` }, { edgeId: "edge-1", records: REC, signature: 123 });
  expect(Service.ingestEdgeAudit).toHaveBeenCalledWith({ edgeId: "edge-1", records: REC, signature: null });
});

test("an accepted batch carrying tamper alerts is still 200 (alerts surfaced, not an HTTP error)", async () => {
  Service.ingestEdgeAudit.mockResolvedValueOnce({ accepted: 0, duplicates: 0, alerts: [{ type: "tamper", reason: "bad-hash", seq: 0 }] });
  const res = await post({ authorization: `Bearer ${SECRET}` }, { edgeId: "e", records: REC });
  expect(res.status).toBe(200);
  expect((await res.json()).alerts[0].type).toBe("tamper");
});

test("a boundary rejection → 400", async () => {
  Service.ingestEdgeAudit.mockResolvedValueOnce({ accepted: 0, duplicates: 0, alerts: [], rejected: "malformed-record" });
  expect((await post({ authorization: `Bearer ${SECRET}` }, { edgeId: "e", records: REC })).status).toBe(400);
});

test("a CAS conflict → 409 (caller may retry)", async () => {
  Service.ingestEdgeAudit.mockResolvedValueOnce({ accepted: 0, duplicates: 0, alerts: [], rejected: "conflict" });
  expect((await post({ authorization: `Bearer ${SECRET}` }, { edgeId: "e", records: REC })).status).toBe(409);
});

test("service error → 500 (fail-closed, no internal leak)", async () => {
  Service.ingestEdgeAudit.mockRejectedValueOnce(new Error("db boom"));
  const res = await post({ authorization: `Bearer ${SECRET}` }, { edgeId: "e", records: REC });
  expect(res.status).toBe(500);
  expect(await res.json()).toEqual({ error: "audit ingest failed" }); // no "db boom" leaked
});
