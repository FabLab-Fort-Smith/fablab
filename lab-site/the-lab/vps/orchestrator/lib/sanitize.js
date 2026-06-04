// SEC-22: strict allowlist sanitization for untrusted values (userID, missionID)
// that flow into Docker container names, volume names, image refs, and Traefik
// rule strings. Coerce to string then strip to the allowed charset so nothing
// can break out of those contexts (no backticks/quotes/spaces into a Traefik
// `Host(...)` rule, no `/` or `:` to redirect an image ref, no path traversal).
//
// IMPORTANT: a value that sanitizes to "" must be rejected by the caller — an
// empty id collides across users (e.g. a shared `data_` volume / wildcard host),
// which is an isolation bug, not just a naming one.

const USER_ID = /[^a-zA-Z0-9]/g;        // container/volume/host segment: alphanumeric only
const MISSION_ID = /[^a-zA-Z0-9-_]/g;   // image/container segment: alphanumeric + - _

/**
 * @param {unknown} value
 * @param {RegExp} disallowed - global regex of characters to strip
 * @returns {string} the sanitized value (may be "" — caller must reject empties)
 */
function safeName(value, disallowed = USER_ID) {
    return String(value ?? "").replace(disallowed, "");
}

module.exports = { safeName, USER_ID, MISSION_ID };
