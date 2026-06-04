import { escapeRegExp } from "@/lib/escapeRegExp";

describe("escapeRegExp (SEC-12)", () => {
  test("escapes regex metacharacters", () => {
    expect(escapeRegExp(".*")).toBe("\\.\\*");
    expect(escapeRegExp("a+b?(c)")).toBe("a\\+b\\?\\(c\\)");
    expect(escapeRegExp("user-123")).toBe("user-123"); // hyphen isn't special outside a class
  });

  test("coerces nullish input to a safe empty string", () => {
    expect(escapeRegExp(undefined)).toBe("");
    expect(escapeRegExp(null)).toBe("");
  });

  test("a wildcard becomes a literal — no longer matches everything", () => {
    const re = new RegExp(`^${escapeRegExp(".*")}$`);
    expect(re.test(".*")).toBe(true);
    expect(re.test("anything-else")).toBe(false);
  });
});
