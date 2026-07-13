// M2 regression: hooks must reach a plugin enabled in the DB even if THIS
// instance booted with it disabled. reconcile() (called by emitEvent before each
// emit) wires/unwires against the DB. Uses a fake plugin + mocked state store.
jest.mock("@/plugins", () => ({
  __esModule: true,
  PLUGINS: [
    {
      manifest: {
        id: "fakeplug",
        name: "Fake Plugin",
        version: "1.0.0",
        sockets: { hooks: ["member.deleted"] },
        enabledByDefault: false,
      },
      register: jest.fn(),
    },
  ],
}));
jest.mock("@/lib/plugins/model", () => ({
  __esModule: true,
  getState: jest.fn(),
  listStates: jest.fn(),
  default: { getState: jest.fn(), listStates: jest.fn() },
}));

import * as registry from "@/lib/plugins/registry";
import { listStates } from "@/lib/plugins/model";
import { PLUGINS } from "@/plugins";
import { _resetHooks } from "@/lib/plugins/hooks";

const fake = PLUGINS[0];

beforeEach(() => {
  jest.clearAllMocks();
  registry._resetRegistry();
  _resetHooks();
});

test("reconcile wires a plugin that was enabled in the DB after a disabled boot", async () => {
  listStates.mockResolvedValue({}); // boot: nothing enabled
  await registry.ensurePluginsInit();
  expect(fake.register).not.toHaveBeenCalled();

  listStates.mockResolvedValue({ fakeplug: { enabled: true, config: {} } }); // enabled elsewhere
  await registry.reconcile();
  expect(fake.register).toHaveBeenCalledTimes(1); // now wired on this instance
  expect(registry.isEnabled("fakeplug")).toBe(true);
});

test("reconcile unwires a plugin disabled elsewhere, and re-wires if re-enabled", async () => {
  listStates.mockResolvedValue({ fakeplug: { enabled: true, config: {} } });
  await registry.ensurePluginsInit(); // wired at boot
  expect(fake.register).toHaveBeenCalledTimes(1);

  listStates.mockResolvedValue({ fakeplug: { enabled: false } });
  await registry.reconcile();
  expect(registry.isEnabled("fakeplug")).toBe(false);

  listStates.mockResolvedValue({ fakeplug: { enabled: true, config: {} } });
  await registry.reconcile();
  expect(fake.register).toHaveBeenCalledTimes(2); // re-wired
});

test("emitEvent reconciles then dispatches without throwing", async () => {
  listStates.mockResolvedValue({ fakeplug: { enabled: true, config: {} } });
  await expect(registry.emitEvent("member.deleted", { userID: "u1" })).resolves.toBeUndefined();
});
