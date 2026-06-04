#!/usr/bin/env bash
# Orchestrate VPS provisioning — scripts everything that can be scripted.
# Stages:  preflight | converge | dns | coolify | all   (default: all)
#
# Scripted here: host hardening + Docker + Coolify install + firewall (Ansible),
#                Cloudflare DNS (API), Coolify API connectivity check.
# Still one-time UI: Coolify admin+MFA, GitHub App install, Cloudflare Access policy.
#
# GATED: converge/dns touch real infra — run deliberately (@rules/workflow-gated-actions.md).
# Reads non-secret + secret config from ../.env (git-ignored) if present.
set -euo pipefail
IFS=$'\n\t'
cd "$(dirname "$0")"   # -> lab-stack/

load_env() { if [ -f ../.env ]; then set -a; . ../.env; set +a; fi; }

preflight() {
  echo "== preflight =="
  local miss=0
  for t in ansible ansible-galaxy ssh curl jq; do
    command -v "$t" >/dev/null 2>&1 || { echo "  ⚠ missing tool: $t"; miss=1; }
  done
  [ -f ansible/inventory.ini ]       || { echo "  ✖ ansible/inventory.ini missing (cp inventory.example.ini)"; exit 1; }
  [ -f ansible/group_vars/all.yml ]  || { echo "  ✖ ansible/group_vars/all.yml missing (cp all.example.yml)"; exit 1; }
  [ "$miss" -eq 0 ] || echo "  (install the missing tools before converge/dns)"
  echo "  • checking SSH reachability…"
  (cd ansible && ansible lab_vps -m ping)
  echo "  ✓ preflight ok"
}

converge() {
  echo "== converge (Ansible: harden + docker + coolify + backups) =="
  cd ansible
  ansible-galaxy collection install -r requirements.yml
  ansible-playbook playbook.yml
  cd ..
}

dns() { echo "== cloudflare dns =="; load_env; bash cloudflare/dns.sh; }
coolify() { echo "== coolify api =="; load_env; bash coolify/bootstrap.sh; }

stage="${1:-all}"
case "$stage" in
  preflight) preflight ;;
  converge)  preflight; converge ;;
  dns)       dns ;;
  coolify)   coolify ;;
  all)       preflight; converge; dns; coolify ;;
  *) echo "usage: $0 [preflight|converge|dns|coolify|all]"; exit 2 ;;
esac
echo "✓ stage '${stage}' complete. Next: finish Coolify UI steps + verify per docs/runbooks/bootstrap-vps.md."
