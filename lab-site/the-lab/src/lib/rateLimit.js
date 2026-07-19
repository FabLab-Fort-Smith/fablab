// Lightweight in-memory sliding-window rate limiter.
//
// Scope + limits: this is a BEST-EFFORT, PER-INSTANCE limiter (state lives in
// process memory) — it bounds abuse from a single client and protects upstreams,
// but it is NOT a distributed limiter. On a multi-instance deploy the effective
// limit is per-instance. For a hard cross-instance guarantee, back this with a
// shared store (Redis) — tracked as a follow-up. Callers key by a stable string
// (e.g. `feature:action:userID`).

const buckets = new Map(); // key -> number[] (recent hit timestamps, ms)
const MAX_KEYS = 50_000; // safety cap so a flood of distinct keys can't grow unbounded

/**
 * Record a hit and report whether it is allowed under `limit` per `windowMs`.
 * @param {string} key
 * @param {{ limit: number, windowMs: number }} opts
 * @returns {{ allowed: boolean, retryAfterMs: number }}
 */
export function rateLimit(key, { limit, windowMs }) {
  const now = Date.now();
  const recent = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    buckets.set(key, recent);
    const retryAfterMs = Math.max(0, windowMs - (now - recent[0]));
    return { allowed: false, retryAfterMs };
  }
  recent.push(now);
  if (buckets.size >= MAX_KEYS) buckets.clear(); // crude overflow guard
  buckets.set(key, recent);
  return { allowed: true, retryAfterMs: 0 };
}

/** Test/hygiene helper: clear all buckets. */
export function _resetRateLimit() {
  buckets.clear();
}
