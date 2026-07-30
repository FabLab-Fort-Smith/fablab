// Dependency upgrade: next-auth 5.0.0-beta.25 → beta.31 → beta.32 (core auth —
// Google/Discord/Credentials providers, JWT sessions). Auth flows are verified by
// the build (auth.js + middleware + the api/auth routes compile) since the unit
// tests mock @/auth. This guard prevents a silent regression to an earlier beta.
//
// The floor is beta.32 because every release UP TO AND INCLUDING beta.31 carries four
// Auth.js advisories. Ordered by how much they actually matter to THIS app:
//   GHSA-x445-f3h2-j279  Moderate 6.8 — OAuth state/nonce/PKCE check cookies are not bound
//                        to the provider that created them, enabling cross-provider account
//                        linking. OPERATIVE HERE: we run multiple OAuth providers AND expose
//                        account linking for signed-in users (api/v1/auth/link-intent,
//                        api/v1/auth/discord/link).
//   GHSA-8fpg-xm3f-6cx3  Low — fail-open (CWE-285/636): a config error leaves `auth` a truthy
//                        error object, so bare-truthiness session checks pass. Applies in
//                        principle; see the follow-up on `!!auth?.user` hardening.
//   GHSA-xmf8-cvqr-rfgj  High 7.5 — getToken() DoS on a malformed Bearer header. NOT applicable:
//                        this app never calls getToken().
//   GHSA-7rqj-j65f-68wh  High — email/magic-link Unicode NFKC homoglyph normalization can send a
//                        magic link to the wrong mailbox. NOT applicable: no Email provider
//                        (Google / Discord / Credentials only).
// None of the four is critical and none is CVSS 9.1 (npm audit's rollup severity is misleading
// here — these are the fetched advisory ratings).
//
// Three of the four are fixed in @auth/core 0.41.3 rather than in next-auth itself, so both are
// asserted: next-auth beta.32 pins @auth/core exactly today, but an `overrides` entry could
// otherwise force a vulnerable core while the next-auth check still passed.

import fs from "node:fs";
import path from "node:path";

const MIN_SECURE_BETA = 32;
const MIN_SECURE_AUTH_CORE = "0.41.3";

const installed = (...seg) =>
    JSON.parse(fs.readFileSync(path.resolve(__dirname, "..", "..", "node_modules", ...seg, "package.json"), "utf8"));

test("REGRESSION: next-auth is on 5.x and not below the minimum secure beta", () => {
    const { version } = installed("next-auth");
    expect(Number(version.split(".")[0])).toBe(5);
    const beta = version.match(/-beta\.(\d+)/);
    // If it's still a beta build, require >= the secure floor (a GA 5.x release has no -beta tag).
    if (beta) expect(Number(beta[1])).toBeGreaterThanOrEqual(MIN_SECURE_BETA);
});

test("REGRESSION: @auth/core is not below the version that patches the advisories", () => {
    const { version } = installed("@auth", "core");
    expect(version.localeCompare(MIN_SECURE_AUTH_CORE, undefined, { numeric: true })).toBeGreaterThanOrEqual(0);
});
