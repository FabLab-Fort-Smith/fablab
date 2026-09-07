import { resolveBuildHash } from "@/lib/buildHash";

describe("resolveBuildHash (#132 — sidebar build badge)", () => {
  test("SOURCE_COMMIT set → real short (7-char) hash", () => {
    expect(resolveBuildHash("abc1234")).toBe("abc1234");
    // Coolify passes the full 40-char SHA; it is short-sliced to 7.
    expect(resolveBuildHash("1234567890abcdef1234567890abcdef12345678")).toBe(
      "1234567",
    );
  });

  test("unset/blank → 'dev' fallback (never breaks local dev)", () => {
    expect(resolveBuildHash(undefined)).toBe("dev");
    expect(resolveBuildHash(null)).toBe("dev");
    expect(resolveBuildHash("")).toBe("dev");
    expect(resolveBuildHash("   ")).toBe("dev");
  });

  test("trims surrounding whitespace before slicing", () => {
    expect(resolveBuildHash("  deadbeefcafe  ")).toBe("deadbee");
  });
});
