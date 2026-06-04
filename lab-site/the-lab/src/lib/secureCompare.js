import crypto from "crypto";

/**
 * Constant-time string equality for comparing secrets/tokens (SEC-04).
 * Returns false on any non-string input or length mismatch instead of
 * short-circuiting in a way that leaks timing.
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function timingSafeEqualStr(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export default timingSafeEqualStr;
