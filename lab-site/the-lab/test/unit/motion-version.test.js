// Dependency upgrade: motion 11 → 12 (animation lib, client-only — used via
// `motion/react` in the landing/board components, verified by `next build`).
// Floor guard so it can't silently regress below the v12 line.

import fs from "node:fs";
import path from "node:path";

test("REGRESSION: installed motion is on the v12+ line", () => {
    const pkgPath = path.resolve(__dirname, "..", "..", "node_modules", "motion", "package.json");
    const { version } = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    expect(Number(version.split(".")[0])).toBeGreaterThanOrEqual(12);
});
