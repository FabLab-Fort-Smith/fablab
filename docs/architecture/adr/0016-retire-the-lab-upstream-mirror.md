# ADR 0016 — Retire the The-Lab upstream subtree mirror

- **Status:** Accepted
- **Date:** 2026-09-06

## Context

`lab-site/the-lab` began as a git-subtree import of the standalone `FabLab-Fort-Smith/The-Lab`
repository (the FabLab website, migrated off Vercel — ADR 0005/0006). The intent was to keep a
two-way relationship: develop in the monorepo and periodically push improvements back to the
standalone upstream so it stayed a usable, current copy.

That relationship has not held:

- The monorepo copy has diverged **far ahead** of the upstream mirror — whole programs (admin
  console AC-1..8b, the tiered door-access system, the addon platform, numerous fixes) were built
  here and **never pushed up**.
- The subtree lineage was **squash-severed** during the consolidation, so a clean `subtree pull`/`push`
  no longer round-trips cheaply — reconciling would be a manual, error-prone history operation.
- We have no consumer of the standalone upstream: the FabLab site is deployed **only** from this
  monorepo via Coolify (ADR 0006). The mirror is dead weight, not a delivery target.

Maintaining a divergent mirror we don't ship from is pure cost (drift, confusion about the source of
truth, periodic reconcile toil) with no benefit. Tracked as issue #79; the js-yaml override port
(issue #100) existed only to keep the mirror current.

## Decision

**Retire the upstream subtree mirror. `fablab` (this monorepo) is the single source of truth for
`the-lab`.** We will no longer sync work back to `FabLab-Fort-Smith/The-Lab`.

- No further `subtree push`/`pull` against the standalone repo; no obligation to keep it current.
- Dependency overrides and fixes (e.g. the js-yaml override, #100) live in the monorepo and are **not**
  ported upstream — #100 is closed as mooted.
- The standalone `The-Lab` repo is left as an inert historical snapshot (archive it separately if
  desired); this ADR does not delete it.
- The GitHub org/repo casing `FabLab-Fort-Smith/The-Lab` is intentionally unchanged (per monorepo
  naming rule); this decision concerns the *sync relationship*, not renaming.

## Consequences

- **+** One source of truth. No more divergence tracking, reconcile toil, or ambiguity about where a
  change belongs.
- **+** Removes the recurring "port this upstream too" tax (#100 and its future kin disappear).
- **−** The standalone `The-Lab` repo is now stale by design — anyone who found it via search should be
  pointed here. Mitigation: note it in that repo's README (follow-up, non-blocking) and, if it is not
  needed at all, archive it.
- **−** If a future need arises to publish `the-lab` as a standalone reusable package, that is a
  **fresh extraction** from this monorepo (see the addon-platform productization effort,
  `docs/proposals/addon-platform-productization.md`), not a revival of this subtree link.

## Alternatives considered

- **Promote fablab → upstream (reconcile + push the divergence up).** Rejected: high-effort manual
  history surgery (squash-severed lineage), for a mirror we don't deploy from and have no consumer for.
- **Keep the mirror, port changes periodically.** Rejected: this is the status quo that already failed —
  it silently drifted and cost reconcile toil for no delivery benefit.

## Related

- Issues #79 (this decision), #100 (mooted js-yaml port). ADR 0005/0006 (the-lab consolidation +
  Vercel→Coolify). `docs/proposals/addon-platform-productization.md` (any future standalone extraction
  is a clean productization, not a mirror revival).
