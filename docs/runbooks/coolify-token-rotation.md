---
title: Rotate the Coolify API token
category: Secrets & Access
usage: Token expired/revoked, suspected exposure, or scheduled rotation
order: 45
summary: Mint a new Coolify API token, validate it against the API before writing it anywhere, store it in .env + the shared vault, verify with reconcile.sh, then revoke the old one.
---

# Runbook: Rotate the Coolify API token

> The Coolify API token is what lets `lab-stack/coolify/*.sh` manage the application from code
> (ADR 0012, over the tailnet). It is a **Laravel-Sanctum token of the form `<id>|<secret>`** —
> a numeric id, a literal `|`, then ~40 characters.
>
> **Why this has its own runbook:** when this token dies, every call fails with a bare
> `{"message":"Unauthenticated."}` / HTTP 401 and **all config-as-code and deploys stop** — with no
> other symptom. Coolify itself keeps answering (a `302` on `/`, `401` on `/api/v1/*`), so the
> platform looks healthy while nothing can be changed. Rules: `@rules/workflow-secrets.md`,
> `@rules/topic-config-environments.md`.

## When to use
- `reconcile.sh` (or any `coolify/*.sh`) fails with **HTTP 401 / `Unauthenticated.`**
- The token was revoked, reset out-of-band, or is suspected exposed (treat any token that reached
  a log, a chat message, or source control as compromised — rotate, don't just delete).
- Scheduled rotation per the cadence table in `secret-rotation.md` §D.

## NOT for
- The Coolify **dashboard login** password or MFA — that is a human credential; see
  `shared-custody.md`.
- App secrets (`AUTH_SECRET`, `ENCRYPTION_KEY`, …) — see `secret-rotation.md` §C.

## Prerequisites & access
- Coolify admin login + MFA. Primary admin path is the **tailnet**: `http://fablab-prod:8000`
  (bypasses Cloudflare Access). Public `https://deploy.<domain>` also works but is gated by
  Cloudflare Access (maintainer email + MFA).
- `jq`, `curl` locally; `bw` (Bitwarden CLI) + ZeroTier up for the vault step.
- Write access to `../.env` (git-ignored).

## Steps

1. **Mint the new token.** In Coolify: avatar (top-right) → **Keys & Tokens** → **API Tokens** →
   **Create New Token**. Name it traceably, e.g. `fablab-automation-<YYYY-MM>`.
2. **Grant only the abilities the automation needs: `read` + `write` + `deploy`** (least privilege —
   master §1; do not pick `root`). Add `read:sensitive` only if you want existing env *values*
   readable back. The tooling calls: `GET projects`, `GET projects/{uuid}`, `GET servers`,
   `GET github-apps`, `GET applications` (read); `PATCH applications/{uuid}`,
   `PATCH applications/{uuid}/envs/bulk`, `POST applications/private-github-app` (write);
   `GET deploy?uuid=…` (deploy).
3. **Copy the whole token now** — Coolify shows it **once**. Use the copy button, not a text
   selection. Sanity-check the shape before leaving the page: it must contain the `|` and be
   roughly 48–52 characters. A short value with no pipe is a truncated copy — mint a fresh one
   rather than trying to reconstruct it.
4. **Validate BEFORE writing it anywhere** (a bad token silently breaks deploys):
   ```bash
   read -rs -p 'new token: ' T; echo          # hidden; never on argv or in shell history
   curl -sS -o /dev/null -w '%{http_code}\n' --max-time 25 \
     -H "Authorization: Bearer $T" -H 'Accept: application/json' \
     http://fablab-prod:8000/api/v1/projects
   ```
   Expect **`200`**. A `401` means the value is wrong/truncated — go back to step 1.
5. **Confirm scope**, not just authentication — all of these must return `200`:
   ```bash
   for ep in projects servers github-apps applications; do
     printf '%s -> ' "$ep"
     curl -sS -o /dev/null -w '%{http_code}\n' --max-time 25 \
       -H "Authorization: Bearer $T" -H 'Accept: application/json' \
       "http://fablab-prod:8000/api/v1/$ep"
   done
   ```
6. **Write it to `../.env`, single-quoted.** The `|` is a shell metacharacter — an unquoted value
   breaks `.`-sourcing and quote-stripping reads (this has bitten us: PR #67):
   ```bash
   cp -a ../.env ../.env.bak && chmod 600 ../.env.bak
   # edit ../.env so the line reads exactly:
   #   COOLIFY_TOKEN='<id>|<secret>'
   chmod 600 ../.env
   ```
7. **Verify end-to-end with the real tooling** — this proves discovery of project, server, GitHub
   App, and the app UUID, and makes no changes:
   ```bash
   cd lab-stack && bash coolify/reconcile.sh --dry-run
   ```
   Expect the `== discover ==` line with all four UUIDs, then a `== DRY-RUN plan ==` section.
8. **Store it in the shared vault** so custody is not single-person (`shared-custody.md`) and
   `make secrets-pull` can retrieve it. Item: **`Coolify API token — fablab-prod`** in
   `Default collection/Infrastructure`, with a hidden custom field named exactly `COOLIFY_TOKEN`
   (the field name is what `scripts/secrets-pull.sh` matches on: `^[A-Z][A-Z0-9_]+$`).
9. **Revoke the old token** in Coolify → Keys & Tokens → delete the previous entry. Do this only
   after step 7 passes, so you always have one working token.
10. **Record the rotation** — note the date + token name in `shared-custody.md`, and update the
    `Last validated` line at the bottom of this runbook.

## Verification
- `bash coolify/reconcile.sh --dry-run` succeeds (no `401`, all UUIDs discovered).
- A real reconcile applies cleanly: `cd lab-stack && make coolify-apply`.
- `make secrets-pull --dry-run` lists `COOLIFY_TOKEN` as available from the vault.
- The old token no longer authenticates (`401`) — confirm you revoked the right one.

## Rollback / abort
- The previous token still works until step 9, so revert by restoring `../.env.bak` (or re-writing
  the old value) — no downtime.
- If you already revoked the old token and the new one fails, mint another from the dashboard; the
  dashboard login is independent of the API token, so you are never locked out of Coolify by this.

## Escalation
- Cannot reach the dashboard at all: check Tailscale (`tailscale status`), then Cloudflare Access
  for the public path. Break-glass is the RackNerd console (`safe-remote-change.md`).
- Coolify answers `302` on `/` but every `/api/v1/*` is `401` even with a fresh token → suspect
  instance-side auth/DB trouble, not the token; check the Coolify container logs on the host.

## Related
- `secret-rotation.md` §D (provider tokens, cadence) · `deploy-app.md` · `redeploy-rollback.md`
- `shared-custody.md` (who holds what) · `rebuild-coolify-from-code.md`
- `@rules/workflow-secrets.md`, `@rules/workflow-gated-actions.md`

---
_Last validated: 2026-08-03 (rotated after an out-of-band reset; token validated, written to `.env`,
vaulted, and confirmed with `reconcile.sh --dry-run`). Owner: b007ab1e._
