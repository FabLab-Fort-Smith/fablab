#!/usr/bin/env bash
# One-time local dev setup (@rules/topic-local-dev.md): enable the repo's git hooks.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
git config core.hooksPath .githooks
echo "✓ git hooks enabled (core.hooksPath=.githooks)."
echo
echo "For full local checks (all optional — CI enforces regardless), install:"
echo "  • gitleaks                         (pre-commit secret scan)"
echo "  • yamllint, ansible-lint           (lab-stack lint)"
echo "  • npm --prefix lab-site/the-lab ci (the-lab eslint hook)"
echo
echo "Commits must be signed: git config commit.gpgsign true (+ a configured signing key)."
