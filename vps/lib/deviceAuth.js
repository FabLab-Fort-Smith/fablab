import crypto from "crypto";

/**
 * Device secrets are configured via the DEVICE_SECRETS env var as a JSON object
 * mapping deviceId -> secret, e.g.
 *   DEVICE_SECRETS='{"door-controller-01":"<secret>","laser-cutter-01":"<secret>"}'
 * No secrets are hardcoded (SEC-06).
 *
 * @param {string|undefined} [raw=process.env.DEVICE_SECRETS]
 * @returns {Record<string,string>}
 */
export function loadDeviceSecrets(raw = process.env.DEVICE_SECRETS) {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** Constant-time string equality; false on type/length mismatch. */
export function timingSafeEqualStr(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * Verify a device's presented secret against its configured secret.
 * Fails closed: unknown device or no configured secret => false.
 *
 * @param {string} deviceId
 * @param {string} secret
 * @param {Record<string,string>} [secrets=loadDeviceSecrets()]
 * @returns {boolean}
 */
export function verifyDeviceSecret(deviceId, secret, secrets = loadDeviceSecrets()) {
  if (!deviceId || typeof secret !== "string") return false;
  const expected = secrets[deviceId];
  if (!expected) return false;
  return timingSafeEqualStr(secret, expected);
}

export default { loadDeviceSecrets, verifyDeviceSecret, timingSafeEqualStr };
