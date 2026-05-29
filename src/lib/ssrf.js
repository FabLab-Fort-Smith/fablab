// src/lib/ssrf.js
//
// SEC-09: guard for server-side fetches of user-supplied URLs. Any route that
// fetches a URL the client controls must run it through assertAllowedUrl first,
// or it becomes a Server-Side Request Forgery pivot into the internal network
// and cloud metadata service.
//
// The primary control is a host allowlist (only known image/CDN hosts). Private
// / loopback / link-local / metadata IP literals are rejected as defence in
// depth so an IP-literal or localhost target can never slip through. Note: a
// strict allowlist of externally-controlled hostnames also defeats DNS
// rebinding in practice, since an attacker cannot repoint those names at an
// internal address.

import net from "node:net";

// IPv4 ranges that must never be a fetch target.
const PRIVATE_IPV4 = [
    /^0\./,                          // "this" network
    /^10\./,                         // RFC1918
    /^127\./,                        // loopback
    /^169\.254\./,                   // link-local incl. 169.254.169.254 (cloud metadata)
    /^172\.(1[6-9]|2\d|3[01])\./,    // RFC1918 172.16/12
    /^192\.168\./,                   // RFC1918
];

/**
 * True for hostnames that must never be the target of a user-supplied fetch:
 * localhost-ish names and IP literals in loopback/private/link-local ranges.
 * DNS names that aren't IP literals return false — the allowlist gates those.
 */
export function isPrivateHostname(hostname) {
    if (!hostname) return true;
    const h = hostname.toLowerCase().replace(/\.$/, "").replace(/^\[|\]$/g, "");

    if (h === "localhost" || h.endsWith(".localhost")
        || h.endsWith(".local") || h.endsWith(".internal")) {
        return true;
    }

    const kind = net.isIP(h);
    if (kind === 4) return PRIVATE_IPV4.some((re) => re.test(h));
    if (kind === 6) {
        if (h === "::1" || h === "::") return true;          // loopback / unspecified
        if (/^f[cd]/.test(h)) return true;                    // fc00::/7 unique-local
        if (/^fe80/.test(h)) return true;                     // link-local
        const mapped = h.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/); // IPv4-mapped
        if (mapped) return PRIVATE_IPV4.some((re) => re.test(mapped[1]));
        return false;
    }
    return false;
}

/**
 * Does `hostname` match one of the allowlist entries? An entry beginning with a
 * dot (".googleusercontent.com") matches that apex and any subdomain; otherwise
 * the match is exact.
 */
export function hostIsAllowed(hostname, allowedHosts = []) {
    const h = hostname.toLowerCase();
    return allowedHosts.some((entry) => {
        const e = String(entry).toLowerCase().trim();
        if (!e) return false;
        if (e.startsWith(".")) return h === e.slice(1) || h.endsWith(e);
        return h === e;
    });
}

/**
 * Validate a user-supplied URL for a server-side fetch. Throws on any violation;
 * returns the parsed URL on success.
 *
 * @param {string} urlString - the untrusted URL
 * @param {string[]} allowedHosts - allowlist (exact host, or ".suffix" for subdomains)
 * @returns {URL}
 */
export function assertAllowedUrl(urlString, allowedHosts = []) {
    let url;
    try {
        url = new URL(urlString);
    } catch {
        throw new Error("Invalid URL");
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error("Unsupported URL scheme");
    }
    if (isPrivateHostname(url.hostname)) {
        throw new Error("Blocked host");
    }
    if (!hostIsAllowed(url.hostname, allowedHosts)) {
        throw new Error("Host not allowed");
    }
    return url;
}
