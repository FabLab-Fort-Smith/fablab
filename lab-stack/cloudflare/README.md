# Cloudflare configuration (edge + DNS)

Cloudflare is the free edge layer (feature #7): CDN cache, TLS, WAF/DDoS, and DNS. Configure in
the Cloudflare dashboard (or as code via the API/Terraform later); record settings here.

## DNS records (proxied = orange cloud)
| Name | Type | Value | Proxy |
|---|---|---|---|
| `<domain>` (root) | A / AAAA | VPS IP | proxied |
| `dev.<domain>` | A / AAAA | VPS IP | proxied |
| `deploy.<domain>` | A / AAAA | VPS IP | proxied (also behind Access) |
| `*.preview.<domain>` | A / AAAA | VPS IP | proxied (wildcard for PR previews) |

> Lower the TTL before the Vercel→VPS cutover so DNS flips fast (ADR 0006).

## Origin lockdown (zero-trust origin — threat model R7)
- Firewall the VPS so **80/443 accept only Cloudflare IP ranges** (done by `ansible/roles/harden`
  using `cloudflare_ipv4_ranges`/`ipv6_ranges` — refresh from <https://www.cloudflare.com/ips>).
  Alternatively use a **Cloudflare Tunnel** and close 80/443 entirely.
- Set SSL/TLS mode to **Full (strict)** so Cloudflare validates the origin's Let's Encrypt cert.

## Edge settings
- **HSTS** on (the app also sends it); **Always Use HTTPS**; min TLS 1.2.
- Cache static assets aggressively (hashed assets long TTL); **bypass cache** for authenticated
  / `Set-Cookie` / API responses (`@rules/topic-caching.md`).
- WAF + rate limiting on abuse-prone paths (signup/login/checkout — `@rules/std-owasp-api.md`).
- **Cloudflare Access** in front of `deploy.<domain>` (Coolify dashboard) — concrete policy
  (maintainers-only + a scoped Bypass for the GitHub webhook path) in **`access-policy.md`**
  (ADR 0012). Admin also/primarily reachable over the **tailnet** (`topic-tailnet-dev-access`).

## Wildcard TLS for previews
- Coolify/Traefik issues the `*.preview.<domain>` cert via **DNS-01** — create a scoped
  **Cloudflare API token** (DNS edit for the zone only) in the secret store for ACME.

> Secrets (Cloudflare API token) live in the secret store, least-privilege, rotated
> (`@rules/workflow-secrets.md`).
