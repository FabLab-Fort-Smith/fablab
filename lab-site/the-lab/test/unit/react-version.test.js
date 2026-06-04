// Dependency upgrade: React 18 → 19 (+ react-dom). Verified by `next build`
// (SSR + static prerender of all pages compiles under React 19) and the full
// suite. Floor guard so react/react-dom can't silently regress below 19.

import fs from "node:fs";
import path from "node:path";

const major = (pkg) => {
    const p = path.resolve(__dirname, "..", "..", "node_modules", pkg, "package.json");
    return Number(JSON.parse(fs.readFileSync(p, "utf8")).version.split(".")[0]);
};

test("REGRESSION: react and react-dom are on the v19+ line", () => {
    expect(major("react")).toBeGreaterThanOrEqual(19);
    expect(major("react-dom")).toBeGreaterThanOrEqual(19);
});
