import crypto from "crypto";

/**
 * Verify a Square webhook signature.
 *
 * Fails CLOSED: returns false if the signing key or signature is missing/empty
 * or anything is malformed (SEC-03 — never default-allow on a verification path).
 * Uses a constant-time comparison to avoid signature guessing via timing (SEC-16).
 *
 * @param {string} rawBody - exact raw request body bytes Square signed
 * @param {string} signature - value of the `x-square-hmacsha256-signature` header
 * @param {string} notificationUrl - the configured webhook notification URL
 * @param {string} [key=process.env.SQUARE_WEBHOOK_SIGNATURE_KEY] - signing key
 * @returns {boolean} true only if the signature is valid
 */
export function verifySquareSignature(
  rawBody,
  signature,
  notificationUrl,
  key = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY
) {
  if (!key || !signature) return false; // fail closed: no key/sig => reject
  try {
    const expected = crypto
      .createHmac("sha256", key)
      .update(notificationUrl + rawBody)
      .digest();
    const provided = Buffer.from(signature, "base64");
    if (expected.length !== provided.length) return false;
    return crypto.timingSafeEqual(expected, provided);
  } catch {
    return false;
  }
}

export default verifySquareSignature;
