const crypto = require("crypto");

/**
 * Constant-time verification of the orchestrator service key (SEC-13).
 * Fails CLOSED: if no secret is configured (expected empty/undefined) or the
 * provided key is missing/wrong type, returns false — so an unset secret can
 * never be bypassed by sending no header.
 *
 * @param {*} provided - value of the x-service-key header
 * @param {*} expected - the configured ORCHESTRATOR_SECRET
 * @returns {boolean}
 */
function verifyServiceKey(provided, expected) {
  if (typeof provided !== "string" || typeof expected !== "string" || expected.length === 0) {
    return false;
  }
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = { verifyServiceKey };
