// AD-4 pilot addon — end-to-end wiring through the real registry + hook bus.
// Proves the contact.submitted handler fires ONLY when the addon is enabled in the
// state store, and receives the ID-only payload. The plugin STATE model is mocked
// (no DB); the addon is reduced to a spied module so the assertion is about the
// platform routing, not the addon's own forwarding logic (covered elsewhere).

const onContactSubmitted = jest.fn().mockResolvedValue(undefined);

jest.mock("@/plugins", () => {
  const realManifest = jest.requireActual("@/plugins/contact-submissions/plugin.manifest").default;
  const { CORE_EVENTS } = jest.requireActual("@/lib/plugins/hooks");
  return {
    __esModule: true,
    PLUGINS: [
      {
        manifest: realManifest,
        register(ctx) {
          ctx.on(CORE_EVENTS.CONTACT_SUBMITTED, (payload) => onContactSubmitted(payload));
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

test("DISABLED (default): a contact.submitted emit does NOT reach the handler", async () => {
  listStates.mockResolvedValue({}); // no state row → enabledByDefault (false)
  getState.mockResolvedValue(null);

  await emitEvent(CORE_EVENTS.CONTACT_SUBMITTED, { submissionID: "s1" });

  expect(onContactSubmitted).not.toHaveBeenCalled();
});

test("ENABLED: the handler fires and receives the ID-only payload", async () => {
  listStates.mockResolvedValue({ "contact-submissions": { enabled: true, config: {} } });
  getState.mockResolvedValue({ enabled: true, config: {} });

  await emitEvent(CORE_EVENTS.CONTACT_SUBMITTED, { submissionID: "s2" });

  expect(onContactSubmitted).toHaveBeenCalledTimes(1);
  expect(onContactSubmitted).toHaveBeenCalledWith({ submissionID: "s2" });
  // payload is ID-only — nothing but submissionID rides the bus
  expect(Object.keys(onContactSubmitted.mock.calls[0][0])).toEqual(["submissionID"]);
});
