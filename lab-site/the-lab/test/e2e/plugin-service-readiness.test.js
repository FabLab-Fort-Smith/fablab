// L6: the platform must refuse to enable a plugin whose checkReady() is not ok,
// so an admin can't turn on a feature with its required config missing. Registry
// + state store are mocked; isAdmin is real.
jest.mock("@/lib/plugins/registry", () => ({
  __esModule: true,
  getPlugin: jest.fn(),
  applyEnable: jest.fn(),
  applyDisable: jest.fn(),
  applyConfig: jest.fn(),
  ensurePluginsInit: jest.fn(),
  listPlugins: jest.fn(() => []),
}));
jest.mock("@/lib/plugins/model", () => ({
  __esModule: true,
  default: { setEnabled: jest.fn(), setConfig: jest.fn(), getState: jest.fn(), listStates: jest.fn(() => ({})) },
}));

import PluginService from "@/lib/plugins/service";
import { getPlugin } from "@/lib/plugins/registry";
import PluginStateModel from "@/lib/plugins/model";

const ADMIN = { userID: "admin-1", role: "admin" };
const withReady = (ready) => ({ manifest: { id: "member-email" }, module: { checkReady: () => ready } });

beforeEach(() => jest.clearAllMocks());

test("enable is refused (400) and NOT persisted when checkReady is not ok", async () => {
  getPlugin.mockReturnValue(withReady({ ok: false, reason: "PURELYMAIL_* not set" }));
  await expect(PluginService.setEnabled("member-email", true, ADMIN)).rejects.toMatchObject({ status: 400 });
  expect(PluginStateModel.setEnabled).not.toHaveBeenCalled();
});

test("enable proceeds when checkReady is ok", async () => {
  getPlugin.mockReturnValue(withReady({ ok: true }));
  await PluginService.setEnabled("member-email", true, ADMIN);
  expect(PluginStateModel.setEnabled).toHaveBeenCalledWith("member-email", true, "admin-1");
});

test("disabling never runs the readiness check", async () => {
  getPlugin.mockReturnValue(withReady({ ok: false }));
  await PluginService.setEnabled("member-email", false, ADMIN);
  expect(PluginStateModel.setEnabled).toHaveBeenCalledWith("member-email", false, "admin-1");
});

test("a non-admin still can't enable (403 before any readiness/persist)", async () => {
  getPlugin.mockReturnValue(withReady({ ok: true }));
  await expect(PluginService.setEnabled("member-email", true, { userID: "u", role: "user" })).rejects.toMatchObject({ status: 403 });
  expect(PluginStateModel.setEnabled).not.toHaveBeenCalled();
});
