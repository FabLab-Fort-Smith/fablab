// SEC-09: the image proxy fetched any user-supplied URL. The SSRF guard must
// reject internal/metadata/loopback targets, non-http(s) schemes, and any host
// not on the allowlist, while still permitting the legitimate image CDNs.

import { assertAllowedUrl, isPrivateHostname, hostIsAllowed } from "@/lib/ssrf";

const ALLOW = ["cdn.discordapp.com", ".googleusercontent.com", "s3.crittercodes.dev"];
const expectBlocked = (url, allow = ALLOW) => expect(() => assertAllowedUrl(url, allow)).toThrow();

describe("isPrivateHostname", () => {
    test("REGRESSION: cloud metadata + loopback + private ranges are private", () => {
        ["169.254.169.254", "127.0.0.1", "0.0.0.0", "10.0.0.5", "192.168.1.1", "172.16.0.1", "172.31.255.255"]
            .forEach((ip) => expect(isPrivateHostname(ip)).toBe(true));
    });
    test("localhost-ish names are private", () => {
        ["localhost", "foo.localhost", "svc.local", "api.internal"].forEach((h) => expect(isPrivateHostname(h)).toBe(true));
    });
    test("IPv6 loopback / unique-local / link-local + v4-mapped loopback are private", () => {
        ["::1", "fc00::1", "fe80::1", "::ffff:127.0.0.1"].forEach((h) => expect(isPrivateHostname(h)).toBe(true));
    });
    test("public hostnames and public IPs are not private", () => {
        expect(isPrivateHostname("cdn.discordapp.com")).toBe(false);
        expect(isPrivateHostname("8.8.8.8")).toBe(false);
        expect(isPrivateHostname("172.32.0.1")).toBe(false); // just outside 172.16/12
    });
});

describe("hostIsAllowed", () => {
    test("exact match and subdomain suffix match", () => {
        expect(hostIsAllowed("cdn.discordapp.com", ALLOW)).toBe(true);
        expect(hostIsAllowed("lh3.googleusercontent.com", ALLOW)).toBe(true); // .suffix
        expect(hostIsAllowed("googleusercontent.com", ALLOW)).toBe(true);     // apex of .suffix
        expect(hostIsAllowed("evil.com", ALLOW)).toBe(false);
        expect(hostIsAllowed("notdiscordapp.com", ALLOW)).toBe(false);
        expect(hostIsAllowed("cdn.discordapp.com.evil.com", ALLOW)).toBe(false);
    });
});

describe("assertAllowedUrl (SSRF gate)", () => {
    test("REGRESSION: cloud metadata endpoint is blocked", () => {
        expectBlocked("http://169.254.169.254/latest/meta-data/iam/security-credentials/");
    });
    test("REGRESSION: internal service by loopback/private IP is blocked", () => {
        expectBlocked("http://127.0.0.1:3001/admin");
        expectBlocked("http://10.0.0.5/");
        expectBlocked("http://localhost:3000/");
    });
    test("REGRESSION: non-http(s) schemes are blocked", () => {
        expectBlocked("file:///etc/passwd");
        expectBlocked("gopher://127.0.0.1:6379/_INFO");
        expectBlocked("data:text/html,<script>");
    });
    test("REGRESSION: a public but non-allowlisted host is blocked", () => {
        expectBlocked("https://evil.example.com/x.png");
    });
    test("invalid input is blocked", () => {
        expectBlocked("not a url");
        expectBlocked("");
    });
    test("allowlisted image hosts pass and return a parsed URL", () => {
        expect(assertAllowedUrl("https://cdn.discordapp.com/avatars/1/2.png", ALLOW).hostname).toBe("cdn.discordapp.com");
        expect(assertAllowedUrl("https://lh3.googleusercontent.com/a/x", ALLOW).hostname).toBe("lh3.googleusercontent.com");
        expect(assertAllowedUrl("http://s3.crittercodes.dev/fablab-bounties/k.jpg", ALLOW).protocol).toBe("http:");
    });
});
