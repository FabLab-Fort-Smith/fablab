// SEC-24: the auth service and email utility logged sensitive data — full
// userData / user records, the bcrypt hash, the plaintext email, and the email
// verification token (a direct account-takeover vector). This sentinel fails if
// any of those logging patterns return to the affected files.

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

// Patterns that must never appear in a console.* call in these files.
const FORBIDDEN = [
    /console\.\w+\([^)]*\bverificationToken\b/, // tokens
    /console\.\w+\([^)]*\bhashedPassword\b/,    // password hashes
    /console\.\w+\([^)]*\bmailOptions\b/,       // recipient + token-bearing email body
    /console\.\w+\(\s*userData\s*\)/,           // full signup payload (incl. plaintext password)
    /console\.\w+\(\s*existingUser\s*\)/,       // full user record
    /console\.\w+\(\s*["']newUser["']\s*,\s*newUser/, // full user object (incl. token)
];

describe("SEC-24 — no sensitive data in logs", () => {
    test.each([
        ["src/app/api/auth/[...nextauth]/service.js"],
        ["src/app/utils/email.util.js"],
    ])("REGRESSION: %s logs no tokens / hashes / PII / full objects", (file) => {
        const src = read(file);
        for (const re of FORBIDDEN) {
            expect(src).not.toMatch(re);
        }
    });
});
