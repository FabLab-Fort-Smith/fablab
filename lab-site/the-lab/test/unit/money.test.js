// Unit tests for the money helper (#182). The parsing bugs it replaces were all
// `Math.round(unvalidated * 100)`: "abc" → NaN reached Square, negatives passed, no ceiling.

import {
  parseAmountCents, variationPriceCents, InvalidAmountError,
  MIN_CHARGE_CENTS, MAX_DONATION_CENTS,
} from "@/lib/money";

describe("parseAmountCents", () => {
  test("accepts a normal dollar amount", () => {
    expect(parseAmountCents(45)).toBe(4500);
    expect(parseAmountCents("20")).toBe(2000);
    expect(parseAmountCents(12.5)).toBe(1250);
  });

  test.each([
    ["NaN string", "abc"],
    ["empty", ""],
    ["null", null],
    ["undefined", undefined],
    ["object", { amount: 5 }],
    ["array", [5]],
    ["boolean", true],
    ["Infinity", Infinity],
    ["negative", -10],
    ["zero", 0],
  ])("rejects %s", (_label, input) => {
    expect(() => parseAmountCents(input)).toThrow(InvalidAmountError);
  });

  test("rejects below the minimum charge", () => {
    expect(() => parseAmountCents(0.01)).toThrow(/at least/);
  });

  test("rejects above the donation ceiling", () => {
    expect(() => parseAmountCents(MAX_DONATION_CENTS / 100 + 1)).toThrow(/cannot exceed/);
  });

  test("honours the boundaries exactly", () => {
    expect(parseAmountCents(MIN_CHARGE_CENTS / 100)).toBe(MIN_CHARGE_CENTS);
    expect(parseAmountCents(MAX_DONATION_CENTS / 100)).toBe(MAX_DONATION_CENTS);
  });

  test("a custom max is enforced (e.g. a per-plan cap)", () => {
    expect(() => parseAmountCents(100, { max: 5000 })).toThrow(/cannot exceed/);
  });

  test("does not lose money to floating point", () => {
    expect(parseAmountCents(1.1 + 0.2)).toBe(130); // 1.3000000000000003 → 130, not a float
  });
});

describe("variationPriceCents", () => {
  const withPrice = (amount, type = "STATIC") => ({
    subscriptionPlanVariationData: { phases: [{ pricing: { type, priceMoney: { amount } } }] },
  });

  test("reads a static price (Square returns bigint in v44)", () => {
    expect(variationPriceCents(withPrice(4500n))).toBe(4500);
    expect(variationPriceCents(withPrice(4500))).toBe(4500);
  });

  test("returns null for a RELATIVE-priced variation — caller must refuse, not guess", () => {
    expect(variationPriceCents(withPrice(undefined, "RELATIVE"))).toBeNull();
  });

  test("returns null for a malformed / priceless variation", () => {
    expect(variationPriceCents({})).toBeNull();
    expect(variationPriceCents(null)).toBeNull();
    expect(variationPriceCents(withPrice(0))).toBeNull();
  });

  test("falls back to recurringPriceMoney when present", () => {
    const v = { subscriptionPlanVariationData: { phases: [{ recurringPriceMoney: { amount: 2500n } }] } };
    expect(variationPriceCents(v)).toBe(2500);
  });
});
