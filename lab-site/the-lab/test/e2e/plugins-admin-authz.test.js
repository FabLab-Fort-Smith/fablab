// Authz + error-mapping for the admin plugin-management edge. Drives the
// controller with auth + the platform service mocked. Anonymous callers are
// rejected before the service; service authz errors map to the right status.
jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/plugins/service", () => ({
  __esModule: true,
  default: { listPlugins: jest.fn(), setEnabled: jest.fn(), setConfig: jest.fn() },
}));

import { auth } from "@/auth";
import PluginController from "@/app/api/v1/admin/plugins/controller";
import PluginService from "@/lib/plugins/service";

const ANON = null;
const USER = { user: { userID: "u1", role: "user" } };
const ADMIN = { user: { userID: "admin-1", role: "admin" } };
const req = (body) => new Request("http://x/api/v1/admin/plugins", {
  method: "PATCH", headers: new Headers({ "content-type": "application/json" }),
  body: JSON.stringify(body),
});

beforeEach(() => {
  jest.clearAllMocks();
  PluginService.listPlugins.mockResolvedValue([]);
  PluginService.setEnabled.mockResolvedValue({ id: "member-email", enabled: true });
  PluginService.setConfig.mockResolvedValue({ id: "member-email", config: {} });
});

test("REGRESSION: anonymous list -> 401, service not called", async () => {
  auth.mockResolvedValue(ANON);
  expect((await PluginController.list()).status).toBe(401);
  expect(PluginService.listPlugins).not.toHaveBeenCalled();
});

test("authenticated list passes the actor to the service", async () => {
  auth.mockResolvedValue(ADMIN);
  const res = await PluginController.list();
  expect(res.status).toBe(200);
  expect(PluginService.listPlugins).toHaveBeenCalledWith({ userID: "admin-1", role: "admin" });
});

test("PATCH without a boolean 'enabled' -> 400", async () => {
  auth.mockResolvedValue(ADMIN);
  expect((await PluginController.setEnabled(req({ pluginId: "member-email" }))).status).toBe(400);
});

test("a non-admin actor is rejected 403 by the service (mapped by the controller)", async () => {
  auth.mockResolvedValue(USER);
  const e = new Error("Forbidden"); e.status = 403;
  PluginService.setEnabled.mockRejectedValue(e);
  expect((await PluginController.setEnabled(req({ pluginId: "member-email", enabled: true }))).status).toBe(403);
});

test("unknown plugin -> 404 from the service", async () => {
  auth.mockResolvedValue(ADMIN);
  const e = new Error('Unknown plugin "nope"'); e.status = 404;
  PluginService.setEnabled.mockRejectedValue(e);
  expect((await PluginController.setEnabled(req({ pluginId: "nope", enabled: true }))).status).toBe(404);
});

test("internal errors are not leaked (generic 500)", async () => {
  auth.mockResolvedValue(ADMIN);
  PluginService.setEnabled.mockRejectedValue(new Error("mongo exploded at host db-1"));
  const res = await PluginController.setEnabled(req({ pluginId: "member-email", enabled: true }));
  expect(res.status).toBe(500);
  expect((await res.json()).error).toBe("An unexpected error occurred.");
});
