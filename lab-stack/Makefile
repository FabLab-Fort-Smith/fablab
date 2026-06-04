# lab-stack task runner (@rules/topic-local-dev.md). Same commands locally and in CI.
# Provisioning targets are NOT run automatically — applying to the real VPS is a GATED action
# (@rules/workflow-gated-actions.md). Run them deliberately.

.DEFAULT_GOAL := help
ANSIBLE_DIR := ansible

.PHONY: help deps lint ping converge converge-check

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

deps: ## Install Ansible Galaxy collections
	cd $(ANSIBLE_DIR) && ansible-galaxy collection install -r requirements.yml

lint: ## Lint Ansible + shell (yamllint/ansible-lint/shellcheck if installed)
	cd $(ANSIBLE_DIR) && ansible-lint || true
	@command -v shellcheck >/dev/null && shellcheck cloud-init/*.yaml 2>/dev/null || true

ping: ## Verify SSH/connectivity to the VPS (inventory.ini required)
	cd $(ANSIBLE_DIR) && ansible lab_vps -m ping

converge-check: ## Dry-run the playbook (no changes) — review the diff first
	cd $(ANSIBLE_DIR) && ansible-playbook playbook.yml --check --diff

converge: ## GATED: apply host config (harden + docker + coolify + backups) to the VPS
	cd $(ANSIBLE_DIR) && ansible-playbook playbook.yml
