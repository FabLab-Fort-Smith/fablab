import { collectEnvErrors, validateEnv, REQUIRED_ENV } from "@/lib/env";

const fullEnv = () => ({
  MONGODB_URI: "mongodb://localhost:27017/x",
  AUTH_SECRET: "a",
  JWT_SECRET: "b",
  ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef", // exactly 32 bytes
  INTERNAL_API_SECRET: "c",
  SQUARE_ACCESS_TOKEN: "d",
  SQUARE_WEBHOOK_SIGNATURE_KEY: "e",
});
const silent = { log() {}, warn() {} };

describe("collectEnvErrors", () => {
  test("no errors when all required vars are set & valid", () => {
    expect(collectEnvErrors(fullEnv())).toEqual([]);
  });

  test("reports a missing var by name", () => {
    const env = fullEnv();
    delete env.JWT_SECRET;
    const errs = collectEnvErrors(env);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatch(/JWT_SECRET/);
  });

  test("treats an empty string as missing", () => {
    const env = fullEnv();
    env.MONGODB_URI = "";
    expect(collectEnvErrors(env)[0]).toMatch(/MONGODB_URI/);
  });

  test("flags ENCRYPTION_KEY that is not 32 bytes", () => {
    const env = fullEnv();
    env.ENCRYPTION_KEY = "tooshort";
    expect(collectEnvErrors(env)[0]).toMatch(/ENCRYPTION_KEY.*32 bytes/);
  });

  test("aggregates every problem when nothing is set", () => {
    expect(collectEnvErrors({})).toHaveLength(REQUIRED_ENV.length);
  });
});

describe("validateEnv", () => {
  test("returns ok when the environment is complete", () => {
    expect(validateEnv({ env: fullEnv(), logger: silent })).toEqual({ ok: true, errors: [] });
  });

  test("throws in strict mode when something is missing (fail fast)", () => {
    expect(() => validateEnv({ env: {}, strict: true, logger: silent })).toThrow(
      /Environment validation failed/
    );
  });

  test("warns but does not throw in non-strict mode", () => {
    const warn = jest.fn();
    const res = validateEnv({ env: {}, strict: false, logger: { warn, log() {} } });
    expect(res.ok).toBe(false);
    expect(warn).toHaveBeenCalled();
  });
});
