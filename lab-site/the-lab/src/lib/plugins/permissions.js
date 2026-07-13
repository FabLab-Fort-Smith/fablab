// Plugin permission model — the single choke point for "may this actor perform
// this plugin action?". TODAY the app has exactly one privileged role (`admin`),
// so every plugin permission resolves to isAdmin(). This is deliberately the
// ONLY place that decision lives so a future named-group / permission model
// drops in here with no call-site churn:
//   - extend the session in auth.js (jwt + session callbacks) to carry
//     `permissions`/`groups`, then
//   - change the body below to `actor?.permissions?.includes(perm) || isAdmin(actor)`.
// See docs/architecture/plugin-platform.md §permissions.

import { isAdmin } from "@/app/api/v1/users/access";

/** @typedef {{ userID?: string, role?: string, permissions?: string[] }} Actor */

/**
 * Whether an actor holds a plugin permission. Deny-by-default.
 * @param {Actor} actor
 * @param {string} _perm - permission token (e.g. "member-email:admin")
 * @returns {boolean}
 */
export function hasPermission(actor, _perm) {
  // Single-role model: admins hold every plugin permission. Group-ready seam.
  return isAdmin(actor);
}

/**
 * Assert an actor holds a permission; throws a tagged error the controller maps
 * to 403 (fail closed).
 * @param {Actor} actor
 * @param {string} perm
 */
export function assertPermission(actor, perm) {
  if (!hasPermission(actor, perm)) {
    const err = new Error("Forbidden");
    err.code = "FORBIDDEN";
    err.status = 403;
    throw err;
  }
}
