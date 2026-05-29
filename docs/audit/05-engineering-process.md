# Engineering Process & Governance — Remediation Work

**Created:** 2026-05-29
**Status:** Canonical / binding. This is the **single source of truth** for *how* all audit remediation (P0 and beyond) is delivered. Every other audit doc references this file instead of restating the rules, so the policy cannot drift. If a rule changes, change it **here** and nowhere else.

> Applies to all work tracked in [`04-p0-remediation-plan.md`](./04-p0-remediation-plan.md) and any later remediation derived from [`01-security-findings.md`](./01-security-findings.md), [`02-solid-violations.md`](./02-solid-violations.md), and [`03-boundary-violations.md`](./03-boundary-violations.md).

---

## 0. Applicable security standards (binding)

All work governed here must also meet the **[`06-security-standards.md`](./06-security-standards.md)** baseline — *encrypt everything (at rest + in transit), zero secrets in code/logs, no data leakage* — mapped to OWASP ASVS / NIST / PCI-DSS / CIS. The gates in `06` §8 are merged into §5 below, and conformance is part of the §7 Definition of Done.

## 1. Non-negotiable rules

1. **Pull requests only.** No change reaches `main` except through a reviewed, approved pull request. No direct commits/pushes to `main`.
2. **One isolated feature branch per unit of work.** Each Work Item (WI) gets its own branch cut from the latest `main`. This is the rollback unit — reverting one PR rolls back exactly one WI with no entanglement.
3. **No downstream impact.** A change must not alter behavior for any code that depends on the touched code. Public contracts (function signatures, return shapes, route request/response, env var names) are either preserved, or every consumer is updated **within the same PR** and proven unaffected by tests.
4. **Full end-to-end testing.** Every file that is refactored *or otherwise touched* must be covered by end-to-end tests that exercise the real request→logic→datastore→response path. A PR that touches code without E2E coverage for that code does not merge.
5. **Notes stay current.** When a WI completes, its status and PR link are recorded (§7) so the docs never drift from reality.

---

## 2. Branching model

- **Base:** branch from up-to-date `main`; rebase (don't merge `main` into the branch) before opening the PR.
- **Granularity:** **one branch = one Work Item = one PR.** Atomic tasks (`T-#.#.#`) are individual commits inside that branch. A WI that proves too large is split into sub-WIs, each its own branch/PR — never bundle two WIs in one branch.
- **Naming:** `remediation/<epic>-<wi>-<slug>`
  - e.g. `remediation/e2-wi2.1-users-authn`, `remediation/e3-wi3.1-square-failclosed`, `remediation/e1-wi1.3-history-purge`.
- **Commit messages:** prefix with the task ID, e.g. `T-2.1.1: require session in users GET`.
- **Lifetime:** short-lived; open the PR within the WI's effort window and delete the branch on merge.
- **Rollback:** `git revert` of the squashed merge commit restores the prior state for that WI only. Because branches are WI-scoped and downstream-safe (§4), a revert never cascades.

---

## 3. Pull request requirements

Every PR must include (enforced by the template in §6 and CI in §5):

- **Linked finding & WI:** the `SEC-##` / `SOLID` / `BND-##` ID and the `WI-#.#` it closes.
- **Scope statement:** the files touched and why; confirmation it is exactly one WI.
- **Downstream-impact analysis** (§4) — required, even if "none."
- **Test evidence:** the new/updated E2E tests and a passing CI run (§5).
- **Secret/rotation note** where applicable (which secret was rotated, by whom, old value invalidated) — never paste secret values into the PR.
- **Reviews:** ≥1 reviewer; security-relevant PRs (any P0) require a **SEC** approval in addition to a code reviewer.
- **Merge style:** squash-merge, so one PR = one revertible commit on `main`.

A PR does not merge unless: CI green · required approvals present · downstream analysis complete · E2E coverage present for all touched code.

---

## 4. "No downstream impact" — how it's proven

A change is downstream-safe only if **all** of the following hold for the PR:

1. **Contract preservation.** Exported signatures, return shapes, route req/resp schemas, env var names, and DB field semantics are unchanged — **or** every consumer is updated in the same PR.
2. **Consumer audit.** The PR lists every caller/importer of the touched symbols (a repo-wide search of the symbol) and states the effect on each.
3. **Regression proof.** Existing tests still pass unchanged, and new E2E tests assert the prior behavior for unchanged paths.

**Worked example — the `updateUser` signature (LSP-01, E2).** `UserService.updateUser` is currently called with *both* a string id and a query object (`auth.js:118,207,248,358,400,415`; `users/controller.js:151`; `memberships/confirm/route.js:128`). Any E2 PR that normalizes this signature **must update all those call sites in the same branch** and ship E2E tests covering each caller's flow (login/merge, admin update, membership confirm). Splitting the signature change from its callers would violate Rule 3 and is not allowed.

> Note: some remediations *intentionally* change behavior for an attacker (e.g. anonymous CRUD now returns 401). "No downstream impact" means **no impact on legitimate dependent code paths** — those are covered by tests; the closed attack path is the goal, not a regression.

---

## 5. CI gates (required status checks on `main`)

Configured as branch-protection required checks (no merge without green):

1. **Lint** — `npm run lint`.
2. **Unit + integration** — `npm test` (Jest, already configured in `package.json`).
3. **E2E** — the end-to-end suite (§ below) against an ephemeral app + ephemeral MongoDB.
4. **Secret scan** — gitleaks/trufflehog on the diff (also satisfies E1 T-1.5.2).
5. **Coverage gate** — touched files must have E2E coverage (PR fails if a changed route/service has no exercising E2E test).
6. **Data-protection gates** (from `06` §8) — `crypto-lint` (no CBC/ECB/static-IV/`createCipher`/hardcoded keys), `log-leak-scan` (no tokens/PII/secrets in `console.*`), `headers-check`, `tls-config-check`, `response-shape` (no PII/hashes/foreign data in responses), `dep-audit`, `boot-env-validation`.

Branch protection on `main` (target): require PR, require the checks above, require ≥1 (P0: SEC + 1) approvals, disallow force-push.

**Enforcement status (as of 2026-05-29): NOT yet enforced server-side.** Server-enforced branch protection / rulesets are unavailable here for two reasons: (a) GitHub **free plan + private repo** — protection/rulesets require **GitHub Pro/Team** (or a public repo, which we will not do because the repo holds real secrets/PII); and (b) it requires **repo admin** rights, which the automation account does not have. **Action required by a repo admin:** upgrade the org plan, then enable branch protection on `main` (require PR + the green status checks + ≥1 review incl. CODEOWNERS for security paths + linear history, block force-push/deletion), set merge method to **squash-only + auto-delete head branch**, and enable secret-scanning push protection. Until then, the rules are **policy-enforced** via this doc + `CLAUDE.md`, with soft controls: `CODEOWNERS` auto-requests SEC review on PRs, CI checks are visible on every PR, and reviewers must not merge a red PR.

### End-to-end test strategy
- **API routes** (`src/app/api/**`): exercise the real handler over HTTP against an ephemeral MongoDB (`mongodb-memory-server`) — request in, assert status/body **and** the resulting DB state. Tools: Jest + a Next route harness (`next-test-api-route-handler`) or `supertest` against a built server. Each route's authn/authz, happy path, and the specific abuse case from the finding (e.g. `?username=.*`, forged webhook, anonymous unlock) must be asserted.
- **UI / full-stack flows** (auth, membership, dashboard): Playwright against a locally-built app.
- **VPS tier** (`vps/socket-server.js`, orchestrator): integration tests that boot the server and assert unauthenticated calls are rejected and authenticated commands are logged.
- **Definition of "full E2E for a touched file":** every exported entry point in the file has at least one test that reaches it through the real boundary (HTTP/socket), plus the negative/security case tied to its finding.

---

## 6. PR template (add as `.github/pull_request_template.md`)

```markdown
## What & why
- Finding: SEC-## / SOLID-## / BND-##
- Closes Work Item: WI-#.#
- Issues: Refs #<epic>, #<finding>   (use `Closes #<finding>` only if this PR fully satisfies its acceptance — see §9)
- Summary:

## Scope
- [ ] This PR is exactly ONE work item (one branch).
- Files touched:

## Downstream-impact analysis (required)
- Public contracts changed? (signatures/return shapes/route schema/env/DB fields):
- Consumers of touched symbols (repo search) and effect on each:
- [ ] Contracts preserved, OR all consumers updated in this PR.
- [ ] Existing tests pass unchanged.

## End-to-end tests (required)
- [ ] Every touched/refactored file has E2E coverage through the real boundary.
- New/updated E2E tests:
- Security/abuse case asserted (from the finding):
- [ ] **Regression test included** (bug fix / remediation only): reproduces the issue, would FAIL on the old code, PASSES now; names the finding (e.g. SEC-03).

## Secrets / rotation (if applicable)
- Secret rotated: ____  Old value invalidated: [ ]  (no values pasted here)

## Verification
- [ ] CI green (lint, unit, e2e, secret-scan, coverage)
- [ ] SEC approval (required for P0)
```

---

## 7. Definition of Done (applies to every WI, supersedes per-epic DoD)

A Work Item is Done only when **all** hold:

- [ ] Implemented on its own `remediation/<epic>-<wi>-<slug>` branch.
- [ ] Opened as a PR into `main` using the template (§6).
- [ ] Downstream-impact analysis complete and downstream-safe (§4).
- [ ] Full E2E coverage for all touched/refactored files, including the finding's abuse case (§5).
- [ ] **Regression test** present for any bug fix / remediation — reproduces the issue, fails on the old code, passes now, and names the finding.
- [ ] Meets the applicable `06-security-standards.md` sections (crypto/at-rest/in-transit/secrets/authz/no-leakage); data-protection gates (§5.6) green; relevant standard cited if crypto/transport/logging/PII touched.
- [ ] All CI gates green; required approvals (P0: SEC + reviewer) obtained.
- [ ] PR refs its epic + finding issue(s); `Closes #N` used only when acceptance is fully met (§9).
- [ ] Squash-merged to `main`; branch deleted; the closed issue carries the PR link (the identified→remediated trail).
- [ ] Status + PR link + issue # recorded in the register (§8).
- [ ] The relevant `acceptance` in `04-p0-remediation-plan.md` is satisfied.

The per-epic DoD statements in `04-p0-remediation-plan.md` describe the *security outcome*; **this checklist is the *delivery* gate layered on top of every one of them.**

---

## 9. GitHub issues ↔ PRs ↔ changelog

Every identified issue and its remediation is tracked in the **GitHub issues tracker** (`FabLab-Fort-Smith/The-Lab`, private) so PRs, issues, and the changelog stay in lockstep.

**Issue model**
- **Epic tracking issue** per epic (labels `big-picture goal` + the matching `goal: …` label): #7, #8, #9, #10, #23. Body holds the WI checklist.
- **Finding issue** per audit finding (`security` + `audit` + `severity:…` + the matching `goal: …` label), linked to its epic. P0 set: #11–#22; data-protection set: #24–#26 (see `04` "GitHub issue tracking"). Labels mirror the audit severity.
- New findings discovered during work get a new issue (same label scheme) before a fix branch is opened — **no fix without a tracked issue.**

**Labeling convention (plain language — required).** Labels must be human-readable for non-full-time/non-developer contributors. **Do not** use opaque codes (no `epic:E1`, `P0`, etc.). Use:
- `goal: <plain phrase>` for epics (e.g. `goal: secure user accounts`) instead of an epic code,
- `priority: urgent` / `priority: high` instead of `P0`/`P1`,
- `severity: …` with plain descriptions.
Every label carries a plain-English description. Internal codes (Epic E#, SEC-##, WI-#.#) live in the audit **docs** and issue **titles/bodies** for traceability — not in label names.

**Linking rules (required in every PR body, enforced by the §6 template)**
- A PR **refs** the epic and finding issue(s) it advances: `Refs #9, #14`.
- A PR **closes** an issue only when that PR fully satisfies the issue's acceptance: `Closes #14`. For multi-WI findings, only the WI that completes the acceptance (usually the epic's *verify* WI) uses `Closes`; partial PRs use `Refs`. Never let a partial PR auto-close a multi-WI finding.
- When all of an epic's findings are closed, close the epic issue.
- The WI's row in §8 / `04` register records the branch, PR, and issue state.

**Issue lifecycle = "identified → remediated" trail**
1. *Identified:* issue open, labeled, in the `P0 Remediation` milestone.
2. *In progress:* fix branch opened; PR refs the issue (GitHub auto-links the branch/PR on the issue).
3. *Remediated:* PR merged with `Closes #N`; issue closes automatically, carrying the PR link and verification evidence.
A closed issue therefore shows the full story (finding → branch → PR → tests → merge) for audit and changelog purposes.

**Changelog / change notes**
- Release notes are generated **from merged PRs grouped by their closed issues**, within the `P0 Remediation` milestone.
- Each changelog entry cites the finding ID, the issue number, and the PR (e.g. `SEC-03 (#14, PR #NN): Square webhook now fails closed + constant-time compare`).
- Security entries state the *class* of fix, **not** exploit detail or any secret value.
- Recommended automation (optional): GitHub "Generate release notes" or `release-drafter` keyed on the PR↔issue links and labels; milestone close → draft the P0 change note.

## 8. Status register (kept current to prevent drift)

Update this row when a WI's branch/PR changes state. (Same register is mirrored at the top of `04`'s branch table.)

| Work Item | Branch | PR | Status | Merged |
|-----------|--------|----|--------|--------|
| _to be populated as work starts_ | | | not-started | |

> Rule: no WI is marked Done anywhere (this register, `04`, the task tracker) until its PR is merged. If reality and docs disagree, the merged PR wins and the docs are corrected immediately.
