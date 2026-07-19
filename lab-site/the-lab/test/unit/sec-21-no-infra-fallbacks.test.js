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
        ["src/lib/access-control.js", [/http:\/\/localhost:3001/, /ACCESS_CONTROL_API_URL\s*\|\|/, /SOCKET_API_SECRET\s*\|\|/]],
        ["src/app/api/admin/pair-card/route.js", [/socket\.crittercodes\.dev/, /WS_SERVER_URL\s*\|\|/, /SOCKET_API_SECRET\s*\|\|/]],
        ["src/app/api/v1/memberships/pair-key/route.js", [/socket\.crittercodes\.dev/, /WS_SERVER_URL\s*\|\|/]],
        ["src/app/api/discord/interactions/route.js", [/FabLabFS/, /WIFI_PASSWORD\s*\|\|/]],
        ["src/app/api/auth/register/route.js", [/TURNSTILE_SECRET_KEY\s*\|\|/, /RECAPTCHA_SECRET_KEY/, /6LeIxAcTAAAA/]],
        // captcha site key is public (NEXT_PUBLIC) but a hardcoded fallback is how the reCAPTCHA
        // test key leaked to staging — forbid any literal fallback + the known test keys.
        // /[123]x0{20,}.../ matches every documented Turnstile dummy key — the always-pass/blocks/
        // interactive SITE keys (1x/2x/3x + 20 zeros + 2 hex) and the dummy SECRET keys (31 zeros).
        ["src/app/auth/register/page.js", [/NEXT_PUBLIC_TURNSTILE_SITE_KEY\s*\|\|/, /6LeIxAcTAAAA/, /[123]x0{20,}[0-9A-F]{2}/]],
        ["src/app/api/v1/holodeck/generate-badge-images/route.js", [/s3\.crittercodes\.dev/, /fablab-bounties/, /S3_ENDPOINT\s*\|\|\s*['"]/, /S3_BUCKET_NAME\s*\|\|\s*['"]/]],
    ])("REGRESSION: %s has no literal fallback", (file, patterns) => {
        const src = read(file);
        for (const re of patterns) expect(src).not.toMatch(re);
    });
});
