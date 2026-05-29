# SOLID Violations — The-Lab

**Audit date:** 2026-05-29
**Scope:** Architecture review of `src/` framed through the five SOLID principles. Documentation only — no code changes. Each violation cites concrete locations. Many of these are also security-relevant; cross-references to `01-security-findings.md` and `03-boundary-violations.md` are noted.

The codebase nominally follows a layered MVC convention: `route.js → controller.js → service.js → model.js → class.js`, with a shared `Database` singleton (`src/lib/database.js`). The findings below are where that intent is violated.

---

## S — Single Responsibility Principle

A class/module should have one reason to change. Several core modules concentrate many unrelated responsibilities.

### SRP-01 — `UserService` is a god-service
**Location:** `src/app/api/v1/users/service.js:1-17` (imports), throughout
`UserService` imports and orchestrates: `User` (class), `UserModel`, `BadgeModel`, `BountyModel`, `PortfolioModel`, `Constants`, `AuthService` (email/phone encryption), `DiscordService`, `NotificationService`, `WalletService`, and three email helpers (`sendApplicationReceivedEmail`, `sendStatusChangeEmail`, `sendAdminNotificationEmail`).

It is simultaneously responsible for: user persistence, cryptography (encrypting email/phone — `:28-29`), badge/bounty/portfolio aggregation, Discord side-effects, notifications, wallet/stake mutations, email delivery, and account merging. Any change to email templates, badge logic, Discord, or wallet rules forces a change to (and re-test of) the user service.

**Impact:** High change-amplification and blast radius; hard to test in isolation; a bug in one concern (e.g. merge) risks all the others. This is also the root of the cross-feature coupling in `03-boundary-violations.md` (BND-04).
**Direction:** Split persistence from orchestration; move encryption behind a dedicated crypto module; have side-effects (email/Discord/wallet/notifications) subscribe to user events rather than be called inline.

### SRP-02 — Route handlers double as infrastructure code
**Location:** `src/app/api/v1/upload/route.js:8-32`
The HTTP route constructs an `S3Client`, defines `ensureBucketExists`, and performs bucket lifecycle management — infrastructure concerns living in the transport layer. The route's "reason to change" now includes "how we talk to S3."
**Impact:** Storage logic is untestable without HTTP; cannot be reused; security controls (auth/validation) get mixed with plumbing (SEC-08).
**Direction:** Move S3 access behind `src/utils/s3.util.js`; keep the route to request-validation + delegation.

### SRP-03 — Membership confirm route orchestrates five subsystems
**Location:** `src/app/api/v1/memberships/confirm/route.js`
A single GET handler talks directly to Square (`squareClient` payments/checkout/orders/subscriptions/cards/catalog), the `db` singleton, `UserService`, `WalletService`, and `Constants`, performing payment verification, subscription resolution, subscription *creation*, user updates, and reward issuance.
**Impact:** One function with many reasons to change; difficult to reason about correctness/security (SEC-15).
**Direction:** Extract a `MembershipConfirmation` service; the route should validate and delegate.

### SRP-04 — `Database` mixes connection management with collection accessors
**Location:** `src/lib/database.js`
The singleton owns connection lifecycle (`connect`, pooling) *and* a hand-written accessor per collection (`dbUsers`, `dbPlans`, `dbAnnouncements`, `dbNotifications`, `dbContactSubmissions`, `dbTransactions`). Two distinct reasons to change (connection strategy vs. collection set) live in one class. (See also OCP-01.)

---

## O — Open/Closed Principle

Modules should be open for extension, closed for modification.

### OCP-01 — `Database` requires editing the class for every new collection
**Location:** `src/lib/database.js:41-69`
```js
async dbUsers()            { await this.connect(); return this._instance.collection("users"); }
async dbPlans()            { await this.connect(); return this._instance.collection("plans"); }
async dbAnnouncements()    { ... collection("announcements"); }
async dbNotifications()    { ... }
async dbContactSubmissions(){ ... }
async dbTransactions()     { ... }
```
Adding a collection (the app clearly has many more — badges, bounties, portfolio, transactions, arcade, etc.) requires modifying `Database`. The class is *not* closed for modification.

**Symptom of the gap:** features that need a collection not on this list bypass the singleton and reach for `db`/Mongo differently, producing the inconsistency in BND-02. Notably, several routes call `db.dbUsers()` directly while others go through the model layer.
**Direction:** Provide a single generic accessor, e.g. `collection(name)` (or `getCollection<T>(name)`), so new collections need no class edits.

### OCP-02 — Behavior switched by hardcoded conditionals rather than extension
**Location:** `src/app/api/v1/users/route.js:17-25`
The `GET` handler hardcodes the list of "query" params and branches between `getUserByQuery` and `getAllUsers`. Each new filter dimension means editing the route. Similar hardcoded param lists recur in `controller.js:44,134`.
**Direction:** Drive filtering from a declarative, validated schema rather than inline param lists duplicated across route + controller.

---

## L — Liskov Substitution Principle

Subtypes / implementations must honor the contracts callers rely on. In this JS codebase the relevant "contracts" are function signatures and return shapes that are used interchangeably.

### LSP-01 — `UserService.updateUser` is called with incompatible first-argument types
**Location:** definition `src/app/api/v1/users/service.js`; call sites:
- `auth.js:400` → `UsersService.updateUser({ userID: token.userID }, {...})` (object)
- `auth.js:415` → `UsersService.updateUser({ userID: token.userID }, {...})` (object)
- `auth.js:118,207,248,358` → `UsersService.updateUser(targetUser.userID, {...})` (string)
- `src/app/api/v1/users/controller.js:151` → `UserService.updateUser(query, updateData)` where `query` is a **string** from the URL
- `src/app/api/v1/memberships/confirm/route.js:128` → `UserService.updateUser(userID, updateData)` (string)

The same method is invoked with both a **string** identifier and a **query object** as its first parameter. Callers cannot rely on a single contract; the method must internally guess the shape. This is a substitutability/contract violation that is fragile and a latent source of "updates the wrong document / no document" bugs.
**Direction:** Fix one signature (e.g. always `updateUser(userID: string, patch)`), add an explicit `updateUserByQuery` if query-based updates are truly needed, and update call sites.

### LSP-02 — Inconsistent "controller" contract across features
**Location:** compare `src/app/api/v1/users/controller.js` (class of static methods taking `req`, returning `Response`) vs. `src/app/api/v1/notifications/controller.js` (bare exported `GET/POST/PUT` functions) vs. `src/app/api/v1/admin/plans/route.js` (all logic inline in the route, no controller).
There is no single "controller" abstraction that callers/maintainers can substitute. A reader cannot assume what a "controller" is or returns from one feature to the next.
**Direction:** Standardize the controller shape (or drop the layer where it adds nothing — see BND-03).

---

## I — Interface Segregation Principle

Clients should not depend on members they don't use.

### ISP-01 — Fat `Database` surface forces broad coupling
**Location:** `src/lib/database.js` (the exported `db` singleton)
Every consumer that does `import { db }` gains the entire collection-accessor surface (`dbUsers`, `dbPlans`, `dbTransactions`, …) regardless of need. A module that only needs `users` still depends on a class that changes whenever any other collection accessor is added (ties into OCP-01).
**Direction:** Hand each consumer only the collection/repository it needs (per-collection repositories), not the global singleton.

### ISP-02 — `UserService`'s wide static surface
**Location:** `src/app/api/v1/users/service.js`
`UserService` exposes a large set of unrelated static methods (CRUD + merge + nudge + badge/bounty/portfolio aggregation + wallet + email). Consumers that need only `getUserByQuery` nonetheless import a module wired to Discord, email, and wallet (SRP-01). Importing it drags in those transitive concerns.
**Direction:** Segregate read vs. write vs. lifecycle/orchestration interfaces.

---

## D — Dependency Inversion Principle

High-level policy should depend on abstractions, not concrete details. The app consistently depends on concretions.

### DIP-01 — Direct dependency on the concrete `Database` singleton
**Location:** `src/lib/database.js:72` (`export const db = new Database()`); consumed directly in e.g. `src/app/api/internal/check-access/route.js:3,22`, `src/app/api/v1/memberships/confirm/route.js:7,24`, models, services.
High-level handlers import and call the concrete singleton (`db.dbUsers()`), often bypassing the model layer entirely. There is no repository abstraction to substitute (e.g. for testing or swapping stores), and connection state is process-global mutable singleton state.
**Direction:** Depend on a repository interface injected into services; keep the Mongo specifics behind it.

### DIP-02 — SDK clients instantiated inline in high-level modules
**Location:** `src/app/api/v1/upload/route.js:8-16` (`new S3Client(...)`), Square client usage scattered through routes/services (`memberships/confirm`, webhook, etc.), Discord/email helpers imported directly.
Business/policy code is bound to concrete vendor SDKs at the call site rather than to an abstraction.
**Impact:** Untestable without the real SDK; vendor lock-in; security config (endpoints/credentials) duplicated (SEC-21).
**Direction:** Wrap each external dependency (S3, Square, Discord, email) behind a thin interface and inject it.

### DIP-03 — Top-level auth config depends on deep feature internals
**Location:** `auth.js:6-10`
```js
import UsersService from '@/app/api/v1/users/service';
import AuthController from '@/app/api/auth/[...nextauth]/controller';
import AuthService from '@/app/api/auth/[...nextauth]/service';
import DiscordService from '@/lib/discord';
import TransactionService from '@/app/api/v1/transactions/service';
```
The application-wide auth configuration (a high-level, cross-cutting concern) reaches *down* into concrete API-route feature services. The dependency arrow points the wrong way. (Detailed under BND-01.)

### DIP-04 — Credentials provider calls the app over HTTP instead of the service
**Location:** `auth.js:287-294`
```js
const response = await fetch(`${baseURL}/api/auth/signin`, { method: "POST", ... });
```
Rather than depending on an auth abstraction/service, the provider performs a network round-trip to the app's own HTTP endpoint to authenticate. High-level policy depends on a concrete transport detail (a self-call), adding latency, failure modes, and an internal trust assumption.
**Direction:** Call the sign-in service function directly behind an interface; no self-HTTP.

---

## Cross-cutting observations
- The project **already demonstrates a clean pattern** in places (`v1/bounties`, `v1/admin/plans`, `v1/transactions/award`): auth at the edge, ownership in the service, thin route. The SOLID violations cluster where that discipline lapsed (`users`, `notifications`, `memberships/confirm`, `upload`, the `Database` singleton).
- Fixing SRP-01 / OCP-01 / DIP-01 removes the structural pressure that produces most of the boundary violations in `03-boundary-violations.md`.
- Several violations are *also* the mechanism of a security finding (e.g. SRP-02 ⇄ SEC-08, DIP-03/04 ⇄ the auth blast radius). Remediating the architecture and the security issues should be planned together.
