// Parallel-run / cutover helper: shadow-evaluates the addon policy against the user the
// LIVE path resolved, logs agree/diverge, and only reports authoritative when the cutover
// flag is set. Must NEVER throw. Registry/config/model/audit mocked; policy is real.

jest.mock("@/plugins/door-access-controller/model", () => ({ __esModule: true, default: { getPolicyDoc: jest.fn(), findDoor: jest.fn(), deleteCardsByUserID: jest.fn(), upsertCard: jest.fn() } }));
jest.mock("@/plugins/door-access-controller/config", () => ({ __esModule: true, PLUGIN_ID: "door-access-controller", resolveConfig: jest.fn() }));
jest.mock("@/lib/plugins/registry", () => ({ __esModule: true, getPlugin: jest.fn() }));
jest.mock("@/lib/plugins/model", () => ({ __esModule: true, default: { getState: jest.fn() } }));
jest.mock("@/lib/audit", () => ({ __esModule: true, auditLog: jest.fn() }));

import { shadowCompare, enrollIfEnabled } from "@/plugins/door-access-controller/parallelRun";
import Model from "@/plugins/door-access-controller/model";
import { resolveConfig } from "@/plugins/door-access-controller/config";
import { getPlugin } from "@/lib/plugins/registry";
import PluginStateModel from "@/lib/plugins/model";
import { auditLog } from "@/lib/audit";

const WED_2PM = new Date("2026-08-19T19:00:00Z");
const MEMBER_RULE = { id: "member-hours", roles: ["member"], doors: ["*"], windows: [{ days: [1, 2, 3, 4, 5], start: "09:00", end: "17:00" }] };
const activeUser = { userID: "u1", role: "member", membership: { type: "co-op", status: "active", subscriptionStatus: "ACTIVE" } };

const enable = (on) => {
  getPlugin.mockReturnValue({ manifest: { id: "door-access-controller", enabledByDefault: false } });
  PluginStateModel.getState.mockResolvedValue({ enabled: on });
};

beforeAll(() => {
  process.env.DOOR_CARD_ENC_KEY = "pr-test-enc-key";
  process.env.DOOR_CARD_INDEX_KEY = "pr-test-index-key";
});
beforeEach(() => {
  jest.clearAllMocks();
  enable(true);
  resolveConfig.mockResolvedValue({ requireGoodStanding: true, allowAdminBypass: true, defaultTimezone: "America/Chicago", authoritative: false });
  Model.getPolicyDoc.mockResolvedValue({ rules: [MEMBER_RULE], accountOverrides: {} });
  Model.findDoor.mockResolvedValue(null);
  Model.deleteCardsByUserID.mockResolvedValue();
  Model.upsertCard.mockResolvedValue();
});

test("addon disabled → does not run", async () => {
  enable(false);
  const r = await shadowCompare({ user: activeUser, doorId: "front", liveGranted: true, now: WED_2PM });
  expect(r).toEqual({ ran: false });
  expect(auditLog).not.toHaveBeenCalled();
});

test("agreement is logged, not authoritative by default", async () => {
  const r = await shadowCompare({ user: activeUser, doorId: "front", liveGranted: true, now: WED_2PM });
  expect(r).toMatchObject({ ran: true, authoritative: false, granted: true });
  expect(auditLog).toHaveBeenCalledWith("door-access.shadow", expect.objectContaining({ outcome: "agree", live: true, addon: true }));
});

test("divergence is logged (live grants, addon denies with no matching rule)", async () => {
  Model.getPolicyDoc.mockResolvedValue({ rules: [], accountOverrides: {} });
  const r = await shadowCompare({ user: activeUser, doorId: "front", liveGranted: true, now: WED_2PM });
  expect(r).toMatchObject({ ran: true, granted: false });
  expect(auditLog).toHaveBeenCalledWith("door-access.shadow", expect.objectContaining({ outcome: "diverged", live: true, addon: false }));
});

test("authoritative flag flips cutover on", async () => {
  resolveConfig.mockResolvedValue({ requireGoodStanding: true, allowAdminBypass: true, defaultTimezone: "America/Chicago", authoritative: true });
  const r = await shadowCompare({ user: activeUser, doorId: "front", liveGranted: false, now: WED_2PM });
  expect(r).toMatchObject({ ran: true, authoritative: true, granted: true });
});

test("null user → unknown-user deny (still ran)", async () => {
  const r = await shadowCompare({ user: null, doorId: "front", liveGranted: false, now: WED_2PM });
  expect(r).toMatchObject({ ran: true, granted: false, reason: "unknown-user" });
});

test("NEVER throws — an internal error is swallowed + audited as error", async () => {
  Model.getPolicyDoc.mockRejectedValue(new Error("db down"));
  const r = await shadowCompare({ user: activeUser, doorId: "front", liveGranted: true, now: WED_2PM });
  expect(r).toEqual({ ran: false });
  expect(auditLog).toHaveBeenCalledWith("door-access.shadow", expect.objectContaining({ outcome: "error" }));
});

describe("enrollIfEnabled (migration coexistence)", () => {
  test("skips when the addon is disabled", async () => {
    enable(false);
    const r = await enrollIfEnabled({ userID: "u1", code: "c" });
    expect(r).toEqual({ ran: false });
    expect(Model.upsertCard).not.toHaveBeenCalled();
  });

  test("enrolls the encrypted card when enabled", async () => {
    const r = await enrollIfEnabled({ userID: "u1", code: "CARD-1" });
    expect(r).toEqual({ ran: true });
    expect(Model.deleteCardsByUserID).toHaveBeenCalledWith("u1");
    const doc = Model.upsertCard.mock.calls[0][0];
    expect(doc.userID).toBe("u1");
    expect(JSON.stringify(doc)).not.toContain("CARD-1"); // raw code never stored
  });

  test("never throws — a model failure is swallowed + audited", async () => {
    Model.upsertCard.mockRejectedValue(new Error("write fail"));
    const r = await enrollIfEnabled({ userID: "u1", code: "c" });
    expect(r).toEqual({ ran: false });
    expect(auditLog).toHaveBeenCalledWith("door-access.enroll", expect.objectContaining({ outcome: "error" }));
  });
});
