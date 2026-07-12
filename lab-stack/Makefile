# lab-stack task runner (@rules/topic-local-dev.md). Same commands locally and in CI.
# Provisioning targets are NOT run automatically — applying to the real VPS is a GATED action
# (@rules/workflow-gated-actions.md). Run them deliberately.

.DEFAULT_GOAL := help
ANSIBLE_DIR := ansible

.PHONY: help setup secrets deps lint test ping converge converge-check ssh-ca-init ssh-ca-sign racknerd coolify-plan coolify-apply dns access

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

setup: ## Interactive connectivity+config; auto-generates local secrets (ARGS=-r to rotate)
	bash scripts/setup.sh $(ARGS)

secrets: ## Generate/ensure local service+app secrets in ../.env (non-destructive; ARGS=--force to rotate)
	bash scripts/gen-secrets.sh $(ARGS)

deps: ## Install Ansible Galaxy collections
	cd $(ANSIBLE_DIR) && ansible-galaxy collection install -r requirements.yml

lint: ## Lint Ansible + all shell scripts (yamllint/ansible-lint/shellcheck if installed)
	cd $(ANSIBLE_DIR) && ansible-lint || true
	@command -v shellcheck >/dev/null && shellcheck provision.sh cloudflare/*.sh coolify/*.sh scripts/*.sh cloud-init/*.sh racknerd/*.sh 2>/dev/null || echo "(shellcheck not installed — skipping)"

test: ## Run script unit tests (no network / no VPS needed)
	bash scripts/collect-keys.test.sh
	bash scripts/setup.test.sh
	bash scripts/gen-secrets.test.sh
	bash ssh-ca/sign-ssh-cert.test.sh
	bash racknerd/api.test.sh

ping: ## Verify SSH/connectivity to the VPS (inventory.ini required)
	cd $(ANSIBLE_DIR) && ansible lab_vps -m ping

converge-check: ## Dry-run the playbook (no changes) — review the diff first
	if [ -f ../.env ]; then set -a; . ../.env; set +a; fi; cd $(ANSIBLE_DIR) && ansible-playbook playbook.yml --check --diff

converge: ## GATED: apply host config (harden + docker + mongodb + coolify + backups) to the VPS
	if [ -f ../.env ]; then set -a; . ../.env; set +a; fi; cd $(ANSIBLE_DIR) && ansible-playbook playbook.yml

dns: ## GATED: create/update Cloudflare DNS for the VPS (deploy/staging/preview; apex untouched)
	bash cloudflare/dns.sh

access: ## GATED: apply Cloudflare Access to the Coolify dashboard (webhooks bypass + maintainers-only). ARGS=--dry-run
	bash cloudflare/access.sh $(ARGS)

coolify: ## Validate the Coolify API + print the remaining (UI) setup steps
	bash coolify/bootstrap.sh

coolify-plan: ## Preview the Coolify app reconciliation (dry-run; no writes) — API over the tailnet
	bash coolify/reconcile.sh --dry-run

coolify-apply: ## Reconcile the Coolify app from code (create/update + env sync). ARGS=--deploy to also deploy
	bash coolify/reconcile.sh $(ARGS)

provision: ## GATED: run the whole pipeline — preflight -> converge -> dns -> coolify
	bash provision.sh all

ssh-ca-init: ## Generate an OFFLINE SSH CA keypair (ssh-ca/fablab_ssh_ca[.pub]); private key is git-ignored
	@test -f ssh-ca/fablab_ssh_ca && { echo "CA key already exists — refusing to overwrite"; exit 1; } || true
	ssh-keygen -t ed25519 -f ssh-ca/fablab_ssh_ca -C fablab-ssh-ca -N ""
	@echo "CA public key (put in group_vars ssh_ca_public_key):" && cat ssh-ca/fablab_ssh_ca.pub

ssh-ca-sign: ## Mint a short-lived cert: make ssh-ca-sign PUB=agent.pub ROLE=ops ID=agent:name [TTL=15m]
	bash ssh-ca/sign-ssh-cert.sh --ca ssh-ca/fablab_ssh_ca --pubkey "$(PUB)" --role "$(ROLE)" --identity "$(ID)" $(if $(TTL),--ttl $(TTL),)

racknerd: ## RackNerd SolusVM API (control-plane): make racknerd ARGS="ip|status|info|reboot --yes"
	bash racknerd/api.sh $(ARGS)
