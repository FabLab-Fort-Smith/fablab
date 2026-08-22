// vps/lib/scanAuthorize.js
// Shared door-scan decision, used by BOTH the WS `scan` handler and the HTTP /api/v2/authorize
// route in socket-server.js. Extracted here so it is unit-testable (deps are injectable).
//
// Policy: online-first — ask the app core (internal/check-access) for the decision; on ANY failure
// (unreachable, timeout, non-2xx) fall back to the locally-stored signed offline allowlist.
// Fail-secure: no snapshot / expired / no match => denied. NEVER throws — always resolves to a
// decision object { granted, reason?, mode: 'online' | 'offline', ... }.
//
// SECURITY: `cardId` is the raw scanned credential (Restricted/PII, CLAUDE §5). It is passed to the
// app core and the offline decider but must NEVER be logged by callers.

/**
 * Build an authorizeScan() bound to its collaborators (injectable for tests).
 * @param {object} deps
 * @param {{authorizeOffline: Function}} deps.offline - offline allowlist decider (vps/lib/offlineAccess.js).
 * @param {Function} [deps.fetchImpl] - fetch implementation (defaults to global fetch).
 * @param {object} [deps.env] - environment source (defaults to process.env).
 * @param {number} [deps.timeoutMs] - app-core call timeout (default 4000).
 * @returns {(args: {cardId: string, doorId: string, tz?: string}) => Promise<object>}
 */
export function makeAuthorizeScan({ offline, fetchImpl, env = process.env, timeoutMs = 4000 } = {}) {
    const doFetch = fetchImpl || ((...a) => fetch(...a));
    if (!offline || typeof offline.authorizeOffline !== 'function') {
        throw new Error('makeAuthorizeScan requires an offline decider');
    }

    return async function authorizeScan({ cardId, doorId, tz } = {}) {
        const appUrl = env.APP_INTERNAL_URL;
        const internalSecret = env.INTERNAL_API_SECRET;
        if (appUrl && internalSecret) {
            try {
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), timeoutMs); // don't hang the door on a slow core
                const url = `${appUrl}/api/internal/check-access?cardId=${encodeURIComponent(cardId)}&doorId=${encodeURIComponent(doorId)}`;
                let r;
                try {
                    r = await doFetch(url, { headers: { authorization: `Bearer ${internalSecret}` }, signal: controller.signal });
                } finally {
                    clearTimeout(timer);
                }
                if (r && r.ok) {
                    const body = await r.json();
                    return { ...body, mode: 'online' };
                }
            } catch (e) {
                // Fall through to offline (fail-secure). Log the reason, never the card code.
                console.warn('[Authorize] app core unreachable, falling back offline:', e && e.message ? e.message : e);
            }
        }
        const decision = offline.authorizeOffline({ code: cardId, doorId, tz });
        return { granted: decision.granted, reason: decision.reason, mode: 'offline' };
    };
}
