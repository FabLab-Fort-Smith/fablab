// Unit coverage for the in-memory sliding-window rate limiter.
import { rateLimit, _resetRateLimit } from "@/lib/rateLimit";

beforeEach(() => _resetRateLimit());
afterEach(() => jest.restoreAllMocks());

test("allows up to the limit, then blocks with a retry-after", () => {
  const opts = { limit: 3, windowMs: 60_000 };
  for (let i = 0; i < 3; i++) expect(rateLimit("k", opts).allowed).toBe(true);
  const over = rateLimit("k", opts);
  expect(over.allowed).toBe(false);
  expect(over.retryAfterMs).toBeGreaterThan(0);
});

test("different keys are independent", () => {
  const opts = { limit: 1, windowMs: 60_000 };
  expect(rateLimit("a", opts).allowed).toBe(true);
  expect(rateLimit("b", opts).allowed).toBe(true); // separate bucket
  expect(rateLimit("a", opts).allowed).toBe(false);
});

test("the window slides — a hit is forgotten after windowMs", () => {
  const now = jest.spyOn(Date, "now");
  const opts = { limit: 1, windowMs: 100 };
  now.mockReturnValue(1000);
  expect(rateLimit("w", opts).allowed).toBe(true);
  now.mockReturnValue(1050); // within window
  expect(rateLimit("w", opts).allowed).toBe(false);
  now.mockReturnValue(1200); // past the window -> old hit expired
  expect(rateLimit("w", opts).allowed).toBe(true);
});
