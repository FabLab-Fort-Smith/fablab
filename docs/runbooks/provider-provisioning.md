---
title: Provision provider credentials (keys & tokens)
category: Security
usage: Onboarding a provider / minting a key or token
order: 42
summary: What we auto-provision via API (Tier 2 — `make provision-keys`) vs. what must be created by hand in a vendor console (Tier 3). Created values go into the shared vault.
---

# Runbook: Provision provider credentials

> The three-tier model is ADR 0015. Self-generated app secrets (Tier 1) are `make secrets`
> (`gen-secrets.sh`). This runbook covers **Tier 2** (API-provisioned) and **Tier 3** (console-only).
> Store every created value in the shared vault's Infrastructure collection (ADR 0014); pull with
> `make secrets-pull`. Admin/provisioning tokens are least-privilege and vault-held — never committed.

## See what's automatable
1. Run `cd lab-stack && make provision-keys ARGS=list`. It shows each provider, its tier, what it
   creates, the admin-token env var it needs, and whether that token is present.

## Tier 2 — API-provisioned (`make provision-keys`)
Needs a **scoped admin token** per provider (in `../.env` / vault). The tool writes results to
`../.env` (source-safe) — then you add them to the vault + the Coolify app.

### Cloudflare Turnstile — the anti-bot key (replaces reCAPTCHA, ADR 0015)
**How to get the Turnstile key** — the site key + secret are *minted by this tool*; all you supply is a
scoped Cloudflare API token (a one-time Tier-3/console step) and the account id:
1. **Mint the admin token** (once): Cloudflare dashboard → **My Profile → API Tokens → Create Token →
   Create Custom Token**. Permission: **Account → Turnstile → Edit**. Account Resources: your account.
   Create it, copy the value — this is `CF_TURNSTILE_TOKEN` (a bootstrap credential, least-privilege,
   vault-held, never committed).
2. **Get the account id** (`CLOUDFLARE_ACCOUNT_ID`): dashboard → any domain → Overview → *Account ID*
   in the right rail (or it's in the dashboard URL). Store both in the vault; `make secrets-pull`
   brings them into `../.env`.
3. **Preview**: `make provision-keys ARGS="turnstile --dry-run"` — confirms the token is present and
   shows the widget/domains it would create, writing nothing.
4. **Provision**: `make provision-keys ARGS=turnstile`. It creates/ensures a widget for
   `TURNSTILE_DOMAINS` and writes `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (BUILD var) +
   `TURNSTILE_SECRET_KEY` (runtime) to `../.env`. **Idempotent:** reuses an existing widget of the same
   name; it rotates the secret **only if we don't already hold one** (Cloudflare returns the secret
   only on create/rotate, and a rotate has a **2 h grace window** + needs an app redeploy with the new
   secret — so re-running with the secret already stored is a no-op). To force a rotation, clear
   `TURNSTILE_SECRET_KEY` first.
5. **Store + wire**: add both keys to the vault; add to the staging Coolify app env (mark
   `NEXT_PUBLIC_TURNSTILE_SITE_KEY` as a **build** var); rebuild; drop the old `*_RECAPTCHA_*` vars.

> **Planned** (registry entries, same pattern, not yet implemented): Cloudflare scoped API tokens,
> Tailscale auth keys, ZeroTier member authorize, PurelyMail mailboxes (adapter exists),
> S3/object-store access keys.

## Tier 3 — console-only (no create API; do by hand, then vault it)
These providers have **no** create-API — automation is impossible regardless of tokens. Create in the
console, then store the values in the vault + Coolify.
1. **Google OAuth client** (Google SSO): Google Cloud Console → APIs & Services → Credentials → *Create
   OAuth client ID* (Web). Authorized redirect URIs: `https://<host>/api/auth/callback/google` for each
   environment (staging/prod). → `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` (aka `AUTH_GOOGLE_*`).
2. **Discord OAuth app**: Discord Developer Portal → New Application → OAuth2 → add redirect
   `https://<host>/api/auth/callback/discord`. → `DISCORD_CLIENT_ID` + `DISCORD_CLIENT_SECRET`.
3. **Square app**: Square Developer Dashboard → application → credentials (sandbox vs production);
   set the webhook + signature key. → `SQUARE_ACCESS_TOKEN`, `SQUARE_WEBHOOK_SIGNATURE_KEY`,
   `NEXT_PUBLIC_SQUARE_APP_ID`, `SQUARE_LOCATION_ID`.
4. **Classic reCAPTCHA — DEPRECATED:** being replaced by Cloudflare Turnstile (Tier 2, above). Do not
   create new classic reCAPTCHA keys. (Migration is a separate app PR — swap `react-google-recaptcha`/
   `siteverify` for Turnstile.)

> **OAuth redirect URIs are per-environment** — register the staging, preview, and prod callback URLs
> or SSO fails with `redirect_uri_mismatch` (see the AUTH_URL fix / ADR 0012, and threat-model R3).

## Verification
1. **Tier 2:** `make provision-keys ARGS=list` shows the token present; the new key is in `../.env` and
   the vault; the app (after rebuild) uses it (e.g. Turnstile renders, no test-key banner).
2. **Tier 3:** the console shows the credential; the app boots with it set; SSO/captcha works
   end-to-end.

## Related
- ADR 0015 (this model + reCAPTCHA→Turnstile); ADR 0014 (vault + secrets-pull); `shared-custody.md`;
  `secret-rotation.md`; `scripts/provision-provider-keys.sh`; `scripts/gen-secrets.sh` (Tier 1).

---
_Last validated: not yet drilled — created 2026-07-19 (Turnstile provisioner tested offline; live run
pending a Turnstile:Edit token). Owner: platform custodians._
