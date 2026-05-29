// SEC follow-up: the PWA build chain (@ducanh2912/next-pwa → workbox-build →
// @rollup/plugin-terser) pinned serialize-javascript 6.0.2, which carries an RCE
// (GHSA-5c6j-r48x-rmvq) and a DoS (GHSA-qj8w-gfj5-8c6v), both fixed in 7.0.5.
// A package.json `overrides` forces 7.0.5. This guards that override so the
// vulnerable version can't silently return (e.g. if the override is dropped).

import fs from "node:fs";
import path from "node:path";

describe("workbox build chain — serialize-javascript override", () => {
    test("REGRESSION: resolved serialize-javascript is >= 7.0.5 (patched)", () => {
        const pkgPath = path.resolve(__dirname, "..", "..", "node_modules", "serialize-javascript", "package.json");
        const { version } = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
        const [major, minor, patch] = version.split(".").map(Number);
        const atLeast705 = major > 7 || (major === 7 && (minor > 0 || patch >= 5));
        expect(atLeast705).toBe(true);
    });
});
