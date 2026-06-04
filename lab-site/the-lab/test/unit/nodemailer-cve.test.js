// SEC follow-up: nodemailer <=8.0.4 carried four high-severity advisories
// (SMTP command injection via envelope.size and via CRLF in the transport name,
// addressparser DoS, and email-to-unintended-domain). This guards the fix so the
// dependency can't silently regress below the patched line, and confirms our
// email utility still loads under the nodemailer 8 API.

import nodemailerPkg from "nodemailer/package.json";

describe("nodemailer CVE remediation", () => {
    test("REGRESSION: installed nodemailer is on the patched 8.x line (>= 8.0.5)", () => {
        const [major, minor, patch] = nodemailerPkg.version.split(".").map(Number);
        const atLeast805 = major > 8 || (major === 8 && (minor > 0 || patch >= 5));
        expect(atLeast805).toBe(true);
    });

    test("the email utility loads and exposes its senders under nodemailer 8", async () => {
        const mod = await import("@/app/utils/email.util");
        expect(typeof mod.sendVerificationEmail).toBe("function");
    });
});
