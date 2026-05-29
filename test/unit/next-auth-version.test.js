// Dependency upgrade: next-auth 5.0.0-beta.25 → beta.31 (core auth — Google/
// Discord/Credentials providers, JWT sessions). Auth flows are verified by the
// build (auth.js + middleware + the api/auth routes compile) since the unit
// tests mock @/auth. This guard prevents a silent regression to an earlier beta.

import fs from "node:fs";
import path from "node:path";

test("REGRESSION: next-auth is on 5.x and not below beta.31", () => {
    const pkgPath = path.resolve(__dirname, "..", "..", "node_modules", "next-auth", "package.json");
    const { version } = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    expect(Number(version.split(".")[0])).toBe(5);
    const beta = version.match(/-beta\.(\d+)/);
    // If it's still a beta build, require >= 31 (a GA 5.x release has no -beta tag).
    if (beta) expect(Number(beta[1])).toBeGreaterThanOrEqual(31);
});
