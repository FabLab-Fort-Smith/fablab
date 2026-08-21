// The authorize route + controller gate: the surface is 404 when the plugin is
// disabled (fail-closed), 401 without a valid INTERNAL_API_SECRET bearer (constant-time),
// 400 on missing fields, and 200 delegating to the service on a valid machine call.

jest.mock("@/auth", () => ({ __esModule: true, auth: jest.fn() })); // controller imports it; avoid loading real NextAuth
jest.mock("@/lib/plugins/guard", () => ({ __esModule: true, requirePluginEnabled: jest.fn() }));
jest.mock("@/plugins/door-access-controller/service", () => ({
  __esModule: true,
  default: { authorize: jest.fn(async () => ({ granted: true, reason: "rule-match", userID: "u1" })) },
}));

import { POST } from "@/app/api/v1/plugins/door-access-controller/authorize/route";
import { requirePluginEnabled } from "@/lib/plugins/guard";
import Service from "@/plugins/door-access-controller/service";

const SECRET = "test-internal-secret";
const notFound = () => new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { "content-type": "application/json" } });

const post = (headers, body) =>
  POST(new Request("http://lab.test/api/v1/plugins/door-access-controller/authorize", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  }));

beforeAll(() => { process.env.INTERNAL_API_SECRET = SECRET; });
beforeEach(() => { jest.clearAllMocks(); requirePluginEnabled.mockResolvedValue(null); });

test("disabled plugin → 404 (surface disappears)", async () => {
  requirePluginEnabled.mockResolvedValueOnce(notFound());
  const res = await post({ authorization: `Bearer ${SECRET}` }, { cardId: "c", doorId: "front" });
  expect(res.status).toBe(404);
  expect(Service.authorize).not.toHaveBeenCalled();
});

test("missing bearer → 401", async () => {
  const res = await post({}, { cardId: "c", doorId: "front" });
  expect(res.status).toBe(401);
  expect(Service.authorize).not.toHaveBeenCalled();
});

test("wrong bearer → 401", async () => {
  const res = await post({ authorization: "Bearer nope" }, { cardId: "c", doorId: "front" });
  expect(res.status).toBe(401);
});

test("missing doorId → 400", async () => {
  const res = await post({ authorization: `Bearer ${SECRET}` }, { cardId: "c" });
  expect(res.status).toBe(400);
});

test("valid machine call → 200, delegates with cardId aliased to credentialValue", async () => {
  const res = await post({ authorization: `Bearer ${SECRET}` }, { cardId: "abc123", doorId: "front" });
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ granted: true, userID: "u1" });
  expect(Service.authorize).toHaveBeenCalledWith(expect.objectContaining({ credentialType: "nfc", credentialValue: "abc123", doorId: "front" }));
});
