// Maps a core user record → the membership FACTS the policy engine consumes. This
// is the "core presents facts" boundary in code: the addon reads a user (via the
// users SERVICE, never its model — the-lab/CLAUDE.md §4) and projects ONLY the
// fields policy needs. Pure + testable; no good-standing decision here (that's policy).

/**
 * @param {object|null} user  a user record from UsersService
 * @returns {import("./policy").Facts|null}
 */
export function factsFromUser(user) {
  if (!user || !user.userID) return null;
  const m = user.membership || {};
  return {
    userID: user.userID,
    role: user.role || "member",
    membershipStatus: m.status || "",
    subscriptionStatus: m.subscriptionStatus || "",
    isWaived: Boolean(m.isWaived),
    isCommunity: m.type === "community",
  };
}

export default factsFromUser;
