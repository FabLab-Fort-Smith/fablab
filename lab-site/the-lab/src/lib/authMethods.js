// Which sign-in methods an account actually has — the basis for the Google-OAuth
// retirement campaign (docs/analysis/google-oauth-removal-impact.md §3/§6).
//
// Pure (no I/O) so the classification is unit-testable and identical everywhere it
// matters: the in-app nudge, the announcement mailer, and the removal gate count.

/**
 * Sentinel password stored for accounts created via OAuth — see
 * AuthService.register (src/app/api/auth/[...nextauth]/service.js). Password
 * login rejects it, so it does NOT count as a usable credential.
 */
export const NO_PASSWORD_SENTINEL = 'no password';

const present = (v) => typeof v === 'string' && v.trim() !== '';

/**
 * Classify an account's available sign-in methods.
 * @param {object} user - a user document (may be partial; missing fields count as absent)
 * @returns {{hasPassword: boolean, hasGoogle: boolean, hasDiscord: boolean, googleOnly: boolean, methodCount: number}}
 *   `googleOnly` = Google is the ONLY way in, so retiring the provider locks the
 *   account out until it gains a password or a linked Discord.
 */
export function authMethodsOf(user) {
    const u = user || {};
    const hasPassword = present(u.password) && u.password !== NO_PASSWORD_SENTINEL;
    const hasGoogle = present(u.googleId);
    const hasDiscord = present(u.discordId);
    const methodCount = [hasPassword, hasGoogle, hasDiscord].filter(Boolean).length;
    return {
        hasPassword,
        hasGoogle,
        hasDiscord,
        googleOnly: hasGoogle && !hasPassword && !hasDiscord,
        methodCount,
    };
}
