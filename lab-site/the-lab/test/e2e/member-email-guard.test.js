// The plugin route guard: a plugin's HTTP surface exists ONLY while enabled.
// Reads the DB (source of truth) and fails CLOSED. Registry + state are mocked.
jest.mock("@/lib/plugins/registry", () => ({ __esModule: true, getPlugin: jest.fn() }));
jest.mock("@/lib/plugins/model", () => ({ __esModule: true, default: { getState: jest.fn() } }));

import { requirePluginEnabled } from "@/lib/plugins/guard";
import { getPlugin } from "@/lib/plugins/registry";
import PluginStateModel from "@/lib/plugins/model";

const KNOWN = { manifest: { id: "member-email", enabledByDefault: false } };

beforeEach(() => {
  jest.clearAllMocks();
  getPlugin.mockReturnValue(KNOWN);
});

test("unknown plugin -> 404", async () => {
  getPlugin.mockReturnValue(undefined);
  const res = await requirePluginEnabled("nope");
  expect(res).not.toBeNull();
  expect(res.status).toBe(404);
});

test("enabled in the DB -> null (proceed)", async () => {
  PluginStateModel.getState.mockResolvedValue({ enabled: true });
  expect(await requirePluginEnabled("member-email")).toBeNull();
});

test("disabled in the DB -> 404", async () => {
  PluginStateModel.getState.mockResolvedValue({ enabled: false });
  expect((await requirePluginEnabled("member-email")).status).toBe(404);
});

test("no state + enabledByDefault false -> 404 (default disabled)", async () => {
  PluginStateModel.getState.mockResolvedValue(null);
  expect((await requirePluginEnabled("member-email")).status).toBe(404);
});

test("fails CLOSED when state can't be read -> 404", async () => {
  PluginStateModel.getState.mockRejectedValue(new Error("db down"));
  expect((await requirePluginEnabled("member-email")).status).toBe(404);
});
