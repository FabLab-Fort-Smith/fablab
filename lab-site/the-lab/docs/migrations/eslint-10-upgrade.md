# ESLint upgrade: 9 → 10 (issue #118, deferred from Dependabot #86)

**Status:** Planned, **blocked upstream**. `eslint@^9` and `eslint-config-next@16.2.6` stay pinned until a compatible `eslint-config-next` ships.
**Working branch:** `chore/eslint-10-upgrade`. **Tracking issue:** #118.
**Priority:** Low — dev tooling only, **not a security alert** (no CVE). Lint runs locally and in CI; this does not affect runtime, members, or payments.

## Rollback checkpoint & safety net
- **Anchor:** tag **`checkpoint/pre-eslint-10`** → `main@648a232` (known-good with eslint 9). This branch is cut from that anchor.
- **Pre-merge rollback:** `git reset --hard checkpoint/pre-eslint-10`, or abandon the branch — `main` keeps eslint 9.
- **Post-merge rollback:** revert the single squash-merge commit (`git revert <sha>`); `package.json`/lockfile and `eslint.config.mjs` return to eslint 9. Lint is a dev gate, so a bad upgrade has **no production blast radius** — worst case the `Lint` CI check is red until reverted.

## Why this is blocked (verified, 2026-05-30)
Bumping to eslint `10.4.1` against the current config fails immediately:
```
Oops! Something went wrong! :(
ESLint: 10.4.1
TypeError: scopeManager.addGlobals is not a function
    at addDeclaredGlobals (.../eslint/lib/languages/js/source-code/source-code.js:221)
```
**Root cause:** `eslint-config-next@16.2.6` (and the plugins it bundles — `@next/eslint-plugin-next`, the React/hooks plugins) are built against the eslint 9 API. `SourceCode`/`ScopeManager` internals changed in eslint 10 (`addGlobals` removed/renamed), so any config that loads config-next crashes on the first file.

**Therefore the gating prerequisite is upstream:** an `eslint-config-next` release that declares eslint 10 support (`peerDependencies: eslint: "^9 || ^10"`). This tracks a future Next.js minor — we cannot unblock it from this repo. **Do not** attempt to work around it by pinning config-next's transitive plugins; that fights the framework and breaks `next` lint integration.

## Current lint setup (what the upgrade must preserve)
`eslint.config.mjs` is a **flat config** that:
- spreads `eslint-config-next/core-web-vitals` (native flat — no `FlatCompat` shim),
- **ignores the Hack the Lab CTF zones** (CLAUDE.md §14) — holodeck/terminal/arcade paths,
- **disables the React Compiler hook rules** (`react-hooks/immutability`, `set-state-in-effect`, `static-components`, `purity`, `preserve-manual-memoization`, `incompatible-library`) to hold the lint surface steady — adopting those is a separate effort tied to lint-debt #53.

Any upgrade must keep all three behaviours intact, or the lint gate's scope silently changes.

## eslint 10 breaking changes to expect (beyond config-next)
- **Flat config only** — `.eslintrc*` and `eslintrc` env settings are fully removed. We're already flat-config, so low impact — but confirm no transitive `FlatCompat` usage reappears.
- **Node engine:** eslint 10 requires Node `^20.19 || ^22.13 || >=24`. CI uses `node-version: 20` (resolves to latest 20.x ≥ 20.19 ✓) — but **pin/verify** the runner picks ≥ 20.19, and consider bumping CI to Node 22 LTS.
- **Removed formatters & deprecated rules/options** — we use `next lint`’s default formatter and no custom formatters, so low impact; still re-run to surface any deprecated-rule warnings.
- **Default rule/parser changes** — diff the effective config with `eslint --inspect-config` before vs. after to catch any rule that silently turns on/off.

## Phased execution (each phase ends with a green lint; tag `checkpoint/eslint-10-p<N>`)
0. **P0 — Unblock gate (no code).** Watch `eslint-config-next` releases for eslint 10 support (peer range `^9 || ^10`). Until then this branch holds only this plan. *No further phase runs until P0 clears.*
1. **P1 — Joint bump.** On this branch, bump `eslint ^9 → ^10` **and** `eslint-config-next` → the compatible release **together** in one commit (`npm install`, commit the lockfile). They must move as a pair — bumping either alone breaks.
2. **P2 — Reconcile config.** Run `npm run lint`. Fix flat-config breakage; re-assert the CTF ignores and the disabled `react-hooks/*` rules still apply under config-next's new version (rule names/plugin may have shifted). Compare `eslint --inspect-config` output against the pre-upgrade baseline; explicitly re-disable anything newly turned on (don't silently expand the lint surface — keep this a tooling bump, not a rule-set change, per the existing config comment). → `checkpoint/eslint-10-p2`
3. **P3 — Verify.** `npm run lint` → **0 errors** (pre-existing warnings unchanged); confirm the `Lint (enforced)` CI gate is green on the PR. Spot-check that CTF zones are still ignored and real app code is still linted.
4. **P4 — Merge.** Squash-merge; pin eslint + config-next to exact tested versions.

## Validation checklist (before merge)
- [ ] `eslint-config-next` release supports eslint 10 (peer `^9 || ^10`) — P0 prerequisite
- [ ] `eslint` + `eslint-config-next` bumped together; lockfile pinned
- [ ] `npm run lint` → 0 errors; warning count not worse than the eslint 9 baseline
- [ ] CTF `ignores` still applied; `react-hooks/*` compiler rules still off (no surprise rule activations — verified via `--inspect-config` diff)
- [ ] CI Node runner ≥ 20.19 (or bumped to 22 LTS)
- [ ] `Lint (enforced)` CI check green

## Risk register
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| config-next never ships eslint 10 support on our Next line | Medium | Low | Stay on eslint 9 (no security exposure); revisit at next Next.js upgrade |
| Upgrade silently changes which rules are active | Medium | Medium | `eslint --inspect-config` diff in P2; explicit re-disable list |
| Bumping eslint alone (without config-next) | High if rushed | Medium | P1 mandates a joint bump; CI lint gate catches it |
| CI Node too old for eslint 10 | Low | Low | Verify/bump `node-version` in `.github/workflows/ci.yml` |

## Estimated effort
Small once unblocked (a joint version bump + config reconciliation + lint verify). The cost is **waiting on upstream**, not the work itself.
