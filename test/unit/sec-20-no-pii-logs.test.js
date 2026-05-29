// SEC-20: auth.js dumped full OAuth profiles, full user records, and even the
// login credentials object (password!) to the console; email.util logged the
// decrypted recipient email. This sentinel fails if those patterns return.

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

describe("SEC-20 — no PII / profiles / credentials in logs", () => {
    test("REGRESSION: auth.js logs no profiles, user objects, or credentials", () => {
        const src = read("auth.js");
        for (const re of [
            /console\.\w+\(\s*["'](Google|Discord) Profile:["']\s*,\s*profile/,
            /console\.\w+\(\s*["'](Existing|New) User:["']\s*,\s*(existingUser|newUser)/,
            /console\.\w+\(\s*["']Credentials:["']\s*,\s*credentials/,
        ]) {
            expect(src).not.toMatch(re);
        }
    });

    test("REGRESSION: email.util.js does not log the recipient email", () => {
        const src = read("src/app/utils/email.util.js");
        // No console.* call that interpolates ${email}.
        const logCalls = src.match(/console\.\w+\([^;]*\)/g) || [];
        for (const call of logCalls) {
            expect(call).not.toMatch(/\$\{email\}/);
        }
    });
});
