import auth from "../../vps/orchestrator/lib/auth.js";
const { verifyServiceKey } = auth;

describe("orchestrator service-key auth (SEC-13)", () => {
  test("REGRESSION: rejects when the secret is unset (no header vs undefined must NOT pass)", () => {
    // Old code did `key !== SECRET`; with both undefined that was false => auth PASSED.
    expect(verifyServiceKey(undefined, undefined)).toBe(false);
    expect(verifyServiceKey("", "")).toBe(false);
    expect(verifyServiceKey(undefined, "the-real-secret")).toBe(false);
  });

  test("rejects the old default 'change_me_in_prod' when a real secret is configured", () => {
    expect(verifyServiceKey("change_me_in_prod", "the-real-secret")).toBe(false);
  });

  test("accepts the correct key", () => {
    expect(verifyServiceKey("the-real-secret", "the-real-secret")).toBe(true);
  });

  test("rejects a wrong or non-string key", () => {
    expect(verifyServiceKey("wrong", "the-real-secret")).toBe(false);
    expect(verifyServiceKey(null, "the-real-secret")).toBe(false);
  });
});
