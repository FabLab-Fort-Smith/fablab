# Architectural Boundary Violations — The-Lab

**Audit date:** 2026-05-29
**Scope:** Module/layer boundary analysis of `src/` (and its coupling to `vps/`). Documentation only. Each violation is located in code and cross-referenced to the SOLID (`02-solid-violations.md`) and security (`01-security-findings.md`) reports where relevant.

---

## 1. Intended architecture (as implied by the code)

The API is organized as a layered, feature-sliced MVC:

```
HTTP request
   │
   ▼
 route.js        ← transport: parse request, choose handler
   │
   ▼
 controller.js   ← request/response mapping, status codes
   │
   ▼
 service.js      ← business logic, orchestration
   │
   ▼
 model.js        ← persistence (Mongo queries)
   │
   ▼
 class.js        ← domain entity / validation
   │
   ▼
 lib/database.js ← single Database singleton (connection + collections)
```

Plus cross-cutting modules in `src/lib/*` (database, square, discord, access-control, constants) and `src/utils/*` (s3, axios), and an external `vps/` tier (socket-server for IoT, orchestrator for CTF containers).

## 2. Actual architecture (as built)

The layering is applied **inconsistently**, the dependency direction is **inverted** in key places, and layers are **skipped** or **collapsed**. The boundaries below are the concrete violations.

```
        ┌─────────────────────────────────────────────┐
        │ auth.js (root config / cross-cutting)         │
        │   imports ↓ into feature internals (BND-01)   │
        └───────────────┬───────────────────────────────┘
                        │ reaches into
   route ──► controller ──► service ──► model ──► class ──► db
     │            │            │                            ▲
     │ (BND-03    │ (BND-04    │  cross-feature             │
     │  layer     │  service→service imports)               │
     │  skipped)  │                                          │
     └────────────┴──────────────────────────────────────────┘
            │  several routes call db.* directly (BND-02)
            └──────────────────────────────────────────────────
   route ──► external tiers (S3/Square/WS) inline (BND-05, BND-06)
```

---

## 3. Boundary violations

### BND-01 — Cross-cutting auth config reaches down into feature internals
**Severity:** High (architecture) · cross-ref DIP-03
**Location:** `auth.js:6-10`
The root authentication configuration imports concrete services from deep inside the API feature tree:
`@/app/api/v1/users/service`, `@/app/api/auth/[...nextauth]/controller`, `@/app/api/auth/[...nextauth]/service`, `@/app/api/v1/transactions/service`, plus `@/lib/discord`.

**Why it's a violation:** `auth.js` is foundational/high-level (every request depends on it). Feature routes under `app/api/v1/*` are *lower-level* leaves. Importing leaf services into the root config inverts the dependency direction and creates a cycle of concerns: the auth layer now changes whenever the users/transactions feature internals change, and the `jwt`/`profile` callbacks embed business logic (user merge, tip claiming, grace-period revocation — `auth.js:347-426`).

**Impact:** Wide blast radius (a refactor of `users/service` can break login); business rules hidden inside framework callbacks; hard to test auth in isolation.
**Direction:** Define a stable application-service interface (`AuthApplicationService`) that the config depends on; keep merge/grace/tip logic in domain services invoked through that interface, not inline in NextAuth callbacks.

### BND-02 — Routes bypass the model/service layer and hit `db` directly
**Severity:** High (architecture) · cross-ref DIP-01
**Location:** `src/app/api/internal/check-access/route.js:3,22-24` (`db.dbUsers()` + raw `findOne`), `src/app/api/v1/memberships/confirm/route.js:7,24-25` (`db.dbUsers()` + raw `findOne`); contrast with `src/app/api/v1/users/route.js` which correctly routes through controller→service→model.
Some routes reach straight past `controller/service/model` into the persistence singleton and write Mongo queries inline.

**Why it's a violation:** The persistence boundary is supposed to be owned by `model.js`. Direct `db` access in the transport layer means query logic, field names, and access rules are duplicated and uncentralized — the same `users` collection is queried both via `UserModel` (with its `$regex` identity logic) and via ad-hoc `findOne({ userID })` in routes.

**Impact:** Divergent query semantics for the same data (e.g. case-sensitivity differs from `UserModel`'s regex match — see SEC-12); security/authorization rules can't be enforced in one place; refactors of the schema must hunt every inline query.
**Direction:** All persistence through repositories/models; forbid `import { db }` outside the persistence layer (enforce via lint rule).

### BND-03 — The "controller" layer is sometimes skipped, sometimes collapsed
**Severity:** Medium · cross-ref LSP-02
**Location:**
- Full stack present: `v1/users` (`route`+`controller`+`service`+`model`+`class`), `v1/bounties`, `v1/announcements`.
- Controller exists but *is* the route logic: `v1/notifications/controller.js` exports `GET/POST/PUT` directly.
- No controller at all, all logic inline in the route: `v1/admin/plans/route.js`, `v1/arcade/*`, `v1/square/*`, `internal/*`.

**Why it's a violation:** There is no consistent boundary between transport and request-mapping. The same conceptual layer is present, merged, or absent depending on the feature, so the architecture cannot be reasoned about uniformly.
**Impact:** Onboarding/maintenance cost; cross-cutting changes (e.g. "add auth to every controller") have no single seam to apply to; encourages copy-paste divergence.
**Direction:** Pick one convention. Given many routes are thin, a pragmatic choice is *route + service* (drop the controller) with a shared auth/validation wrapper at the route — applied everywhere.

### BND-04 — Cross-feature coupling between sibling services/models
**Severity:** Medium · cross-ref SRP-01
**Location:** `src/app/api/v1/users/service.js:5-12` imports `BadgeModel`, `BountyModel`, `PortfolioModel`, `NotificationService`, `WalletService`, `DiscordService`; `memberships/confirm/route.js` imports `WalletService` + `UserService`.
Feature slices reach horizontally into each other's internals (importing another feature's *model*, not just a published interface).

**Why it's a violation:** Feature boundaries should be vertical and communicate through narrow, intentional interfaces. Importing `BadgeModel`/`BountyModel`/`PortfolioModel` directly into the users service couples the user feature to the internal persistence shape of three other features.
**Impact:** A change to the badges/bounties/portfolio schema can break the users service; features cannot evolve or be extracted independently; circular-import risk.
**Direction:** Each feature exposes a small service API; siblings call that API, never another feature's model. Consider an event/notification bus for side-effects (badge award, wallet credit) instead of inline cross-calls.

### BND-05 — External-tier (S3/Square) details embedded in the transport layer
**Severity:** Medium · cross-ref SRP-02, DIP-02
**Location:** `src/app/api/v1/upload/route.js:8-32` (S3 client + bucket management in the route), Square SDK usage inline across `memberships/confirm/route.js`, `square/webhooks/payment/route.js`.
There is a `src/utils/s3.util.js` and a `src/lib/square.js`, yet routes still instantiate/drive the SDKs directly, so the "external integration" boundary is porous.

**Why it's a violation:** The boundary that should isolate vendor SDKs from app code is bypassed; integration concerns (endpoints, buckets, idempotency keys, signature verification) leak into HTTP handlers.
**Impact:** Vendor config and security controls are duplicated and inconsistent (SEC-08, SEC-17, SEC-21); no single place to add ret/validation/observability.
**Direction:** Route all S3/Square access through the existing `lib`/`utils` adapters; routes never touch SDK constructors.

### BND-06 — App ↔ VPS IoT boundary has no trust enforcement
**Severity:** High (architecture + security) · cross-ref SEC-04, SEC-05, SEC-06, SEC-11
**Location:** `src/lib/access-control.js:3-49` (Next.js → `ACCESS_CONTROL_API_URL` with **no** auth header), `src/app/api/admin/pair-card/route.js:29-38` (→ `WS_SERVER_URL` with no auth header), `vps/socket-server.js:168-213` (server accepts commands with no auth).
The boundary between the web app and the physical-device tier is crossed with **no** authentication in either direction.

**Why it's a violation:** A trust boundary (web tier → physical actuators) must be the *most* strongly enforced; here it is the weakest. The app assumes the socket server is private, and the socket server assumes callers are trusted — neither verifies.
**Impact:** Anyone who can reach the socket server controls doors/equipment (SEC-05); anyone who can reach the Next.js endpoints can trigger device actions through it.
**Direction:** Mutual authentication across the boundary (signed, short-lived, app-minted tokens per action; HMAC on the socket-server endpoints); network isolation; full audit logging at the boundary.

### BND-07 — Domain/business logic embedded in framework callbacks
**Severity:** Medium · cross-ref BND-01
**Location:** `auth.js:347-426` (`jwt` callback performs user **merge**, `lastLogin` write, and **grace-period access revocation**); `auth.js:96-277` (`profile` callbacks create users, link Discord identities, claim pending tips).
Significant domain logic lives inside NextAuth lifecycle callbacks rather than behind a service boundary.

**Why it's a violation:** The auth framework's extension points are being used as the home for business rules. The "login" boundary now silently mutates membership status, merges accounts, and moves money (stake/tips).
**Impact:** Side effects on login are hard to test, observe, and secure; failures are swallowed (`catch`+`console.error`) so a failed merge/revocation passes silently; the rules are invisible to anyone reading the feature services.
**Direction:** Callbacks should call explicit, individually testable domain services and surface failures.

### BND-08 — Dead / duplicated modules erode the layout
**Severity:** Low
**Location:** `src/app/dashboard/page copy.js` (a "copy" of a page committed alongside `page.js`); root-level operational scripts mixed with app config (`deploy-s2-missions.sh`, `fix-s1-readmes.py`, `new-readmes.py`, `patch-s1-readmes.sh`, `verify-discord.js`, `list-dbs.js`, `debug-leaderboard.js`).
**Why it's a violation:** Duplicate/dead files blur which module is authoritative; one-off scripts in the repo root (some carrying secrets — SEC-01) have no boundary separating operational tooling from the deployed app.
**Direction:** Remove dead copies; move operational scripts into a dedicated `scripts/`/`ops/` area excluded from the deployed build; never embed credentials.

**Status:** ✅ Resolved (branch `chore/industry-standard-structure`). `page copy.js` removed (React 19 PR); `list-dbs.js`/`debug-leaderboard.js` removed (SEC-01). Root brought to industry-standard: ops/mission scripts → `scripts/` & `scripts/missions/`, Discord ops → `scripts/`, seed JSON → `scripts/data/`, CTF design docs → `docs/game/`, dead `theme.js`/`response.json`/duplicate `register-commands.js` removed. The root now holds only config + `README`/`CONTRIBUTING`/`SECURITY`/`CLAUDE`/`AGENTS`. Codified as a mandate in `CLAUDE.md` §13.

---

## 4. Summary

| ID | Boundary crossed | Direction problem | Severity |
|----|------------------|-------------------|----------|
| BND-01 | root auth → feature services | inverted (high→low) | High |
| BND-02 | route → db (skips model) | layer skipped | High |
| BND-03 | route ↔ controller | inconsistent / collapsed | Medium |
| BND-04 | feature ↔ sibling feature internals | horizontal leakage | Medium |
| BND-05 | route → vendor SDK | layer skipped | Medium |
| BND-06 | web tier → IoT tier | no trust enforcement | High |
| BND-07 | framework callback ↔ domain logic | misplaced logic | Medium |
| BND-08 | app ↔ ops scripts / dead code | no separation | Low |

**Net:** the layering is well-conceived but unevenly enforced. The highest-value structural fixes — a generic `Database` accessor (OCP-01), a persistence-only boundary that forbids `db` imports in routes (BND-02), a stable auth application-service (BND-01/BND-07), and mutual auth on the IoT boundary (BND-06) — would simultaneously remove the largest SOLID and security risks.
