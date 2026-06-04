import { loadDeviceSecrets, verifyDeviceSecret } from "../../vps/lib/deviceAuth.js";

describe("device auth (SEC-06)", () => {
  test("loadDeviceSecrets parses a JSON map from the env value", () => {
    expect(loadDeviceSecrets('{"door-controller-01":"s1"}')).toEqual({ "door-controller-01": "s1" });
  });

  test("loadDeviceSecrets returns {} for missing or invalid JSON", () => {
    expect(loadDeviceSecrets(undefined)).toEqual({});
    expect(loadDeviceSecrets("not json")).toEqual({});
    expect(loadDeviceSecrets("[1,2,3]")).toEqual({});
  });

  test("REGRESSION: the old hardcoded secret no longer works when not configured", () => {
    // Old code hardcoded { 'door-controller-01': 'sdflvkjnadflnvgq' } and would accept this.
    expect(verifyDeviceSecret("door-controller-01", "sdflvkjnadflnvgq", {})).toBe(false);
    expect(verifyDeviceSecret("laser-cutter-01", "laser-secret", {})).toBe(false);
  });

  test("accepts the configured secret", () => {
    const secrets = { "door-controller-01": "configured-secret" };
    expect(verifyDeviceSecret("door-controller-01", "configured-secret", secrets)).toBe(true);
  });

  test("rejects wrong secret, unknown device, or non-string", () => {
    const secrets = { "door-controller-01": "configured-secret" };
    expect(verifyDeviceSecret("door-controller-01", "wrong", secrets)).toBe(false);
    expect(verifyDeviceSecret("unknown-device", "configured-secret", secrets)).toBe(false);
    expect(verifyDeviceSecret("door-controller-01", null, secrets)).toBe(false);
  });
});
