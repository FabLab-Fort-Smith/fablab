// SEC-21: infrastructure endpoints and secrets must come from the environment,
// not `process.env.X || '<literal>'` fallbacks (which silently route to the
// wrong host or ship a default secret). This sentinel fails if the removed
// literal fallbacks reappear in the affected files.

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

describe("SEC-21 — no hardcoded infra/secret fallbacks", () => {
    test.each([
        ["src/lib/access-control.js", [/http:\/\/localhost:3001/, /ACCESS_CONTROL_API_URL\s*\|\|/]],
        ["src/app/api/admin/pair-card/route.js", [/socket\.crittercodes\.dev/, /WS_SERVER_URL\s*\|\|/]],
        ["src/app/api/v1/memberships/pair-key/route.js", [/socket\.crittercodes\.dev/, /WS_SERVER_URL\s*\|\|/]],
        ["src/app/api/discord/interactions/route.js", [/FabLabFS/, /WIFI_PASSWORD\s*\|\|/]],
        ["src/app/api/auth/register/route.js", [/RECAPTCHA_SECRET_KEY\s*\|\|/, /6LeIxAcTAAAA/]],
    ])("REGRESSION: %s has no literal fallback", (file, patterns) => {
        const src = read(file);
        for (const re of patterns) expect(src).not.toMatch(re);
    });
});
