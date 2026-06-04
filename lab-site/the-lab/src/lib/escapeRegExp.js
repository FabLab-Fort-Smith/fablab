/**
 * Escape a string so it is matched literally inside a RegExp / Mongo $regex,
 * preventing regex injection and ReDoS via user input (SEC-12).
 *
 * @param {*} str - coerced to string; nullish becomes ""
 * @returns {string}
 */
export function escapeRegExp(str) {
  return String(str ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export default escapeRegExp;
