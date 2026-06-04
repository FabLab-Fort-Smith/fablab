import crypto from "crypto";

/** Constant-time string equality; false on type/length mismatch. */
export function timingSafeEqualStr(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * Verify an `Authorization: Bearer <secret>` header against SOCKET_API_SECRET.
 * Fails CLOSED (SEC-05): if no secret is configured, every request is rejected.
 *
 * @param {string|undefined} authorizationHeader
 * @param {string|undefined} [secret=process.env.SOCKET_API_SECRET]
 * @returns {boolean}
 */
export function verifyApiSecret(authorizationHeader, secret = process.env.SOCKET_API_SECRET) {
  if (!secret) return false;
  if (typeof authorizationHeader !== "string") return false;
  return timingSafeEqualStr(authorizationHeader, `Bearer ${secret}`);
}

/** Express middleware guarding device-control endpoints (SEC-05). */
export function requireApiSecret(req, res, next) {
  if (!verifyApiSecret(req.headers["authorization"])) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

export default { verifyApiSecret, requireApiSecret, timingSafeEqualStr };
