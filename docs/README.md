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

### Architecture *(planned)*
- Data model — MongoDB collections and field shapes.
- Integrations — Square / Discord / Google / S3 / Gemini detail.
- Authentication & authorization — the next-auth + session model.
- Access control (IoT tier) — the `vps/` socket-server + orchestrator.

### API *(planned)*
- API conventions + OpenAPI reference for `/api/v1/*`.

### Guides *(planned)*
- Local development · Configuration (env reference) · Deployment · Testing.

### Features *(planned)*
- Auth & onboarding · Memberships & payments · Bounties & rewards · Community.

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

Foundations (this hub, the architecture overview, the template) are shipped. The remaining `*(planned)*` documents — architecture sub-docs, the OpenAPI API reference, guides, and feature docs — are written next (the artifact-level GitHub Wiki reference is shelved pending a subscription decision).

## Changelog
| Date | Change | Author |
|------|--------|--------|
| 2026-05-29 | Documentation hub created; foundations shipped to `docs/` | app dev |
