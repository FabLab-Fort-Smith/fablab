import { timingSafeEqualStr } from "@/lib/secureCompare";

describe("timingSafeEqualStr (SEC-04 constant-time compare)", () => {
  test("true for equal strings", () => {
    expect(timingSafeEqualStr("Bearer abc123", "Bearer abc123")).toBe(true);
  });

  test("false for different strings of equal length", () => {
    expect(timingSafeEqualStr("Bearer abc123", "Bearer xyz123")).toBe(false);
  });

  test("false for different lengths", () => {
    expect(timingSafeEqualStr("short", "much-longer-value")).toBe(false);
  });

  test("false for non-string input (e.g. missing header)", () => {
    expect(timingSafeEqualStr(null, "Bearer x")).toBe(false);
    expect(timingSafeEqualStr(undefined, "Bearer x")).toBe(false);
  });
});
