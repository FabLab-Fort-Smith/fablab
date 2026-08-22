// The retire helpers in parallelRun: authoritativeDecision (post-cutover, addon resolves the
// credential itself; fails CLOSED on error) and plaintextRetired (the write-side retire flag).

jest.mock("@/plugins/door-access-controller/service", () => ({ __esModule: true, default: { authorize: jest.fn() } }));
jest.mock("@/plugins/door-access-controller/config", () => ({ __esModule: true, PLUGIN_ID: "door-access-controller", resolveConfig: jest.fn() }));
jest.mock("@/lib/plugins/registry", () => ({ __esModule: true, getPlugin: jest.fn() }));
jest.mock("@/lib/plugins/model", () => ({ __esModule: true, default: { getState: jest.fn() } }));
jest.mock("@/lib/audit", () => ({ __esModule: true, auditLog: jest.fn() }));

import { authoritativeDecision, plaintextRetired } from "@/plugins/door-access-controller/parallelRun";
import Service from "@/plugins/door-access-controller/service";
import { resolveConfig } from "@/plugins/door-access-controller/config";
import { getPlugin } from "@/lib/plugins/registry";
import PluginStateModel from "@/lib/plugins/model";
import { auditLog } from "@/lib/audit";

const enable = (on) => {
  getPlugin.mockReturnValue({ manifest: { id: "door-access-controller", enabledByDefault: false } });
  PluginStateModel.getState.mockResolvedValue({ enabled: on });
};
const cfg = (over = {}) => resolveConfig.mockResolvedValue({ authoritative: false, retirePlaintextCode: false, ...over });

beforeEach(() => { jest.clearAllMocks(); enable(true); cfg(); });

describe("authoritativeDecision", () => {
  test("addon disabled → not handled (legacy path runs)", async () => {
    enable(false);
    expect(await authoritativeDecision({ cardId: "c", doorId: "front" })).toEqual({ handled: false });
    expect(Service.authorize).not.toHaveBeenCalled();
  });

  test("enabled but not authoritative → not handled", async () => {
    cfg({ authoritative: false });
    expect(await authoritativeDecision({ cardId: "c", doorId: "front" })).toEqual({ handled: false });
    expect(Service.authorize).not.toHaveBeenCalled();
  });

  test("authoritative → delegates to Service.authorize (addon resolves the credential)", async () => {
    cfg({ authoritative: true });
    Service.authorize.mockResolvedValue({ granted: true, reason: "rule-match", userID: "u1", username: "amy", role: "member" });
    const r = await authoritativeDecision({ cardId: "CARD-A", doorId: "front" });
    expect(r).toMatchObject({ handled: true, granted: true, userID: "u1" });
    expect(Service.authorize).toHaveBeenCalledWith(expect.objectContaining({ credentialType: "nfc", credentialValue: "CARD-A", doorId: "front" }));
  });

  test("authoritative + Service throws → fail CLOSED (handled deny), audited", async () => {
    cfg({ authoritative: true });
    Service.authorize.mockRejectedValue(new Error("db down"));
    const r = await authoritativeDecision({ cardId: "c", doorId: "front" });
    expect(r).toEqual({ handled: true, granted: false, reason: "authorize-error" });
    expect(auditLog).toHaveBeenCalledWith("door-access.authorize", expect.objectContaining({ outcome: "error" }));
  });
});

describe("plaintextRetired", () => {
  test("false when disabled", async () => { enable(false); expect(await plaintextRetired()).toBe(false); });
  test("false when the flag is off", async () => { cfg({ retirePlaintextCode: false }); expect(await plaintextRetired()).toBe(false); });
  test("true when enabled + flag on", async () => { cfg({ retirePlaintextCode: true }); expect(await plaintextRetired()).toBe(true); });
});
