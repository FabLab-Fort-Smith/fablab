---
title: Documentation
status: current
audience: developers, operators, contributors, reviewers
owners: app dev
last_reviewed: 2026-05-29
related:
  - architecture/overview.md
  - templates/DOCUMENT-TEMPLATE.md
---

# The-Lab — Documentation

> **Status:** Current — the documentation hub. Cross-document links use HTML anchors so they render as clickable links on GitHub.
> **Audience:** Anyone working on or operating The-Lab.  ·  **Last reviewed:** 2026-05-29

## Overview

**The-Lab** is the membership, community, and physical-access platform for **Fab Lab Fort Smith**, a community makerspace. It is a single **Next.js 16** application (web + API) backed by **MongoDB**, with a separate **VPS tier** that controls the lab's IoT door/equipment hardware and the "Hack the Lab" CTF mission containers. It integrates Square (payments), Discord and Google (auth/messaging), AWS-compatible S3 (uploads), and Google Gemini (image generation).

This hub indexes the project's documentation. Start with the <a href="architecture/overview.md">Architecture Overview</a> for the system's shape, then drill into the area you need.

## Documentation map

### Foundations
- <a href="architecture/overview.md">Architecture Overview</a> — system topology, the layered `route → controller → service → model → database` pattern, auth, data, payments, the IoT tier, integrations, and deployment.
- <a href="templates/DOCUMENT-TEMPLATE.md">Document Template</a> — the house style every doc follows.

### Architecture
- <a href="architecture/data-model.md">Data model</a> — MongoDB collections and field shapes.
- <a href="architecture/integrations.md">Integrations</a> — Square / Discord / Google / S3 / Gemini detail.
- <a href="architecture/auth.md">Authentication & authorization</a> — the next-auth + session model.
- <a href="architecture/access-control-iot.md">Access control (IoT tier)</a> — the `vps/` socket-server + orchestrator.

### API
- <a href="api/README.md">API conventions</a> + <a href="api/openapi.yaml">OpenAPI reference</a> for `/api/v1/*`.

### Guides
- <a href="guides/local-development.md">Local development</a> · <a href="guides/configuration.md">Configuration (env reference)</a> · <a href="guides/deployment.md">Deployment</a> · <a href="guides/testing.md">Testing</a>.

### Features
- <a href="features/auth-onboarding.md">Auth & onboarding</a> · <a href="features/memberships-payments.md">Memberships & payments</a> · <a href="features/bounties-rewards.md">Bounties & rewards</a> · <a href="features/community.md">Community</a>.

### Operations & security
- <a href="security/INCIDENT-RESPONSE.md">Incident response runbook</a>
- <a href="security/sec-01-credential-purge-runbook.md">SEC-01 credential rotation + history-purge runbook</a>
- <a href="migrations/sec-23-pii-encryption-gcm-blind-index.md">SEC-23 PII-encryption migration plan</a>
- <a href="migrations/square-v44-migration.md">Square SDK v44 migration plan</a>

### Reference & history
- <a href="audit/06-security-standards.md">Security standards</a> (binding) · <a href="audit/05-engineering-process.md">Engineering process</a> (binding)
- <a href="audit/00-executive-summary.md">2026-05 security audit</a> (findings, SOLID/boundary reviews, remediation plan)
- <a href="game/GAME_DESIGN.md">"Hack the Lab" CTF design docs</a> — intentional game content

## Conventions

- All docs follow the <a href="templates/DOCUMENT-TEMPLATE.md">template</a>: frontmatter, a status/audience banner, and a Changelog.
- **Internal links are HTML anchors** (`<a href="…">`) — mixed HTML+Markdown renders correctly on GitHub and keeps doc-to-doc navigation reliably clickable.
- Source references use `path/to/file.js:line`.
- The engineering and secure-SDLC rules in <a href="../CLAUDE.md">CLAUDE.md</a> are authoritative for changes.

## Status

Foundations (this hub, the architecture overview, the template) plus the architecture sub-docs, the OpenAPI API reference, the guides, and the feature docs are all shipped (the artifact-level GitHub Wiki reference is shelved pending a subscription decision).

## Changelog
| Date | Change | Author |
|------|--------|--------|
| 2026-05-29 | Documentation hub created; foundations shipped to `docs/` | app dev |
| 2026-05-29 | Linked architecture, API, guides, and feature docs (removed `(planned)` markers) | app dev |
