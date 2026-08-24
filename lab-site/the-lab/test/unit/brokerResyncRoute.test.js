// The internal broker-resync route (S2c-2c): 401 without the internal bearer, 400 without brokerId,
// 200 delegating to Service.refreshBrokerEnvelopes scoped to the brokerId.

jest.mock("@/plugins/door-access-controller/service", () => ({
  __esModule: true,
  default: { refreshBrokerEnvelopes: jest.fn(async ({ brokerId }) => ({ pushed: true, brokers: 1, brokerId })) },
}));

import { POST } from "@/app/api/internal/broker-resync/route";
import Service from "@/plugins/door-access-controller/service";

const SECRET = "internal-secret";
const post = (headers, body) => POST(new Request("http://lab.test/api/internal/broker-resync", {
  method: "POST", headers: { "content-type": "application/json", ...headers },
  body: body === undefined ? undefined : JSON.stringify(body),
}));

beforeAll(() => { process.env.INTERNAL_API_SECRET = SECRET; });
beforeEach(() => jest.clearAllMocks());

test("missing/wrong bearer → 401, service not called", async () => {
  expect((await post({}, { brokerId: "b1" })).status).toBe(401);
  expect((await post({ authorization: "Bearer nope" }, { brokerId: "b1" })).status).toBe(401);
  expect(Service.refreshBrokerEnvelopes).not.toHaveBeenCalled();
});

test("authed but no brokerId → 400", async () => {
  expect((await post({ authorization: `Bearer ${SECRET}` }, {})).status).toBe(400);
  expect(Service.refreshBrokerEnvelopes).not.toHaveBeenCalled();
});

test("valid call → 200, delegates scoped to the brokerId", async () => {
  const res = await post({ authorization: `Bearer ${SECRET}` }, { brokerId: "broker-a" });
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ pushed: true, brokerId: "broker-a" });
  expect(Service.refreshBrokerEnvelopes).toHaveBeenCalledWith({ brokerId: "broker-a" });
});

test("service error → 500 (fail-closed, no internal leak)", async () => {
  Service.refreshBrokerEnvelopes.mockRejectedValueOnce(new Error("db boom"));
  const res = await post({ authorization: `Bearer ${SECRET}` }, { brokerId: "broker-a" });
  expect(res.status).toBe(500);
  expect(await res.json()).toEqual({ error: "resync failed" }); // no "db boom" leaked
});
