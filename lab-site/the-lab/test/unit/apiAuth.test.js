import { verifyApiSecret } from "../../vps/lib/apiAuth.js";

describe("socket-server control-endpoint auth (SEC-05)", () => {
  test("REGRESSION: rejects when no secret is configured (endpoints were unauthenticated)", () => {
    // Old code had no auth on /api/unlock or /api/toggle-light at all.
    expect(verifyApiSecret("Bearer anything", undefined)).toBe(false);
    expect(verifyApiSecret("Bearer anything", "")).toBe(false);
  });

  test("REGRESSION: rejects a request with no Authorization header", () => {
    expect(verifyApiSecret(undefined, "real-secret")).toBe(false);
    expect(verifyApiSecret(null, "real-secret")).toBe(false);
  });

  test("accepts the correct bearer secret", () => {
    expect(verifyApiSecret("Bearer real-secret", "real-secret")).toBe(true);
  });

  test("rejects a wrong secret", () => {
    expect(verifyApiSecret("Bearer wrong", "real-secret")).toBe(false);
    expect(verifyApiSecret("real-secret", "real-secret")).toBe(false); // missing "Bearer "
  });
});
