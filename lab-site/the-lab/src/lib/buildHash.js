/**
 * Resolve the "build" badge value shown in the sidebar footer (#132).
 *
 * Coolify injects `SOURCE_COMMIT` (the deployed git commit) as a build-time arg,
 * which `next.config.mjs` threads into `NEXT_PUBLIC_BUILD_HASH` so Next inlines the
 * short hash into the client bundle at build time. Local/dev builds have no commit,
 * so they fall back to the literal `"dev"` — matching the Sidebar's own default and
 * never breaking local development.
 *
 * Pure function → unit-testable without a real build (see test/unit/buildHash.test.js).
 *
 * @param {*} sourceCommit - raw commit ref (e.g. `process.env.SOURCE_COMMIT`); coerced
 *   to string, nullish/blank treated as "no commit".
 * @returns {string} the first 7 chars of the commit, or `"dev"` when absent/blank.
 */
export function resolveBuildHash(sourceCommit) {
  const raw = String(sourceCommit ?? "").trim();
  if (!raw) return "dev";
  return raw.slice(0, 7);
}

export default resolveBuildHash;
