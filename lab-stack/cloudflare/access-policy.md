# Cloudflare Access — Coolify dashboard policy

Protects the Coolify dashboard on `deploy.fablabfortsmith.org` so only maintainers reach the UI,
while letting GitHub reach the **webhook** endpoint (which cannot complete an Access challenge).
Implements **ADR 0012** (tailnet-first admin + Cloudflare-gated webhooks). The tailnet
(`http://fablab-prod:8000`) remains the primary private admin path; this governs the public edge.

> **Model:** two policies on one Access application, evaluated **top-down, first match wins** —
> so the narrow **Bypass** for the webhook path must sit **above** the **Allow** for everything else.

## Application

| Field | Value |
|---|---|
| Type | Self-hosted |
| Application domain | `deploy.fablabfortsmith.org` (path `/` = whole host) |
| Session duration | 24h (or shorter) |
| App Launcher | off |

## Policies (order matters — top first)

**1. `coolify-webhooks` — Action: Bypass**
- **Purpose:** let GitHub POST deploy/PR events; it can't satisfy Access.
- **Path:** scope to the webhook path only — `/webhooks/*` (confirm the exact path Coolify shows
  when you connect the GitHub App; it is under `/webhooks/`). **Never** bypass the whole app.
- **Include:** `Everyone` (the path is the scope). Safe because Coolify **HMAC-verifies** each
  webhook against the per-source secret (`@rules/topic-webhooks.md`).
- **Optional hardening:** add an **IP ranges** rule = GitHub's hook ranges (from
  `https://api.github.com/meta` → `.hooks`) so only GitHub can hit the bypassed path. GitHub rotates
  these, so treat HMAC as the real control and the IP list as belt-and-suspenders.

**2. `maintainers-only` — Action: Allow**
- **Path:** `/` (everything else — the UI/API).
- **Include:** **Emails** = the maintainers (`john.annis@fablabfortsmith.org`, plus any other
  maintainer) — or an **IdP group** if you wire SSO.
- **Require:** MFA (e.g. `Authentication method` / `require MFA`), matching the account MFA posture.
- Everything not matched is denied by default.

## Configure it — Zero Trust dashboard (fastest)

1. **Cloudflare dashboard → Zero Trust → Access → Applications → Add an application → Self-hosted.**
2. Set the **application domain** to `deploy.fablabfortsmith.org`.
3. Add **policy 1** (Bypass, path `/webhooks/*`, Everyone) — put it **first**.
4. Add **policy 2** (Allow, maintainer emails, require MFA).
5. Save. Test: the UI prompts for Access login; `curl https://deploy.fablabfortsmith.org/webhooks/...`
   is not challenged (returns Coolify's handler, which then HMAC-checks).

> One-time setup requires a Zero Trust (Access) identity provider configured (the built-in
> **one-time PIN** email works out of the box; wire an IdP later for SSO).

## Configure it — as code (optional)

Access is account-scoped, so a **separate token** from the DNS one is needed:
`Account › Access: Apps and Policies › Edit` (+ `Account › Access: Organizations, Identity Providers
and Groups › Read`). Do **not** widen the `Zero:DNS:Edit` DNS token; keep a distinct
`CF_ACCESS_TOKEN` in the secret store.

- **Terraform:** `cloudflare_zero_trust_access_application` + two
  `cloudflare_zero_trust_access_policy` resources (precedence 1 = bypass `/webhooks/*`, 2 = allow
  emails). Preferred for reproducibility if we codify Access.
- **API:** `POST /accounts/{account_id}/access/apps` then `.../apps/{app_id}/policies` (decision
  `bypass` then `allow`). See Cloudflare API docs.

> Not scripted here yet (needs the broader token). If we codify it, add a `cloudflare/access.sh`
> or Terraform module and reference it from `README.md`.

## Verify

- Browser → `https://deploy.fablabfortsmith.org` → Access login → then Coolify login + MFA.
- `curl -s -o /dev/null -w '%{http_code}' https://deploy.fablabfortsmith.org/webhooks/<path>` → not
  an Access redirect (reaches Coolify). A push to `dev` triggers a staging deploy.
- The **tailnet** path (`http://fablab-prod:8000`) still works regardless of Access.

## Related
- ADR 0012; `dns.sh`, `README.md` (this dir); `@rules/topic-webhooks.md`, `@rules/std-zero-trust.md`,
  `@rules/topic-tailnet-dev-access.md`.
