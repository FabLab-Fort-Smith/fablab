#!/usr/bin/env bash
# Best-effort Coolify API helper. Coolify's first-run admin account + API token are one-time UI
# steps; once you have a token this validates connectivity and prints the remaining setup. The
# app (base dir lab-site/the-lab), env vars, and domains are created from code by
# coolify/reconcile.sh (`make coolify-apply`). MongoDB is NOT a Coolify service — it's
# Ansible-managed (roles/mongodb); the app just attaches to the `fablab` network. PR previews are
# configured via the UI/API per lab-stack/coolify/README.md (version-specific — verify endpoints).
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
  1. MongoDB is Ansible-managed (roles/mongodb) — NOT a Coolify service. Ensure the app is
     attached to the `fablab` docker network; MONGODB_URI lives in /etc/fablab/mongo.env.
  2. Add the scoped Cloudflare API token (for *.preview wildcard TLS via DNS-01).
  3. Connect the GitHub App (FabLab-Fort-Smith); select repo: fablab.  [DONE for staging]
  4. Create the application from code: `make coolify-apply` (reconcile.sh):
       - Base Directory = lab-site/the-lab ; build = Dockerfile ; port 3000
       - dev branch → staging.<domain>  [LIVE]  ;  main → production is the later cutover
       - PR preview deployments (*.preview.<domain>) — still to enable
  5. Env secrets are synced by reconcile.sh from ../.env (Square = SANDBOX on staging). Preview
     envs get NO production secrets.
  6. Secure the dashboard: admin + MFA, behind Cloudflare Access.  [DONE — cloudflare/access.sh]
NEXT
echo "✓ Coolify reachable — complete the steps above, then verify per docs/runbooks/bootstrap-vps.md §7."
