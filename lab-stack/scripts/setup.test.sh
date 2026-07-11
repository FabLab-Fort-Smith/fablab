#!/usr/bin/env bash
# Regression tests for setup.sh — offline, non-interactive path only (no SSH/VPS/network).
# Verifies inventory.ini + .env are written from the collected values, secrets never leak
# into the connection file, .env is 0600, and re-runs are idempotent.
# Run: bash scripts/setup.test.sh   (or `make test`).
set -euo pipefail
IFS=$'\n\t'

here="$(cd "$(dirname "$0")" && pwd)"
T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT

pass=0; fail=0
ok()  { printf '  ok   - %s\n' "$1"; pass=$((pass+1)); }
bad() { printf '  FAIL - %s\n' "$1" >&2; fail=$((fail+1)); }
try() { desc="$1"; shift; if "$@"; then ok "$desc"; else bad "$desc"; fi; }

# fixture repo tree so setup.sh (which cd's to its ../) operates in the sandbox
mkdir -p "$T/lab-stack/scripts" "$T/lab-stack/ansible/group_vars"
cp "$here/setup.sh" "$here/collect-keys.sh" "$here/gen-secrets.sh" "$here/_lib.sh" "$T/lab-stack/scripts/"
: > "$T/lab-stack/ansible/inventory.example.ini"
printf 'deploy_authorized_keys: []\n' > "$T/lab-stack/ansible/group_vars/all.example.yml"
printf 'LAB_VPS_HOST=\nCOOLIFY_URL=\n' > "$T/.env.example"

run() {
  SETUP_NONINTERACTIVE=1 \
  LAB_VPS_HOST=203.0.113.10 SSH_PORT=2222 SSH_USER=critter SSH_KEY=/home/x/.ssh/id_ed25519 \
  CLOUDFLARE_API_TOKEN=cf_tok_SECRET COOLIFY_URL=https://deploy.example.org COOLIFY_TOKEN=co_tok_SECRET \
  bash "$T/lab-stack/scripts/setup.sh" >/dev/null 2>&1
}

echo "setup.sh regression tests"
run
inv="$T/lab-stack/ansible/inventory.ini"; env="$T/.env"

# inventory carries the connection details
try "inventory has host"  grep -q 'ansible_host=203.0.113.10' "$inv"
try "inventory has user"  grep -q 'ansible_user=critter' "$inv"
try "inventory has port"  grep -q 'ansible_port=2222' "$inv"
try "inventory has key"   grep -q 'ansible_ssh_private_key_file=/home/x/.ssh/id_ed25519' "$inv"

# CRITICAL: secrets must NOT be in the (topology) inventory file
if grep -q 'cf_tok_SECRET\|co_tok_SECRET' "$inv"; then bad "no secrets in inventory"; else ok "no secrets in inventory"; fi

# .env carries host + secrets, and is 0600
try ".env has LAB_VPS_HOST"          grep -q '^LAB_VPS_HOST=203.0.113.10$' "$env"
try ".env has cloudflare token"      grep -q '^CLOUDFLARE_API_TOKEN=cf_tok_SECRET$' "$env"
try ".env has coolify token"         grep -q '^COOLIFY_TOKEN=co_tok_SECRET$' "$env"
try ".env has coolify url"           grep -q '^COOLIFY_URL=https://deploy.example.org$' "$env"
mode="$(stat -c '%a' "$env")"; if [ "$mode" = 600 ]; then ok ".env is 0600"; else bad ".env is 0600 (got $mode)"; fi

# idempotent re-run: values stable, backup made, no duplicate keys
run
try "inventory.bak created on re-run" test -f "$inv.bak"
dupes="$(grep -c '^CLOUDFLARE_API_TOKEN=' "$env" || true)"
if [ "$dupes" = 1 ]; then ok "no duplicate secret keys after re-run"; else bad "no duplicate secret keys (got $dupes)"; fi
try "host still correct after re-run" grep -q '^LAB_VPS_HOST=203.0.113.10$' "$env"

echo "-------- $pass passed, $fail failed --------"
[ "$fail" -eq 0 ]
