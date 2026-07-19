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
```
cd lab-stack && make provision-keys ARGS=list
```
Shows each provider, its tier, what it creates, the admin-token env var it needs, and whether that
token is present.

## Tier 2 — API-provisioned (`make provision-keys`)
Needs a **scoped admin token** per provider (in `../.env` / vault). Writes results to `../.env`
(source-safe) — then add them to the vault + the Coolify app.

- **Cloudflare Turnstile** (anti-bot; replaces reCAPTCHA — ADR 0015): `make provision-keys ARGS=turnstile`
  (`ARGS="turnstile --dry-run"` to preview). Requires `CF_TURNSTILE_TOKEN` with **Turnstile:Edit** +
  `CLOUDFLARE_ACCOUNT_ID`. Creates/ensures a widget for `TURNSTILE_DOMAINS`; writes
  `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (BUILD var) + `TURNSTILE_SECRET_KEY` (runtime). Idempotent (reuses
  an existing widget of the same name, rotating its secret to capture it).
- **Planned** (registry entries, same pattern): Cloudflare scoped API tokens, Tailscale auth keys,
  ZeroTier member authorize, PurelyMail mailboxes (adapter exists), S3/object-store access keys.

After provisioning: store the new key(s) in the vault, add to the Coolify app env (mark
`NEXT_PUBLIC_*` as **build** vars), rebuild, verify.

## Tier 3 — console-only (no create API; do by hand, then vault it)
These providers have **no** create-API — automation is impossible regardless of tokens. Create in the
console, then store the values in the vault + Coolify.

- **Google OAuth client** (Google SSO): Google Cloud Console → APIs & Services → Credentials → *Create
  OAuth client ID* (Web). Authorized redirect URIs: `https://<host>/api/auth/callback/google` for each
  environment (staging/prod). → `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` (aka `AUTH_GOOGLE_*`).
- **Discord OAuth app**: Discord Developer Portal → New Application → OAuth2 → add redirect
  `https://<host>/api/auth/callback/discord`. → `DISCORD_CLIENT_ID` + `DISCORD_CLIENT_SECRET`.
- **Square app**: Square Developer Dashboard → application → credentials (sandbox vs production);
  set the webhook + signature key. → `SQUARE_ACCESS_TOKEN`, `SQUARE_WEBHOOK_SIGNATURE_KEY`,
  `NEXT_PUBLIC_SQUARE_APP_ID`, `SQUARE_LOCATION_ID`.
- **Classic reCAPTCHA — DEPRECATED:** being replaced by Cloudflare Turnstile (Tier 2, above). Do not
  create new classic reCAPTCHA keys. (Migration is a separate app PR — swap `react-google-recaptcha`/
  `siteverify` for Turnstile.)

> **OAuth redirect URIs are per-environment** — register the staging, preview, and prod callback URLs
> or SSO fails with `redirect_uri_mismatch` (see the AUTH_URL fix / ADR 0012, and threat-model R3).

## Verification
- Tier 2: `make provision-keys ARGS=list` shows the token present; the new key is in `../.env` and the
  vault; the app (after rebuild) uses it (e.g. Turnstile renders, no test-key banner).
- Tier 3: the console shows the credential; the app boots with it set; SSO/captcha works end-to-end.

## Related
- ADR 0015 (this model + reCAPTCHA→Turnstile); ADR 0014 (vault + secrets-pull); `shared-custody.md`;
  `secret-rotation.md`; `scripts/provision-provider-keys.sh`; `scripts/gen-secrets.sh` (Tier 1).

---
_Last validated: not yet drilled — created 2026-07-19 (Turnstile provisioner tested offline; live run
pending a Turnstile:Edit token). Owner: platform custodians._
