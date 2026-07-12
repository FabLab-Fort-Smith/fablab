# Cloudflare Access — Coolify dashboard policy

Protects the Coolify dashboard on `deploy.fablabfortsmith.org` so only maintainers reach the UI,
while letting GitHub reach the **webhook** endpoint (which cannot complete an Access challenge).
Implements **ADR 0012** (tailnet-first admin + Cloudflare-gated webhooks). The tailnet
(`http://fablab-prod:8000`) remains the primary private admin path; this governs the public edge.

> **Model:** Cloudflare Access rules attach to an **application (hostname + path)**, not to a path
> within one app. So this is **two path-scoped self-hosted applications** on the same hostname —
> Cloudflare matches the **most-specific path first**:
> 1. **`deploy.fablabfortsmith.org/webhooks`** → **Bypass** (GitHub webhooks; HMAC-verified by Coolify).
> 2. **`deploy.fablabfortsmith.org`** (catch-all) → **Allow** maintainer emails (+ MFA).

## Automated (config-as-code) — preferred
`lab-stack/cloudflare/access.sh` creates both apps via the API (idempotent; auto-resolves the
account id from the zone). It needs an **Access-scoped token** — `Account › Access: Apps and
Policies › Edit` — as `CF_ACCESS_TOKEN` in `../.env` (a **separate** token from the DNS one; do not
widen `CLOUDFLARE_API_TOKEN`). Zero Trust must be enabled with an IdP (built-in **one-time PIN**
works out of the box).

```bash
cd lab-stack
make access ARGS=--dry-run     # preview
make access                    # create the two apps
```
Tune the allowed maintainers with `ACCESS_ALLOWED_EMAILS=a@x,b@y` (default: the owner email).

## App 1 — `coolify-webhooks` (Bypass)
- **Domain/path:** `deploy.fablabfortsmith.org/webhooks` (the Coolify webhook base — confirm the
  exact path Coolify shows when you connect the GitHub App; it's under `/webhooks/`).
- **Policy:** decision **Bypass**, include **Everyone**. Safe because Coolify **HMAC-verifies** every
  webhook against the per-source secret (`@rules/topic-webhooks.md`). **Never** bypass the whole host.
- **Optional hardening:** add an IP-ranges rule = GitHub's hook ranges (`api.github.com/meta` →
  `.hooks`); GitHub rotates these, so treat HMAC as the real control.

## App 2 — `coolify-dashboard` (Allow)
- **Domain:** `deploy.fablabfortsmith.org` (catch-all — the UI/API).
- **Policy:** decision **Allow**, include **Emails** = the maintainers
  (`john.annis@fablabfortsmith.org`, +others or an IdP group), **require MFA**. Everything else denied.

## Manual (Zero Trust dashboard) — equivalent
1. **Zero Trust → Access → Applications → Add → Self-hosted.**
2. App 1: domain `deploy.fablabfortsmith.org`, **path `/webhooks`** → policy **Bypass / Everyone**.
3. App 2: domain `deploy.fablabfortsmith.org` (no path) → policy **Allow**, maintainer emails, require MFA.
4. Cloudflare serves the most-specific path first, so `/webhooks/*` bypasses and the rest is gated.

## Verify
- Browser → `https://deploy.fablabfortsmith.org` → Access login → then Coolify login + MFA.
- `curl -sS -o /dev/null -w '%{http_code}' https://deploy.fablabfortsmith.org/webhooks/...` → **not**
  an Access redirect. **Critical:** confirm push-to-deploy still works (a push to `dev` auto-deploys)
  — a too-broad Allow app would break the webhook.

## Related
- ADR 0012; `access.sh`, `dns.sh`, `README.md` (this dir); `@rules/topic-webhooks.md`,
  `@rules/std-zero-trust.md`, `@rules/topic-tailnet-dev-access.md`.
