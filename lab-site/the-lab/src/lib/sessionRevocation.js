// Session-revocation helpers for the NextAuth jwt/session callbacks (AC-8a). Pure + dependency-injected
// so the auth-critical logic is unit-testable WITHOUT booting NextAuth. See auth.js callbacks.
//
// Model: a JWT session is stateless and valid until expiry. On refresh we re-verify (throttled) that
// the account still exists; if it was deleted / GDPR-purged / merged away we mark the token invalid so
// it stops authorizing. A transient lookup failure FAILS OPEN (token unchanged) so a DB blip can't mass
// log everyone out; a genuinely-missing account FAILS CLOSED (session de-identified downstream).

/** Re-check window: at most one account lookup per this interval per session. */
export const REVALIDATE_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Throttled account-existence + role re-check for a JWT.
 * @param {object} token the NextAuth JWT (mutated in place and returned)
 * @param {{getUser:(userID:string)=>Promise<object|null>, now?:number, log?:Function, maskId?:Function}} deps
 * @returns {Promise<object>} the token
 */
export async function revalidateToken(token, { getUser, now = Date.now(), log = () => {}, maskId = (x) => x } = {}) {
  try {
    if (token?.userID && !token.invalidated) {
      if (!token.checkedAt || now - token.checkedAt > REVALIDATE_INTERVAL_MS) {
        const exists = await getUser(token.userID);
        if (!exists) {
          token.invalidated = true;
          log(`🔒 Session invalidated for ${maskId(token.userID)} — account no longer exists`);
        } else {
          token.checkedAt = now;
          if (exists.role !== undefined) token.role = exists.role; // propagate demotion within the window
        }
      }
    }
  } catch {
    // Fail open: a lookup/DB error must NOT invalidate a valid session. Leave the token unchanged and
    // don't advance checkedAt, so the next request retries rather than caching the failure.
  }
  return token;
}

/**
 * If the token was invalidated, replace session.user with a de-identified marker so every downstream
 * role/ownership check fails closed (role/userID undefined) WITHOUT throwing (session.user stays an
 * object). Returns true when it de-identified.
 * @param {object} session
 * @param {object} token
 * @returns {boolean}
 */
export function deidentifyInvalidated(session, token) {
  if (token?.invalidated) {
    session.user = { invalidated: true };
    return true;
  }
  return false;
}

const SessionRevocation = { REVALIDATE_INTERVAL_MS, revalidateToken, deidentifyInvalidated };
export default SessionRevocation;
