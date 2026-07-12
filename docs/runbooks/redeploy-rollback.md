---
title: Redeploy & roll back (Coolify)
category: Deploy & Release
usage: On bad deploy / to redeploy a ref
order: 16
summary: Redeploy the current ref, force a clean rebuild, or roll back to a previous deployment via the Coolify API — with DB-migration and Vercel-rollback caveats.
---

# Runbook: Redeploy & roll back (Coolify)

> Repeatable redeploy/rollback for **the-lab-staging** via the Coolify API (tailnet). Rules:
> `@rules/workflow-release.md`, `@rules/topic-database.md` (migrations), ADR 0006 (Vercel is the
> production rollback during migration).

## When to use
- A deploy regressed (errors, failed health) and you need the previous version back, or
- You want to redeploy the current branch (config change, secret rotation, or a stuck build).

## Prerequisites
- `../.env` with `COOLIFY_URL` (tailnet) + `COOLIFY_TOKEN`. `jq`/`curl`. The app exists
  (`deploy-app.md`).

## Redeploy the current ref
```bash
cd lab-stack
make coolify-apply ARGS=--deploy         # reconcile config/env, then deploy current branch
```
Force a **clean rebuild** (ignore cache) via the API:
```bash
# resolve the app uuid, then force-deploy (token read from .env, off argv)
APP=$(bash coolify/reconcile.sh --dry-run 2>/dev/null | sed -n 's/.*app: the-lab-staging (\([^)]*\)).*/\1/p')
# (or read it from the Coolify UI). Then:
curl -sS -H "Authorization: Bearer $(sed -n "s/^COOLIFY_TOKEN=//p" ../.env | tr -d "\"'")" \
  "http://fablab-prod:8000/api/v1/deploy?uuid=$APP&force=true"
```

## Roll back to a previous deployment
Coolify keeps deployment history per app. To roll back:
1. **UI (simplest):** the app → **Deployments** → pick the last-known-good → **Redeploy**. Coolify
   redeploys that commit/image.
2. **By commit (API/UI):** point the app at the previous good commit and deploy (change the branch
   ref / redeploy that SHA).

> **Database migrations caution** (`@rules/topic-database.md`): rolling the *app* back is safe only
> if schema changes were **backward-compatible** (expand/contract). If a deploy applied a breaking
> migration, do **not** naively roll back the app — forward-fix, or restore per `backup-restore.md`.
> The-Lab's Mongo is on the VPS (ADR 0010); treat schema-affecting releases deliberately.

## Verification
- The app → Deployments: the target deployment is green and **Active**.
- `https://staging.fablabfortsmith.org` serves the expected version; error rate back to normal;
  logs clean (`@rules/topic-logging-observability.md`).

## Abort / escalate
- If redeploy/rollback doesn't recover staging, it does **not** affect production (apex = Vercel,
  ADR 0006) — no customer impact; investigate calmly. For a platform-wide issue, see
  `incident-response.md`.

## Related
- `deploy-app.md`, `backup-restore.md`, `rebuild-coolify-from-code.md`, `incident-response.md`;
  `lab-stack/coolify/reconcile.sh`.

---
_Last validated: never (draft). Owner: platform._
