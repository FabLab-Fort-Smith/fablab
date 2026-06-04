// Guards the flat-config migration: eslint-config-next 16 is flat-config-native,
// and wrapping it in @eslint/eslintrc FlatCompat crashed lint ("Converting
// circular structure to JSON"). These assert the config stays on the native flat
// import and the dependency stays on the v16 line, so the crash can't return.
// (CI's `lint` job is the functional guard; this catches the regression in unit
// tests too.)

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");

describe("eslint flat-config migration", () => {
    test("REGRESSION: eslint.config.mjs uses the native flat import, not FlatCompat", () => {
        const cfg = fs.readFileSync(path.join(ROOT, "eslint.config.mjs"), "utf8");
        expect(cfg).toMatch(/eslint-config-next\/core-web-vitals/);
        // No actual FlatCompat import/usage (comment prose is fine).
        expect(cfg).not.toMatch(/from ["']@eslint\/eslintrc["']/);
        expect(cfg).not.toMatch(/new FlatCompat/);
    });

    test("REGRESSION: eslint-config-next is pinned to the v16 line", () => {
        const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
        const ver = pkg.devDependencies["eslint-config-next"];
        expect(Number(ver.replace(/[^\d.]/g, "").split(".")[0])).toBeGreaterThanOrEqual(16);
    });
});
