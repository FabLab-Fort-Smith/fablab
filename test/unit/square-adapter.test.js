// Regression coverage for the Square adapter seam (#117, P2).
// Importing the module must not pull the v44 ESM package into Jest — the default
// (v39) path is used unless SQUARE_SDK_VERSION=v44, and v44 is loaded lazily.
// If the lazy-import design regressed to a top-level ESM import, this file would
// fail to load with `SyntaxError: Unexpected token 'export'`.
import { squareErrorDetail, bigintReplacer } from "@/lib/square";

describe("square adapter helpers (#117)", () => {
  test("module loads under Jest without dragging in the v44 ESM package", () => {
    expect(typeof squareErrorDetail).toBe("function");
    expect(typeof bigintReplacer).toBe("function");
  });

  test("squareErrorDetail prefers the Square error detail, falls back to message", () => {
    expect(squareErrorDetail({ errors: [{ detail: "Bad value" }] })).toBe("Bad value");
    expect(squareErrorDetail({ message: "boom" })).toBe("boom");
    expect(squareErrorDetail({})).toBeUndefined();
  });

  test("bigintReplacer serializes bigint money amounts as strings", () => {
    expect(JSON.stringify({ amount: 4500n }, bigintReplacer)).toBe('{"amount":"4500"}');
    expect(bigintReplacer("currency", "USD")).toBe("USD");
  });
});
