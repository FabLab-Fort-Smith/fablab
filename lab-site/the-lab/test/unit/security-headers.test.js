// SEC-25: next.config.mjs must ship the security-headers policy (HSTS, nosniff,
// frame-options, referrer-policy, permissions-policy) and a CSP. Asserted
// statically so the policy can't silently disappear. (Functional header
// presence is exercised by the headers-check gate / staging.)

import fs from "node:fs";
import path from "node:path";

const cfg = fs.readFileSync(path.resolve(__dirname, "..", "..", "next.config.mjs"), "utf8");

describe("SEC-25 — security headers in next.config", () => {
    test("REGRESSION: defines a headers() policy applied to all routes", () => {
        expect(cfg).toMatch(/async headers\(\)/);
        expect(cfg).toMatch(/source:\s*["']\/:path\*["']/);
    });

    test.each([
        ["Strict-Transport-Security", /max-age=\d+; includeSubDomains; preload/],
        ["X-Content-Type-Options", /nosniff/],
        ["X-Frame-Options", /SAMEORIGIN|DENY/],
        ["Referrer-Policy", /strict-origin-when-cross-origin/],
        ["Permissions-Policy", /camera=\(\)/],
    ])("REGRESSION: sets %s", (header, valueRe) => {
        expect(cfg).toMatch(new RegExp(`["']${header.replace(/[-]/g, "\\$&")}["']`));
        expect(cfg).toMatch(valueRe);
    });

    test("ships a Content-Security-Policy (Report-Only baseline)", () => {
        expect(cfg).toMatch(/Content-Security-Policy(-Report-Only)?/);
        expect(cfg).toMatch(/frame-ancestors 'self'/);
        expect(cfg).toMatch(/object-src 'none'/);
    });
});
