#!/usr/bin/env bash
# Best-effort Coolify API helper. Coolify's first-run admin account + API token are one-time UI
# steps; once you have a token this validates connectivity and prints the remaining setup. The
# MongoDB service, the app (base dir lab-site/the-lab), env vars, domains, and PR previews are
# created via the UI/API per lab-stack/coolify/README.md — the API surface is version-specific
# (Coolify v4), so verify endpoints against your instance before automating those.
set -euo pipefail
IFS=$'\n\t'

: "${COOLIFY_URL:?set COOLIFY_URL (e.g. https://deploy.fablabfortsmith.org)}"
: "${COOLIFY_TOKEN:?set COOLIFY_TOKEN (Coolify: Keys & Tokens > API token)}"
command -v jq >/dev/null || { echo "jq is required"; exit 1; }
AUTH=(-H "Authorization: Bearer ${COOLIFY_TOKEN}")

echo "• verifying Coolify API at ${COOLIFY_URL} …"
if curl -fsS "${AUTH[@]}" "${COOLIFY_URL}/api/v1/teams" >/dev/null 2>&1; then
  echo "  ✓ token valid; API reachable."
else
  echo "  ✖ could not reach the Coolify API — check COOLIFY_URL, the token, and that the"
  echo "    dashboard's Cloudflare Access / IP allow-list permits this caller."
  exit 1
fi

cat <<'NEXT'

Remaining Coolify setup (UI or API — see lab-stack/coolify/README.md):
  1. MongoDB service on the PRIVATE network (strong root pw; least-priv app user/db).
     → capture the connection string as MONGODB_URI.
  2. Add the scoped Cloudflare API token (for *.preview wildcard TLS via DNS-01).
  3. Connect the GitHub App (FabLab-Fort-Smith); select repo: fablab.
  4. Create application:
       - Base Directory = lab-site/the-lab ; build = Dockerfile
       - production = main branch → staging.<domain> (do NOT bind the apex yet)
       - enable PR preview deployments (*.preview.<domain>)
  5. Paste env secrets (Square = SANDBOX). Preview envs get NO production secrets.
  6. Secure the dashboard: admin + MFA, behind Cloudflare Access / IP allow-list.
NEXT
echo "✓ Coolify reachable — complete the steps above, then verify per docs/runbooks/bootstrap-vps.md §7."
