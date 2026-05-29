# P0 Remediation Plan — The-Lab

**Created:** 2026-05-29
**Source:** P0 row of the roadmap in [`00-executive-summary.md`](./00-executive-summary.md). Findings referenced from [`01-security-findings.md`](./01-security-findings.md) and [`03-boundary-violations.md`](./03-boundary-violations.md).
**Status:** Plan only — no code has been changed. This document is the work-breakdown structure to be executed next.

> **Delivery is governed by [`05-engineering-process.md`](./05-engineering-process.md) (binding).** In short: **PRs into `main` only**; **one isolated feature branch per Work Item** (the rollback unit; revert one PR → roll back one WI); **no downstream impact** (contracts preserved or all consumers updated in the same PR, with a documented consumer audit); **full end-to-end tests on every touched/refactored file** including the finding's abuse case. The per-epic DoD below states the *security outcome*; the §7 delivery checklist in `05` is layered on top of every WI. The branch/PR register is in §"Branch & PR register" below and mirrored in `05` §8.

## How this is structured
- **Epic** (`E#`) — a containment goal mapping to one P0 theme. Has a Definition of Done (DoD).
- **Work Item** (`WI-#.#`) — a coherent chunk of work inside an epic.
- **Task** (`T-#.#.#`) — the smallest atomic unit: one file or one discrete action, independently verifiable.

Each task lists: **action · file(s) · acceptance · depends-on · owner · effort**.
Owners: **SEC** (security), **DEV** (app dev), **OPS** (devops/infra). Effort: **S** ≤30 min · **M** ≤½ day · **L** ≥½ day.

> **Sequencing rule:** rotate/secret tasks (E1, E3, E4 secrets) are independent of code locks (E2) and can run in parallel by different owners. Within an epic, follow `depends-on`. **Credential/secret rotation must precede or accompany history purge — never the reverse** (assume anything committed is already compromised).

---

## Epic index

| Epic | Theme | Findings | DoD |
|------|-------|----------|-----|
| **E1** | Contain leaked DB credential | SEC-01, BND-08 | Old `critter` cred invalid, removed from tree + history, DB not publicly reachable, scanning in place |
| **E2** | Lock down user API | SEC-02, SEC-12 | No anonymous access to `users/*`; no client-set `role`/`membership`; regex injection closed; tests green |
| **E3** | Kill fail-open trust & hardcoded secrets | SEC-03, SEC-04, SEC-06, SEC-07, SEC-13 (+16/17 adjacent) | No `|| 'secret'` fallbacks; app fails closed/fast on missing secrets; all affected secrets rotated |
| **E4** | Authenticate IoT control boundary | SEC-05, SEC-11, BND-06 | Device endpoints reject unauthenticated calls; app↔socket mutually authenticated; commands audit-logged |

---

## E1 — Contain the leaked database credential
**Finding:** SEC-01 (`list-dbs.js:3`, `debug-leaderboard.js:3` hold `mongodb://critter:Zapatas2024@23.94.251.158:27017/...`).
**DoD:** the exposed credential no longer authenticates anywhere, is absent from working tree and git history, the DB is network-restricted, and secret-scanning prevents recurrence.

### WI-1.1 — Rotate the credential
| Task | Action | File / target | Acceptance | Depends | Owner | Eff |
|------|--------|---------------|------------|---------|-------|-----|
| T-1.1.1 | Inventory every place `MONGODB_URI`/`critter` cred is consumed | repo grep + deploy env | Written list of consumers (app env, 2 scripts, any CI) | — | SEC | S |
| T-1.1.2 | Create a new **least-privilege** Mongo user for the app (not `admin`/`authSource=admin`) | MongoDB | New user with scoped role on the app DB only | T-1.1.1 | OPS | M |
| T-1.1.3 | Store new `MONGODB_URI` in the secrets manager / deployment env | deploy env | New URI present; not in repo | T-1.1.2 | OPS | S |
| T-1.1.4 | Deploy/restart app; confirm connectivity on new cred | app | App healthy, reads/writes succeed | T-1.1.3 | OPS | S |
| T-1.1.5 | Disable/delete the old `critter` user | MongoDB | `critter` removed or password changed | T-1.1.4 | OPS | S |
| T-1.1.6 | Confirm old credential is rejected | MongoDB | Connect with old URI → auth failure | T-1.1.5 | SEC | S |

### WI-1.2 — Remove literals from the working tree
| Task | Action | File / target | Acceptance | Depends | Owner | Eff |
|------|--------|---------------|------------|---------|-------|-----|
| T-1.2.1 | Replace literal URI with `process.env.MONGODB_URI` (or delete the script if obsolete) | `list-dbs.js:3` | No literal cred; reads env | — | DEV | S |
| T-1.2.2 | Same for the second debug script | `debug-leaderboard.js:3` | No literal cred; reads env | — | DEV | S |
| T-1.2.3 | If scripts are kept, load env via `dotenv` and document usage | `list-dbs.js`, `debug-leaderboard.js` | Scripts run from env, no hardcoded host | T-1.2.1/2 | DEV | S |
| T-1.2.4 | Grep whole repo for any remaining `mongodb(+srv)://…:…@` literals | repo | Zero hits outside `.env*` | T-1.2.1/2 | SEC | S |

### WI-1.3 — Purge from git history
| Task | Action | File / target | Acceptance | Depends | Owner | Eff |
|------|--------|---------------|------------|---------|-------|-----|
| T-1.3.1 | Mirror-clone the repo as a backup before rewriting | git | Backup mirror exists | WI-1.1 done | OPS | S |
| T-1.3.2 | Identify all commits/paths containing the secret | `git log --all -S 'Zapatas2024'` | List of offending commits | T-1.3.1 | SEC | S |
| T-1.3.3 | Scrub history with `git filter-repo` (or BFG) for the secret/files | git history | Secret absent from all refs | T-1.3.2 | OPS | M |
| T-1.3.4 | Force-push cleaned history; coordinate re-clone with all collaborators | remote | Remote rewritten; team notified | T-1.3.3 | OPS | M |
| T-1.3.5 | Invalidate forks/mirrors/caches; confirm rotation already done (T-1.1.5) | hosting | No live copy serves old secret | T-1.3.4 | SEC | S |

### WI-1.4 — Restrict network exposure
| Task | Action | File / target | Acceptance | Depends | Owner | Eff |
|------|--------|---------------|------------|---------|-------|-----|
| T-1.4.1 | Audit whether `23.94.251.158:27017` is publicly reachable | infra | Documented current exposure | — | SEC | S |
| T-1.4.2 | Restrict Mongo to app hosts (firewall/security group / bind) | infra firewall | Only app IPs can reach 27017 | T-1.4.1 | OPS | M |
| T-1.4.3 | Enforce TLS on the Mongo connection | infra + URI | Connection requires TLS | T-1.4.2 | OPS | M |
| T-1.4.4 | Verify external connection is blocked | infra | Connect from outside → refused | T-1.4.2 | SEC | S |

### WI-1.5 — Verify & prevent recurrence
| Task | Action | File / target | Acceptance | Depends | Owner | Eff |
|------|--------|---------------|------------|---------|-------|-----|
| T-1.5.1 | Review Mongo access/audit logs for unauthorized use since exposure | infra logs | Reviewed; incidents escalated if found | T-1.1.6 | SEC | M |
| T-1.5.2 | Add secret scanning (gitleaks/trufflehog) to pre-commit + CI | `.git/hooks` or CI | Scanner blocks new secrets | — | DEV | M |

---

## E2 — Lock down the user API
**Findings:** SEC-02 (unauthenticated CRUD in `api/v1/users/*`), SEC-12 (regex injection in `users/model.js:79,94`). Related: SRP-01, BND-02.
**DoD:** no anonymous access to any `users` mutating route; `role`/`membership.*` not settable by clients; self-service updates bound to the session user; regex injection closed; regression tests pass.

### WI-2.1 — Authentication on user endpoints
| Task | Action | File / target | Acceptance | Depends | Owner | Eff |
|------|--------|---------------|------------|---------|-------|-----|
| T-2.1.1 | Require a session in GET (list + by-query) | `users/route.js` / `controller.js:39,83` | Anonymous GET → 401 | — | DEV | S |
| T-2.1.2 | Require a session in POST (create); confirm public signup still uses `api/auth/register`, not this route | `users/route.js` / `controller.js:11` | Anonymous POST → 401; signup unaffected | — | DEV | S |
| T-2.1.3 | Require a session in PUT | `controller.js:126` | Anonymous PUT → 401 | — | DEV | S |
| T-2.1.4 | Require a session in DELETE | `controller.js:177` | Anonymous DELETE → 401 | — | DEV | S |
| T-2.1.5 | Require a session in merge / nudge / change-password | `users/merge`, `/nudge`, `/change-password` routes; `controller.js:213,231` | Anonymous → 401 | — | DEV | S |

### WI-2.2 — Authorization (role + ownership)
| Task | Action | File / target | Acceptance | Depends | Owner | Eff |
|------|--------|---------------|------------|---------|-------|-----|
| T-2.2.1 | Admin-gate list-all-users | `controller.js:83` | Non-admin GET-all → 403 | T-2.1.1 | DEV | S |
| T-2.2.2 | Admin-gate DELETE | `controller.js:177` | Non-admin DELETE → 403 | T-2.1.4 | DEV | S |
| T-2.2.3 | Admin-gate merge | `controller.js:231` | Non-admin merge → 403 | T-2.1.5 | DEV | S |
| T-2.2.4 | PUT: if non-admin, force target `userID` = session user (ownership); admins may target any | `controller.js:126-151` | Non-admin cannot update other users | T-2.1.3 | DEV | M |
| T-2.2.5 | change-password: bind to session user + verify current password | `users/change-password/route.js` | Cannot change another user's password | T-2.1.5 | DEV | M |

### WI-2.3 — Input hardening
| Task | Action | File / target | Acceptance | Depends | Owner | Eff |
|------|--------|---------------|------------|---------|-------|-----|
| T-2.3.1 | Define a server-side **mutable-field whitelist** for self-update (excludes `role`, `status`, `membership.*`, `stake`) | `users/service.js` updateUser | Disallowed fields ignored/rejected | — | DEV | M |
| T-2.3.2 | Allow `role`/`membership.*` writes only when caller is admin | `users/service.js` / controller | Non-admin cannot escalate | T-2.3.1, T-2.2.4 | DEV | M |
| T-2.3.3 | Replace unescaped `new RegExp(`^${query.userID}$`,'i')` with an exact match (or escape input) | `users/model.js:79` | `?userID=.*` returns no match | — | DEV | S |
| T-2.3.4 | Replace `{ $regex: query[key] }` `$or` with exact-match identity lookup (or escaped regex) | `users/model.js:94` | `?username=.*` returns no arbitrary user | — | DEV | S |
| T-2.3.5 | Strip `$`-prefixed keys / coerce scalar types on create + update inputs | `users/service.js` create/update | Operator-injection body rejected | — | DEV | M |

### WI-2.4 — Tests & verification
| Task | Action | File / target | Acceptance | Depends | Owner | Eff |
|------|--------|---------------|------------|---------|-------|-----|
| T-2.4.1 | Test: anonymous GET/PUT/DELETE → 401 | `__tests__/users.*` | Tests pass | WI-2.1 | DEV | M |
| T-2.4.2 | Test: non-admin cannot set `role`/`membership` | tests | Tests pass | WI-2.3 | DEV | M |
| T-2.4.3 | Test: `?username=.*` / ReDoS payload returns no arbitrary user | tests | Tests pass | T-2.3.3/4 | DEV | S |
| T-2.4.4 | Manual `curl` smoke against a staging deploy | staging | Documented results | WI-2.1–2.3 | SEC | S |

### Implementation notes & consumer audit (branch `remediation/e2-wi2.1-2.3-user-api-lockdown`)
**Design.** Authorization is centralized in a new policy module `src/app/api/v1/users/access.js` (single source of truth for: privileged role, the public-safe projection, and the self-update sanitizer). The controller authenticates at the HTTP edge and passes an `actor` into the service; the service enforces field-level authz and the read projection. **A `undefined` actor means a trusted server-side caller** — the ~7 internal `UserService` importers (Square webhook, Discord callback, memberships, register-card, analytics) keep full access; untrusted input only ever enters through the controller, which always supplies an actor or returns 401.

**Authn/authz applied:** POST create → admin-only (no public consumer; signup uses `/api/auth/register`). PUT → session required, **non-admins forced to their own `userID`** (ownership). DELETE / merge (admin path) / nudge → admin-only. `change-password` → session-bound to self (client `userID` ignored). `verify-credentials` → session required (was an open password/enumeration oracle). Self-merge preserved but now requires **server-side verification of the source account's credentials** (consumer `settings.js` updated to pass them).

**Field hardening:** non-admin self-updates pass through a whitelist; `role`/`status`/`stake`/`badges`/`boardPosition` are dropped, access-granting `membership.*` fields (status, isWaived, accessKey, subscription/Square, sponsorship, type) are rebuilt from the stored record, new volunteer-log entries are forced to `pending` (no self-approval), and `$`-prefixed keys are stripped (operator injection). The SEC-12 regex-injection fix shipped earlier (`escapeRegExp`, `users-model-query.test.js`).

**Read projection:** anonymous/non-owner reads return only public, opted-in active members with a safe field set (no email/phone/password/integration IDs; membership reduced to `status/type/isWaived/subscriptionStatus`). Owner and admin reads return the full record minus the password hash.

**Consumer audit (44 HTTP callers + 8 server-side importers swept).** Self dashboard reads (`?userID=self`) → unchanged (owner = full). Directory, public profile (`/members/[slug]`), `/board-members`, homepage board strip → keep working on the projected fields they render. Admin pages (members, onboarding-reviews, volunteers, square-transactions) → full data + all filters (admin). **Intentional, documented behavior change:** non-admin list calls (share dialogs, showcase, community feeds) now return *public members only, without PII* instead of all users with decrypted email — a privacy improvement, callers still get name/username/userID/image. The homepage member-count ticker now counts public members rather than all users. Server-side importers unaffected (trusted, no actor).

---

## E3 — Eliminate fail-open trust & hardcoded secrets
**Findings:** SEC-03 (Square webhook fails open), SEC-04 (internal API fallback secret), SEC-06 (device secrets), SEC-07 (JWT fallback), SEC-13 (orchestrator secret). Adjacent: SEC-16 (timing-safe), SEC-17 (idempotency) — included as follow-on tasks.
**DoD:** no `|| '<secret>'` fallback remains; the app refuses to boot when a required secret is unset; the webhook rejects unsigned/forged events; every affected secret has been rotated.

### WI-3.1 — Square webhook fail-closed
| Task | Action | File / target | Acceptance | Depends | Owner | Eff |
|------|--------|---------------|------------|---------|-------|-----|
| T-3.1.1 | Change `if (!key) return true` → fail closed (throw / return false) | `square/webhooks/payment/route.js:9` | Missing key ⇒ webhook rejected | — | DEV | S |
| T-3.1.2 | Replace `===` signature compare with `crypto.timingSafeEqual` over equal-length buffers | `…/route.js:12` | Constant-time compare in place | T-3.1.1 | DEV | S |
| T-3.1.3 | Ensure `SQUARE_WEBHOOK_SIGNATURE_KEY` is set in every environment and matches the Square dashboard | deploy env | Key present in all envs | — | OPS | S |
| T-3.1.4 | *(SEC-17 follow-on)* Persist processed Square event IDs; short-circuit duplicates | `…/route.js` + new store | Replayed event processed once | T-3.1.1 | DEV | M |

### WI-3.2 — Remove hardcoded fallback secrets
| Task | Action | File / target | Acceptance | Depends | Owner | Eff |
|------|--------|---------------|------------|---------|-------|-----|
| T-3.2.1 | Remove `|| 'super-secure-internal-secret-882'`; require env | `internal/check-access/route.js:6` | No literal; missing env ⇒ fail | — | DEV | S |
| T-3.2.2 | Remove same fallback | `internal/register-card/route.js:7` | No literal; missing env ⇒ fail | — | DEV | S |
| T-3.2.3 | Remove `|| 'your_jwt_secret_key'`; require `JWT_SECRET` | `users/class.js:5` | No literal; missing env ⇒ fail | — | DEV | S |
| T-3.2.4 | Move `DEVICE_SECRETS` out of source into env/secret store | `vps/socket-server.js:20-23` | No literal device secrets in code | — | DEV | M |
| T-3.2.5 | Remove `ORCHESTRATOR_SECRET=change_me_in_prod` default; inject via secret | `vps/docker-compose.yml:30` | No default secret in compose | — | OPS | S |
| T-3.2.6 | Grep repo for other `|| '…secret…'` / `|| '…key…'` fallbacks | repo | Inventory; none remain unaddressed | — | SEC | S |

### WI-3.3 — Rotate all affected secrets
| Task | Action | File / target | Acceptance | Depends | Owner | Eff |
|------|--------|---------------|------------|---------|-------|-----|
| T-3.3.1 | Rotate `INTERNAL_API_SECRET`; update app + door client | deploy env + device | New secret; old rejected | T-3.2.1/2 | OPS | M |
| T-3.3.2 | Rotate `JWT_SECRET` (note: invalidates outstanding reset/verify tokens) | deploy env | New secret active | T-3.2.3 | OPS | S |
| T-3.3.3 | Rotate device secrets; reprovision door/laser controllers | secret store + devices | Devices auth on new secrets | T-3.2.4 | OPS | M |
| T-3.3.4 | Rotate `ORCHESTRATOR_SECRET`; update orchestrator + caller | deploy env | New secret; old rejected | T-3.2.5 | OPS | M |
| T-3.3.5 | Confirm `SQUARE_WEBHOOK_SIGNATURE_KEY` matches Square dashboard | deploy env | Verified match | T-3.1.3 | OPS | S |

### WI-3.4 — Fail-fast config validation
| Task | Action | File / target | Acceptance | Depends | Owner | Eff |
|------|--------|---------------|------------|---------|-------|-----|
| T-3.4.1 | Add an env-validation module asserting all required secrets are present (no fallback) | new `src/lib/env.js` (or equiv) | Lists required keys; throws if missing | T-3.2.* | DEV | M |
| T-3.4.2 | Wire validation into app bootstrap so a missing secret blocks startup | app entry | App refuses to boot when unset | T-3.4.1 | DEV | S |

### WI-3.5 — Verify
| Task | Action | File / target | Acceptance | Depends | Owner | Eff |
|------|--------|---------------|------------|---------|-------|-----|
| T-3.5.1 | Forged/missing-signature webhook → 401 | staging | Verified rejection | WI-3.1 | SEC | S |
| T-3.5.2 | Internal endpoints reject the old/default secret | staging | Verified rejection | WI-3.3 | SEC | S |
| T-3.5.3 | App refuses to boot with a required secret unset | staging | Verified boot failure | WI-3.4 | SEC | S |

---

## E4 — Authenticate the IoT control boundary
**Findings:** SEC-05 (unauthenticated device control in `vps/socket-server.js`), SEC-11 (commented-out role check in `admin/pair-card`), BND-06 (no trust enforcement web↔IoT).
**DoD:** device-control endpoints reject unauthenticated requests; app→socket calls are authenticated; the app-side authorization is restored; every command is audit-logged with the initiating identity; the socket server is network-isolated.

### WI-4.1 — Authenticate socket-server endpoints
| Task | Action | File / target | Acceptance | Depends | Owner | Eff |
|------|--------|---------------|------------|---------|-------|-----|
| T-4.1.1 | Add bearer/HMAC auth check to `/api/unlock` | `vps/socket-server.js:168-189` | Unauthenticated → 401 | — | DEV | M |
| T-4.1.2 | Add same to `/api/toggle-light` | `vps/socket-server.js:192-213` | Unauthenticated → 401 | T-4.1.1 | DEV | S |
| T-4.1.3 | Add same to `/api/v2/pairing/start` + status endpoints | `vps/socket-server.js` | Unauthenticated → 401 | T-4.1.1 | DEV | S |
| T-4.1.4 | Centralize the auth check as shared middleware for all mutating endpoints | `vps/socket-server.js` | One enforced seam | T-4.1.1-3 | DEV | S |

### WI-4.2 — Authenticate app→socket outbound calls
| Task | Action | File / target | Acceptance | Depends | Owner | Eff |
|------|--------|---------------|------------|---------|-------|-----|
| T-4.2.1 | Add a short-lived signed-token minter (HMAC w/ shared secret) for device actions | new app util | Tokens minted per action | T-3.3.* | DEV | M |
| T-4.2.2 | Send `Authorization` on `unlockDoor` | `src/lib/access-control.js:3-19` | Call carries token | T-4.2.1 | DEV | S |
| T-4.2.3 | Send `Authorization` on `toggleLight` + `getDeviceStatus` | `src/lib/access-control.js:21-49` | Calls carry token | T-4.2.1 | DEV | S |
| T-4.2.4 | Send `Authorization` on the pairing call | `admin/pair-card/route.js:31-38` | Call carries token | T-4.2.1 | DEV | S |

### WI-4.3 — Restore app-side authorization
| Task | Action | File / target | Acceptance | Depends | Owner | Eff |
|------|--------|---------------|------------|---------|-------|-----|
| T-4.3.1 | Uncomment/restore the `['admin','staff']` role check (fail closed) | `admin/pair-card/route.js:11-16` | Non-staff → 401/403 | — | DEV | S |
| T-4.3.2 | Verify `api/v1/access/unlock` already enforces auth+role; tighten if not | `api/v1/access/unlock/route.js` | Confirmed enforced | — | SEC | S |

### WI-4.4 — Network isolation & audit logging
| Task | Action | File / target | Acceptance | Depends | Owner | Eff |
|------|--------|---------------|------------|---------|-------|-----|
| T-4.4.1 | Restrict socket server to app egress only | `vps/setup-firewall.sh` / infra | External cannot reach it | — | OPS | M |
| T-4.4.2 | Log every device command at the socket server (device, time, caller) | `vps/socket-server.js` | Commands appear in audit log | T-4.1.4 | DEV | S |
| T-4.4.3 | Log at the app boundary (which user triggered which action) | `src/lib/access-control.js` / unlock route | App-side audit entries exist | T-4.2.* | DEV | S |

### WI-4.5 — Verify
| Task | Action | File / target | Acceptance | Depends | Owner | Eff |
|------|--------|---------------|------------|---------|-------|-----|
| T-4.5.1 | Unauthenticated `POST /api/unlock` → 401 | staging | Verified | WI-4.1 | SEC | S |
| T-4.5.2 | Authenticated user can unlock; action logged with identity | staging | Verified + log entry | WI-4.1–4.4 | SEC | S |
| T-4.5.3 | External network cannot reach the socket server | infra | Verified blocked | T-4.4.1 | SEC | S |

---

## Dependency & sequencing overview

```
Parallelizable tracks (different owners):

OPS/SEC track ── E1 (rotate → remove → purge → isolate → verify)
              └─ E3 secrets (rotate) ─┐
                                       ├─ both feed E4.WI-4.2 (token minting needs rotated secrets)
DEV track ───── E2 (auth → authz → input → tests)
              └─ E3 code (fail-closed, remove fallbacks, env validation)
              └─ E4 (socket auth → app auth → restore authz → audit)

Hard ordering:
  • E1: rotate (WI-1.1) BEFORE history purge (WI-1.3).
  • E3: remove fallback (WI-3.2) BEFORE/with rotate (WI-3.3) BEFORE env-validation enforce (WI-3.4).
  • E4: socket secrets rotated (E3.WI-3.3) BEFORE token minting (WI-4.2).
```

**Suggested execution order (highest containment first):**
1. E1.WI-1.1 (rotate DB cred) + E3.WI-3.1 (webhook fail-closed) + E4.WI-4.1 (socket auth) — stop the active bleeding.
2. E2 (user API lock) + E3.WI-3.2/3.3 (remove + rotate secrets).
3. E1.WI-1.3/1.4 (purge + isolate), E3.WI-3.4 (fail-fast config), E4.WI-4.2/4.3/4.4 (mutual auth + audit).
4. All `WI-*.5` / test work items (verify) + E1.WI-1.5 (scanning).

## GitHub issue tracking
Issues live in `FabLab-Fort-Smith/The-Lab` (private), milestone **P0 Remediation**. Epics are tracking issues; findings are individual issues linked to their epic. PRs reference these per the workflow in [`05-engineering-process.md`](./05-engineering-process.md) §9.

| Epic issue | Finding issues (P0) |
|------------|---------------------|
| #7 — E1 Contain leaked DB credential | SEC-01 → #11 |
| #8 — E2 Lock down user API | SEC-02 → #12, SEC-12 → #13 |
| #9 — E3 Kill fail-open trust & hardcoded secrets | SEC-03 → #14, SEC-04 → #15, SEC-06 → #16, SEC-07 → #17, SEC-13 → #18 |
| #10 — E4 Authenticate IoT control boundary | SEC-05 → #19, SEC-11 → #20 (BND-06 covered structurally) |
| _standalone (High, filed now)_ | SEC-08 → #21, SEC-09 → #22 |
| #23 — E5 Encryption & data-protection (P1, cross-cutting) | SEC-23 → #24, SEC-24 → #25, SEC-25 → #26 — see [`06-security-standards.md`](./06-security-standards.md) |

> **Standards:** all P0 (and later) work must also meet [`06-security-standards.md`](./06-security-standards.md) — encrypt everything (at rest + in transit), zero secrets in code/logs, no data leakage — enforced via the data-protection CI gates in `05` §5.6. The `ENCRYPTION_KEY` hardcoded fallback (SEC-23) is folded into **WI-3.2/WI-3.3** for immediate containment.

## Branch & PR register
One feature branch + one PR per Work Item (see `05` §2). Each PR **refs** its epic + finding issue(s); the finding/epic issue is **closed** by the PR that satisfies its acceptance (usually the epic's verify WI) — see `05` §9. Status kept current to prevent drift — no WI is "Done" anywhere until its PR is merged.

| Work Item | Branch (`remediation/…`) | PR | Status |
|-----------|--------------------------|----|--------|
| WI-1.1 rotate DB cred | `e1-wi1.1-rotate-db-cred` | — | not-started |
| WI-1.2 remove literals | `e1-wi1.2-remove-db-literals` | — | not-started |
| WI-1.3 purge history | `e1-wi1.3-history-purge` | — | not-started |
| WI-1.4 restrict network | `e1-wi1.4-db-network-isolation` | — | not-started |
| WI-1.5 verify & scan | `e1-wi1.5-verify-secret-scan` | — | not-started |
| WI-2.1 users authn | `remediation/e2-wi2.1-2.3-user-api-lockdown` | — | in-review |
| WI-2.2 users authz | `remediation/e2-wi2.1-2.3-user-api-lockdown` | — | in-review |
| WI-2.3 input hardening | `remediation/e2-wi2.1-2.3-user-api-lockdown` (regex hardening shipped earlier on `e2-wi2.3-regex-hardening`) | — | in-review |
| WI-2.4 tests | shipped with the fixes (`remediation/e2-wi2.1-2.3-user-api-lockdown`) | — | in-review |
| WI-3.1 webhook fail-closed | `e3-wi3.1-square-failclosed` | — | not-started |
| WI-3.2 remove fallback secrets | `e3-wi3.2-remove-fallback-secrets` | — | not-started |
| WI-3.3 rotate secrets | `e3-wi3.3-rotate-secrets` | — | not-started |
| WI-3.4 fail-fast config | `e3-wi3.4-env-validation` | — | not-started |
| WI-3.5 verify | `e3-wi3.5-verify` | — | not-started |
| WI-4.1 socket-server authn | `e4-wi4.1-socket-authn` | — | not-started |
| WI-4.2 app→socket authn | `e4-wi4.2-app-socket-token` | — | not-started |
| WI-4.3 restore app authz | `e4-wi4.3-restore-authz` | — | not-started |
| WI-4.4 isolation + audit log | `e4-wi4.4-isolation-audit` | — | not-started |
| WI-4.5 verify | `e4-wi4.5-verify` | — | not-started |

> **Note on WI-1.3 (history purge):** rewriting/force-pushing history is itself a `main`-affecting operation that cannot go through a normal PR. Treat it as a coordinated, scheduled OPS operation (announced, backup-first per T-1.3.1) executed *after* rotation — it is the one exception to "PR-only," and it touches no application code.

## Totals
- **4 epics · 19 work items · 71 atomic tasks · 19 branches/PRs (1 per WI).**
- Rough effort: ~14×S, ~? — most tasks are S/M; the long poles are history purge (T-1.3.3/4), device reprovisioning (T-3.3.3), and socket auth (T-4.1.1, T-4.2.1).

## Notes & guardrails
- **Process is binding — see [`05-engineering-process.md`](./05-engineering-process.md).** PR-only into `main`; one branch per WI; no downstream impact (consumer audit required); full E2E on every touched file. CI gates: lint · unit · e2e · secret-scan · coverage.
- Every code task is a **single-file, single-purpose** change (one commit) so it can be reviewed and reverted independently; the WI it belongs to is the PR/rollback unit.
- Rotation tasks assume **anything committed is already compromised** — rotate even if history is later scrubbed.
- Adjacent P1 items pulled in where inseparable from a P0 fix (SEC-11 role check, SEC-16/17 webhook hardening); the rest of P1/P2 remain in the executive-summary roadmap.
- This plan is documentation only; no application code has been modified. Await approval before implementation.
