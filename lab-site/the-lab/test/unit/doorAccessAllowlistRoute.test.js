// The allowlist refresh route + controller gate: 404 when disabled, 401 without the internal
// bearer, 200 delegating to the service on a valid machine call.

jest.mock("@/lib/plugins/guard", () => ({ __esModule: true, requirePluginEnabled: jest.fn() }));
jest.mock("@/plugins/door-access-controller/service", () => ({
  __esModule: true,
  default: { refreshAllowlist: jest.fn(async () => ({ pushed: true, entries: 3 })) },
}));

import { POST } from "@/app/api/v1/plugins/door-access-controller/allowlist/refresh/route";
import { requirePluginEnabled } from "@/lib/plugins/guard";
import Service from "@/plugins/door-access-controller/service";

const SECRET = "allowlist-refresh-secret";
const notFound = () => new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { "content-type": "application/json" } });
const post = (headers) => POST(new Request("http://lab.test/api/v1/plugins/door-access-controller/allowlist/refresh", { method: "POST", headers }));

beforeAll(() => { process.env.INTERNAL_API_SECRET = SECRET; });
beforeEach(() => { jest.clearAllMocks(); requirePluginEnabled.mockResolvedValue(null); });

test("disabled plugin → 404", async () => {
  requirePluginEnabled.mockResolvedValueOnce(notFound());
  expect((await post({ authorization: `Bearer ${SECRET}` })).status).toBe(404);
  expect(Service.refreshAllowlist).not.toHaveBeenCalled();
});

test("missing/wrong bearer → 401", async () => {
  expect((await post({})).status).toBe(401);
  expect((await post({ authorization: "Bearer nope" })).status).toBe(401);
  expect(Service.refreshAllowlist).not.toHaveBeenCalled();
});

test("valid machine call → 200, delegates to refreshAllowlist", async () => {
  const res = await post({ authorization: `Bearer ${SECRET}` });
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ pushed: true, entries: 3 });
  expect(Service.refreshAllowlist).toHaveBeenCalled();
});
