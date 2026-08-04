// Where a signed-in user's dashboard lives, and where an anonymous visitor is sent.
//
// Pure (no I/O, no router) so the path construction is unit-testable — the bug this
// replaces shipped a literal "/dashboard/undefined" to every user who signed in,
// because the page read `session.user.id` while the session callback only ever sets
// `session.user.userID` (issue #186).

/** The real sign-in route. NOT `/login`, which does not exist (404). */
export const SIGN_IN_PATH = '/auth/signin';

/**
 * Build the dashboard home path for a session.
 *
 * Returns `null` rather than a path containing `undefined`/`null` when the id is
 * missing, so the caller must handle that case explicitly instead of navigating to a
 * broken URL.
 *
 * @param {object|null|undefined} session - the next-auth session
 * @returns {string|null} `/dashboard/<userID>`, or null when there is no usable id
 */
export function dashboardHomePath(session) {
    const id = session?.user?.userID;
    if (typeof id !== 'string') return null;
    const trimmed = id.trim();
    if (!trimmed) return null;
    // encode: the id ends up in a URL path segment, and it comes from stored data.
    return `/dashboard/${encodeURIComponent(trimmed)}`;
}
