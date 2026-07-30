// Shared config for the Google-sign-in retirement campaign
// (docs/analysis/google-oauth-removal-impact.md §6).
//
// Lives in lib/ so BOTH the in-app nudge (api/v1/users/auth-methods) and the notice
// mailer (api/v1/admin/google-retirement-notice) read the same value without either
// feature importing the other's internals (CLAUDE.md §4).

/**
 * The retirement date shown to members.
 *
 * Resolved at call time rather than module load, so it is runtime-changeable without a
 * rebuild. Deliberately NOT a `NEXT_PUBLIC_*` variable: the value reaches the client
 * through the auth-methods API response, so it never needs build-time inlining — and a
 * second, separately-set variable would let the banner and the email name different
 * lockout deadlines.
 *
 * Non-secret.
 *
 * @returns {string} the human-readable deadline, or a neutral placeholder if unset
 */
export function retirementDeadline() {
    const v = process.env.GOOGLE_RETIRES_ON;
    return typeof v === 'string' && v.trim() ? v.trim() : 'the announced date';
}
