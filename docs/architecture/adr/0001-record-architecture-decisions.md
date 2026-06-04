# ADR 0001 — Record architecture decisions

- **Status:** Accepted
- **Date:** 2026-06-03

## Context

We are designing a self-hosted "instant deploy" platform (a Vercel replica). The choices
involved (deploy engine, source forge, host, website stack) have real trade-offs and will be
questioned later. We want the *why* preserved, not just the *what*.

## Decision

We will use **Architecture Decision Records** (ADRs), one short immutable file per significant
decision, stored in `docs/architecture/adr/` and numbered sequentially. Format (Nygard-style):
Context · Decision · Consequences · Alternatives. Superseded ADRs are kept and marked, not
deleted.

## Consequences

- Decisions are traceable and reviewable in PRs (`@rules/topic-documentation.md`).
- A small per-decision overhead; worth it for a platform others will operate.

## Alternatives considered

- **No ADRs / decisions in the README** — rejected: README rots and loses the rationale.
- **A wiki** — rejected: we want decisions versioned with the code that implements them.
