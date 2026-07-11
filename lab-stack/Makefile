# lab-stack task runner (@rules/topic-local-dev.md). Same commands locally and in CI.
# Provisioning targets are NOT run automatically — applying to the real VPS is a GATED action
# (@rules/workflow-gated-actions.md). Run them deliberately.

.DEFAULT_GOAL := help
ANSIBLE_DIR := ansible

.PHONY: help setup deps lint test ping converge converge-check

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

setup: ## Interactive: collect VPS connection + secrets, write config, verify SSH (provider-agnostic)
	bash scripts/setup.sh

deps: ## Install Ansible Galaxy collections
	cd $(ANSIBLE_DIR) && ansible-galaxy collection install -r requirements.yml

lint: ## Lint Ansible + all shell scripts (yamllint/ansible-lint/shellcheck if installed)
	cd $(ANSIBLE_DIR) && ansible-lint || true
	@command -v shellcheck >/dev/null && shellcheck provision.sh cloudflare/*.sh coolify/*.sh scripts/*.sh cloud-init/*.sh 2>/dev/null || echo "(shellcheck not installed — skipping)"

test: ## Run script unit tests (no network / no VPS needed)
	bash scripts/collect-keys.test.sh
	bash scripts/setup.test.sh

ping: ## Verify SSH/connectivity to the VPS (inventory.ini required)
	cd $(ANSIBLE_DIR) && ansible lab_vps -m ping

converge-check: ## Dry-run the playbook (no changes) — review the diff first
	cd $(ANSIBLE_DIR) && ansible-playbook playbook.yml --check --diff

converge: ## GATED: apply host config (harden + docker + coolify + backups) to the VPS
	cd $(ANSIBLE_DIR) && ansible-playbook playbook.yml

dns: ## GATED: create/update Cloudflare DNS for the VPS (deploy/staging/preview; apex untouched)
	bash cloudflare/dns.sh

coolify: ## Validate the Coolify API + print the remaining (UI) setup steps
	bash coolify/bootstrap.sh

provision: ## GATED: run the whole pipeline — preflight -> converge -> dns -> coolify
	bash provision.sh all
