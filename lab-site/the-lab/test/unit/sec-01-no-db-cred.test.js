// SEC-01: the production Mongo admin credential (`critter:Zapatas2024@23.94.251.158`)
// was hardcoded in two root debug scripts. This sentinel fails if either script
// returns or the leaked credential reappears anywhere in the committed code, so
// the secret can't silently creep back in. It fails against the pre-fix tree.
//
// Scope note: only executable code is scanned. The audit docs (01-security-findings,
// 04-p0-remediation-plan) and CLAUDE.md reference the string as finding evidence,
// and the "Hack the Lab" CTF intentionally plants look-alike connection strings
// (CLAUDE.md §14) — those live in .md files / game paths and are out of scope here.

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");

// The specific leaked credential — unambiguous, won't match CTF game content.
const LEAKED_PATTERNS = [/Zapatas2024/, /23\.94\.251\.158/, /critter:[^@\s]*@/];

const CODE_EXT = new Set([".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx"]);
const SKIP_DIRS = new Set(["node_modules", ".git", ".next", "coverage", "dist", "build"]);

function* walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith(".") && entry.name !== ".") continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (!SKIP_DIRS.has(entry.name)) yield* walk(full);
        } else if (CODE_EXT.has(path.extname(entry.name))) {
            yield full;
        }
    }
}

describe("SEC-01 — leaked DB credential must not be in the tree", () => {
    test("REGRESSION: the hardcoded-credential debug scripts are gone", () => {
        expect(fs.existsSync(path.join(ROOT, "list-dbs.js"))).toBe(false);
        expect(fs.existsSync(path.join(ROOT, "debug-leaderboard.js"))).toBe(false);
    });

    test("REGRESSION: the leaked credential appears in no committed code file", () => {
        const offenders = [];
        for (const file of walk(ROOT)) {
            if (file === __filename) continue; // this sentinel holds the patterns as regex source
            const text = fs.readFileSync(file, "utf8");
            if (LEAKED_PATTERNS.some((re) => re.test(text))) {
                offenders.push(path.relative(ROOT, file));
            }
        }
        expect(offenders).toEqual([]);
    });
});
