// AD-5 pilot addon — end-to-end wiring through the real registry + hook bus. Proves
// the repair.created / repair.updated handlers fire ONLY when the addon is enabled
// in the state store, and receive the ID-only payload. The plugin STATE model is
// mocked (no DB); the addon is reduced to a spied module so the assertion is about
// the platform routing, not the addon's own notify logic (covered elsewhere).

const onRepairEvent = jest.fn().mockResolvedValue(undefined);

jest.mock("@/plugins", () => {
  const realManifest = jest.requireActual("@/plugins/repair-notifications/plugin.manifest").default;
  const { CORE_EVENTS } = jest.requireActual("@/lib/plugins/hooks");
  return {
    __esModule: true,
    PLUGINS: [
      {
        manifest: realManifest,
        register(ctx) {
          ctx.on(CORE_EVENTS.REPAIR_CREATED, (payload) => onRepairEvent(payload));
          ctx.on(CORE_EVENTS.REPAIR_UPDATED, (payload) => onRepairEvent(payload));
        },
      },
    ],
  };
});

// State store (enabled/config source of truth) — mocked, no DB.
const listStates = jest.fn();
const getState = jest.fn();
jest.mock("@/lib/plugins/model", () => ({
  __esModule: true,
  getState: (...a) => getState(...a),
  listStates: (...a) => listStates(...a),
  default: {},
}));

import { emitEvent, _resetRegistry } from "@/lib/plugins/registry";
import { _resetHooks } from "@/lib/plugins/hooks";
import { CORE_EVENTS } from "@/lib/plugins/hooks";

beforeEach(() => {
  jest.clearAllMocks();
  _resetRegistry();
  _resetHooks();
});

test("DISABLED (default): a repair emit does NOT reach the handler", async () => {
  listStates.mockResolvedValue({}); // no state row → enabledByDefault (false)
  getState.mockResolvedValue(null);

  await emitEvent(CORE_EVENTS.REPAIR_CREATED, { repairID: "repair-1" });
  await emitEvent(CORE_EVENTS.REPAIR_UPDATED, { repairID: "repair-1", status: "completed" });

  expect(onRepairEvent).not.toHaveBeenCalled();
});

test("ENABLED: both handlers fire and receive the ID-only payload", async () => {
  listStates.mockResolvedValue({ "repair-notifications": { enabled: true, config: {} } });
  getState.mockResolvedValue({ enabled: true, config: {} });

  await emitEvent(CORE_EVENTS.REPAIR_CREATED, { repairID: "repair-2" });
  await emitEvent(CORE_EVENTS.REPAIR_UPDATED, { repairID: "repair-2", status: "completed" });

  expect(onRepairEvent).toHaveBeenCalledTimes(2);
  expect(onRepairEvent).toHaveBeenNthCalledWith(1, { repairID: "repair-2" });
  expect(onRepairEvent).toHaveBeenNthCalledWith(2, { repairID: "repair-2", status: "completed" });
  // payloads are ID-only — nothing but repairID (+ status enum) rides the bus
  expect(Object.keys(onRepairEvent.mock.calls[0][0])).toEqual(["repairID"]);
  expect(Object.keys(onRepairEvent.mock.calls[1][0])).toEqual(["repairID", "status"]);
});
