# ADR 0003 — Source forges: GitHub + GitLab (mirrored)

- **Status:** Accepted
- **Date:** 2026-06-03

## Context

The deploy must trigger from git push. We use **both GitHub and GitLab** and want deploys to
work regardless of which one a given repo lives on. Coolify supports both (GitHub App and
GitLab via webhooks/deploy keys).

## Decision

Support **both forges**, kept in sync by **mirroring**. One forge is the **primary** (the human
working remote, receives pushes); the other is a **mirror** kept current automatically. Coolify
deploys from the **primary** for each repo. The primary/mirror assignment is an open item
(see Open questions) and may differ per repo.

## Rationale

- Redundancy: if one forge is down or access changes, the codebase and history survive on the
  other.
- Flexibility: contributors on either platform; no hard lock-in.
- Coolify's GitHub App gives the richest integration (PR previews, commit-status posting), so
  **GitHub is the likely primary** for repos that want the full preview UX; GitLab as mirror
  (or primary where preferred).

## Consequences

- **Positive:** resilience + flexibility.
- **Negative / accepted:**
  - **Two webhook paths** into Coolify → two HMAC secrets to manage and rotate
    (`@rules/workflow-secrets.md`); both verified before any build (threat model:
    forge→webhook boundary).
  - Mirroring must be reliable and one-directional to avoid split-brain — define the
    mirror direction explicitly; avoid pushing to the mirror directly.
  - Branch protection, required reviews, and **signed-commit enforcement**
    (`@rules/workflow-git.md`) must be configured on **both** (or at least the primary) so the
    mirror can't become a bypass path.

## Resolved / open

- [x] **Primary = GitHub** (`FabLab-Fort-Smith`); GitLab is the **mirror**. Coolify deploys from
      GitHub via the GitHub App (richest preview/commit-status integration).
- [ ] Mirroring mechanism: GitHub→GitLab push-mirror vs. GitLab pull-mirror vs. a CI step.
- [ ] Self-hosted GitLab, or gitlab.com?

## Alternatives considered

- **Single forge** — simpler (one webhook, one set of protections) but no redundancy; rejected
  given both are already in use.
