# Security Findings — The-Lab

**Audit date:** 2026-05-29
**Scope:** Static, read-only review of the `The-Lab` Next.js 16 application (`src/`, `vps/`, root scripts). No code was modified. No live/penetration testing was performed.
**Method:** Each finding was traced through the actual call chain (route → controller → service → model → `Database`) and confirmed against source. Severity = impact × exploitability, with physical-access and payment/identity endpoints weighted up.

> **Important scoping note — "Hack the Lab" CTF artifacts.** This project embeds an intentional capture-the-flag game ("Hack the Lab" / holodeck / arcade). Strings that *look* like leaked secrets but are deliberately planted as game content are **not** counted as findings. Example: `src/app/dashboard/activities/terminal/page.js:430` contains `mongodb://admin:secure_password_2025@localhost:27017/...` followed by `# FLAG: flag{system_restoration_imminent}`. That is game content, not a real credential. Findings below were filtered to exclude such artifacts.

## Severity summary

| ID | Severity | Title | Primary location |
|----|----------|-------|------------------|
| SEC-01 | 🔴 Critical | Hardcoded production MongoDB credentials committed to repo | `list-dbs.js:3`, `debug-leaderboard.js:3` |
| SEC-02 | 🔴 Critical | Unauthenticated full user CRUD (list/read/update/delete/merge) | `src/app/api/v1/users/*` |
| SEC-03 | 🔴 Critical | Square webhook signature verification fails open | `src/app/api/v1/square/webhooks/payment/route.js:9` |
| SEC-04 | 🔴 Critical | Hardcoded fallback secret guards IoT door/access endpoints | `src/app/api/internal/check-access/route.js:6`, `register-card/route.js:7` |
| SEC-05 | 🔴 Critical | VPS socket-server: unauthenticated physical device control | `vps/socket-server.js:168-213` |
| SEC-06 | 🔴 Critical | Hardcoded device secrets for door/laser controllers | `vps/socket-server.js:20-23` |
| SEC-07 | 🟠 High | JWT signing secret has a guessable hardcoded fallback | `src/app/api/v1/users/class.js:5` |
| SEC-08 | 🟠 High | Unauthenticated S3 upload, no type/size validation, bucket auto-create | `src/app/api/v1/upload/route.js` |
| SEC-09 | 🟠 High | SSRF in image proxy (no allowlist, fetches arbitrary URLs) | `src/app/api/image-proxy/route.js:12` |
| SEC-10 | 🟠 High | `/api/*` not covered by middleware; routes self-protect inconsistently | `src/middleware.js:36-38` |
| SEC-11 | 🟠 High | Admin role check commented out on card-pairing endpoint | `src/app/api/admin/pair-card/route.js:11-16` |
| SEC-12 | 🟠 High | Regex injection / ReDsoS / over-broad match in user lookup | `src/app/api/v1/users/model.js:79,94` |
| SEC-13 | 🟠 High | Hardcoded orchestrator shared secret (`change_me_in_prod`) | `vps/docker-compose.yml:30`, `src/services/orchestrator.js` |
| SEC-14 | 🟡 Medium | IDOR: notifications readable/writable by arbitrary `userID` | `src/app/api/v1/notifications/controller.js` |
| SEC-15 | 🟡 Medium | State-changing membership activation on unauthenticated GET | `src/app/api/v1/memberships/confirm/route.js` |
| SEC-16 | 🟡 Medium | Webhook signature compared with `===` (not constant-time) | `src/app/api/v1/square/webhooks/payment/route.js:12` |
| SEC-17 | 🟡 Medium | No idempotency on payment webhook → duplicate state updates | `src/app/api/v1/square/webhooks/payment/route.js` |
| SEC-18 | 🟡 Medium | Unauthenticated seed / migration / test endpoints | `src/app/api/seed`, `test-toggle`, `v1/migrations/*` |
| SEC-19 | 🟡 Medium | Body-driven NoSQL operator injection risk on write routes | `notifications`, `users` POST/PUT |
| SEC-20 | 🟢 Low | Verbose logging of profiles / PII / errors | `auth.js` (many), routes |
| SEC-21 | 🟢 Low | Hardcoded infra endpoints as fallbacks | `upload/route.js:9-14`, `access-control.js:1` |
| SEC-22 | 🟢 Low | Orchestrator container spawn — confirm input sanitization holds | `vps/orchestrator/*` |

---

## Critical

### SEC-01 — Hardcoded production MongoDB credentials committed to the repository
**Severity:** Critical
**Location:** `list-dbs.js:3`, `debug-leaderboard.js:3`

**Evidence:**
```js
const uri = "mongodb://critter:Zapatas2024@23.94.251.158:27017/?directConnection=true&...&authSource=admin";
```
Both files hardcode the same admin connection string (host, port, username, password) and are tracked in git (not `.env`, so `.gitignore`'s `.env*` rule does not cover them).

**Impact:** Anyone with repo access (or anyone who finds these in git history) gains full read/write admin access to the production database: all member PII, encrypted-email records, membership/payment state, access-card codes, and CTF data. This is the single highest-impact finding.

**Remediation:**
1. Treat the `critter` DB credential as compromised — **rotate immediately**.
2. Remove the literals; load from `process.env.MONGODB_URI` like `src/lib/database.js` does.
3. Purge from git history (`git filter-repo` / BFG) since the secret persists in past commits.
4. Restrict MongoDB network exposure (bind/firewall `23.94.251.158:27017`).

**Status:** ⚠️ Partially remediated — **code half only** (branch `remediation/e1-wi1.2-remove-db-literals`). Step 2 done: the two unreferenced debug scripts (`list-dbs.js`, `debug-leaderboard.js`) were deleted, so the live literal is gone from the working tree (guarded by `test/unit/sec-01-no-db-cred.test.js`). **Steps 1, 3, 4 remain OPS-owned and unblock nothing** — the credential is still in git history and must be rotated, the history purged, and the DB network-restricted before this finding can close. Assume the secret is already compromised. **OPS runbook for the rotate + network + history-purge + verify steps:** [`docs/security/sec-01-credential-purge-runbook.md`](../security/sec-01-credential-purge-runbook.md).

---

### SEC-02 — Unauthenticated full user CRUD
**Severity:** Critical
**Location:** `src/app/api/v1/users/route.js`, `src/app/api/v1/users/controller.js` (all methods), `src/app/api/v1/users/service.js`

**Evidence:** `route.js` maps `GET/POST/PUT/DELETE` straight to `UserController.{getAllUsers,getUserByQuery,createUser,updateUser,deleteUser}`. None of those controller methods call `auth()` or check `session`/`role` (`controller.js:11,39,83,126,177,213,231`). Because middleware does not cover `/api/*` (see SEC-10), these run for anonymous callers.

**Impact:**
- `GET /api/v1/users` — enumerate all users (paginated) with their stored fields.
- `GET /api/v1/users?userID=...` — read any user record.
- `PUT /api/v1/users?userID=...` — modify **any** user (including `role`, `membership.status`, `membership.accessKey`). This is a direct privilege-escalation primitive: set your own account to `role: "admin"` or `membership.status: "active"`.
- `DELETE /api/v1/users?userID=...` — delete any user.
- `POST /api/v1/users/merge`, `/nudge` — merge/nudge arbitrary accounts (`controller.js:213,231`).

**Remediation:** Require an authenticated session for every method; gate list/update/delete/merge behind `role === "admin"`; for self-service updates, derive the target `userID` from the session, never from the query string, and whitelist mutable fields (never allow `role`, `membership.*` from client input).

---

### SEC-03 — Square payment webhook fails open when signature key is unset
**Severity:** Critical
**Location:** `src/app/api/v1/square/webhooks/payment/route.js:7-13`

**Evidence:**
```js
function verifySquareSignature(rawBody, signature, notificationUrl) {
  const key = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
  if (!key) return true; // skip verification if key not configured
  ...
}
```
If the env var is missing/empty, **every** webhook is accepted as valid.

**Impact:** The webhook handler activates memberships, issues access keys, grants stake/rewards, and updates subscription status. A forged webhook (when the key is unset, e.g. a misconfigured environment) lets an attacker mark any account paid/active and issue physical access — entirely bypassing payment. Combined with SEC-17 (no idempotency) and SEC-16 (non-constant-time compare), the payment trust boundary is weak.

**Remediation:** Fail **closed** — if the key is unset, reject (`500`/`401`) and log loudly. Never default-allow on a signature-verification path.

---

### SEC-04 — Hardcoded fallback secret on IoT access endpoints
**Severity:** Critical
**Location:** `src/app/api/internal/check-access/route.js:6`, `src/app/api/internal/register-card/route.js:7`

**Evidence:**
```js
const SECRET = process.env.INTERNAL_API_SECRET || 'super-secure-internal-secret-882';
```
The bearer check (`check-access/route.js:11`) compares against `SECRET`. If `INTERNAL_API_SECRET` is unset, the well-known literal grants access; the literal is in the repo regardless.

**Impact:** `check-access` resolves a physical access card (`membership.accessKey.code`) to a grant/deny decision and returns user identity; `register-card` binds cards to accounts. With the known fallback (or if the env var is ever unset), an attacker can query card validity and register/forge access cards — a path to physical entry. Also note the comparison is a plain string `!==` (timing-unsafe).

**Remediation:** Remove the literal; require the env var (fail closed if missing); use `crypto.timingSafeEqual`; rotate `INTERNAL_API_SECRET`; audit recent card registrations.

---

### SEC-05 — VPS socket-server exposes unauthenticated physical device control
**Severity:** Critical
**Location:** `vps/socket-server.js:168-189` (`/api/unlock`), `192-213` (`/api/toggle-light`)

**Evidence:** Both HTTP endpoints read `deviceId` from the body and immediately send `UNLOCK` / `TOGGLE_LIGHT` to the connected device over WebSocket. There is **no** bearer token, signature, or session check.

**Impact:** Anyone who can reach the socket server (`https://socket.crittercodes.dev`) can unlock the door or toggle equipment by POSTing a `deviceId`. The Next.js helper `src/lib/access-control.js` calls these same endpoints with no auth header (`access-control.js:3-37`), confirming the server itself enforces nothing. No audit trail of who triggered an unlock.

**Remediation:** Require authentication on every control endpoint (shared bearer + per-request HMAC at minimum; ideally signed, short-lived tokens minted by the app after an authorized user action). Log every command with the initiating identity. Network-restrict the server.

---

### SEC-06 — Hardcoded device secrets for door/laser controllers
**Severity:** Critical
**Location:** `vps/socket-server.js:20-23` (used at `:40`)

**Evidence:**
```js
const DEVICE_SECRETS = {
    'door-controller-01': 'sdflvkjnadflnvgq',
    'laser-cutter-01': 'laser-secret'
};
```

**Impact:** These are the only secrets a device presents to register with the socket server. Committed in the repo, they let an attacker impersonate the door controller or laser cutter (intercept commands, spoof status, or register a rogue device under a trusted ID).

**Remediation:** Move device secrets out of source into a secrets store; provision per-device credentials/certificates; rotate the leaked values.

---

## High

### SEC-07 — JWT signing secret has a guessable hardcoded fallback
**Severity:** High
**Location:** `src/app/api/v1/users/class.js:5`

**Evidence:** `const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';` This secret signs app-issued JWTs (password reset / verification / credential tokens). If `JWT_SECRET` is unset, tokens are signed with a public, well-known string.

**Impact:** With the fallback in effect, an attacker can forge any token this code validates — e.g. mint a token for an arbitrary `userID`/`role`. Note this is separate from NextAuth's session secret (`AUTH_SECRET`, `auth.config.js:11`).

**Remediation:** Remove the fallback; fail at startup if `JWT_SECRET` is unset; rotate.

---

### SEC-08 — Unauthenticated S3 upload with no validation
**Severity:** High
**Location:** `src/app/api/v1/upload/route.js`

**Evidence:** `POST` reads `formData.get('file')` and uploads it to S3 with **no** session check, **no** MIME/type allowlist, **no** size limit, and auto-creates the bucket if missing (`ensureBucketExists`, `:18-32,51`). The object key is `${Date.now()}-${file.name.replace(/\s/g,'_')}` (`:54`) — only whitespace is sanitized, so attacker-controlled `file.name` (path/special chars) flows into the key. `ContentType` is taken from the client (`:60`).

**Impact:** Anonymous users can upload arbitrary files (malware, HTML with attacker-set content-type → stored-XSS if served from a trusted origin), exhaust storage, and trigger bucket creation. Public URL is returned (`:69`).

**Remediation:** Require auth; enforce a MIME allowlist and max size; generate server-side random keys (ignore client filename); set `ContentType` from a validated set; disable bucket auto-create; consider presigned uploads (`@aws-sdk/s3-presigned-post` is already a dependency).

**Status:** ✅ Remediated (branch `remediation/sec-08-s3-upload-hardening`). `upload/route.js` now requires a session; validates the file by **magic bytes** (jpeg/png/gif/webp — SVG excluded to block stored XSS), not the client MIME; caps size at 5 MB; uses a **server-generated UUID key** (`uploads/<uuid>.<ext>`, client filename ignored); sets `ContentType` from the detected type; **removes bucket auto-create**; and drops the hardcoded endpoint/bucket fallbacks (also closes the `upload/route.js` half of SEC-21) with a lazy S3 client. Regression tests: `test/e2e/upload-hardening.test.js`.

---

### SEC-09 — SSRF in the image proxy
**Severity:** High
**Location:** `src/app/api/image-proxy/route.js:12`

**Evidence:** `const response = await fetch(imageUrl);` where `imageUrl` is the raw `?url=` query param. No scheme/host allowlist, no private-IP block, no timeout.

**Impact:** Server-side request forgery. An attacker can make the server fetch internal services and reflect the body back: `?url=http://127.0.0.1:3001/...` (the access-control API), `?url=http://169.254.169.254/latest/meta-data/...` (cloud metadata/credentials), or internal admin dashboards. This is a pivot into the internal network and a potential cloud-credential leak.

**Remediation:** Allowlist permitted hosts (e.g. the S3 domain); reject non-`http(s)`; resolve and block private/link-local/loopback ranges (incl. `169.254.169.254`, `10/8`, `172.16/12`, `192.168/16`, `::1`); cap response size and add a timeout.

**Status:** ✅ Remediated (branch `remediation/sec-09-image-proxy-ssrf`). New SSRF guard `src/lib/ssrf.js` (host allowlist + scheme check + private/loopback/link-local/metadata IP rejection) applied in `image-proxy/route.js`, with per-redirect-hop re-validation, a 5s timeout, a 10 MB cap, and an `image/*` content-type check. Allowlist: S3 host (`S3_ENDPOINT`), `cdn.discordapp.com`, `.googleusercontent.com`, `images.unsplash.com`, extendable via `IMAGE_PROXY_ALLOWED_HOSTS`. Regression tests: `test/unit/ssrf-guard.test.js`, `test/e2e/image-proxy-ssrf.test.js`.

---

### SEC-10 — `/api/*` routes are outside middleware protection
**Severity:** High (systemic)
**Location:** `src/middleware.js:36-38`

**Evidence:**
```js
export const config = { matcher: ["/dashboard/:path*", "/auth/:path*"] };
```
The matcher excludes `/api`. The NextAuth `authorized` callback (`auth.config.js:13-24`) only gates `/dashboard` and otherwise `return true`. So **every** API route must implement its own authn/authz, and many do not (SEC-02, SEC-14, SEC-15, SEC-18).

**Impact:** There is no defense-in-depth baseline for the API surface; a single forgotten check fully exposes an endpoint. This is the root cause that makes several other findings reachable by anonymous callers.

**Remediation:** Either extend the matcher to cover `/api/(v1|admin|internal)/:path*` with a baseline auth gate, or adopt a single enforced wrapper (`withAuth(handler, {role})`) that every route must use; add a lint/CI check that route handlers are wrapped.

---

### SEC-11 — Admin role check commented out on card-pairing endpoint
**Severity:** High
**Location:** `src/app/api/admin/pair-card/route.js:11-16`

**Evidence:** The handler fetches the session but the role enforcement is disabled:
```js
if (!session || !session.user || !['admin','staff'].includes(session.user.role)) {
   // return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
   // For dev speed/debugging, I'm commenting out strict role check ...
}
```
Execution falls through to the pairing call regardless of session/role.

**Impact:** Any caller (even unauthenticated) can initiate access-card pairing against the WS server (`:31`), a step toward provisioning physical access.

**Remediation:** Restore the role check (fail closed); remove the dev bypass.

---

### SEC-12 — Regex injection / ReDoS / over-broad match in user lookup
**Severity:** High
**Location:** `src/app/api/v1/users/model.js:79`, `:94`

**Evidence:**
```js
findOne({ userID: { $regex: new RegExp(`^${query.userID}$`, "i") } })   // :79
findOne({ $or: Object.keys(query).map(k => ({ [k]: { $regex: query[k], $options: "i" } })) })  // :94
```
User-supplied values are interpolated into a regex without escaping.

**Impact:** Combined with SEC-02 (no auth on `GET /api/v1/users`), `GET /api/v1/users?username=.*` returns an arbitrary user's full record; crafted patterns enable ReDoS (CPU DoS) and PII harvesting. Even after auth is added, unescaped regex over indexed identity fields is unsafe.

**Remediation:** Escape user input before regex use, or match exact strings (`findOne({ userID })`) instead of `$regex`. Reserve fuzzy search for an explicit, sanitized search field.

---

### SEC-13 — Hardcoded orchestrator shared secret
**Severity:** High
**Location:** `vps/docker-compose.yml:30` (`ORCHESTRATOR_SECRET=change_me_in_prod`), consumed in `src/services/orchestrator.js`

**Impact:** The orchestrator spins up mission containers. A weak/known shared secret lets an attacker drive container creation (resource abuse; depending on configuration, a path toward host/Docker access).

**Remediation:** Generate a strong random secret; inject via a secrets mechanism, not a committed compose default; rotate.

---

## Medium

### SEC-14 — IDOR on notifications
**Severity:** Medium
**Location:** `src/app/api/v1/notifications/controller.js:4-18` (GET), `:30-53` (PUT), `:20-28` (POST)

**Evidence:** `userID` is taken from the query string (GET) or body (PUT/POST); there is no session check tying it to the caller. `GET ?userID=<victim>` returns their notifications; `PUT {userID, action:"markAllRead"}` mutates them; `POST` creates a notification for any `userID`.

**Impact:** Cross-user read/write of notifications (information disclosure + tampering / notification spoofing).

**Remediation:** Derive `userID` from the session; ignore client-supplied `userID` for ownership.

**Status:** ✅ Remediated (branch `remediation/sec-14-notifications-idor`). `notifications/controller.js` now requires a session on GET/PUT/POST and derives the owner from `session.user.userID`, ignoring any request-supplied `userID` (read + mark-read are scoped to the caller). HTTP POST (which can also fan out to email/Discord) is **admin-only** — app flows create notifications via `NotificationService.create()` server-side, not this endpoint. Sole client (`NotificationBell.js`) already sent its own session userID, so it's unaffected. Regression tests: `test/e2e/notifications-idor.test.js`.

---

### SEC-15 — State-changing membership activation on unauthenticated GET
**Severity:** Medium
**Location:** `src/app/api/v1/memberships/confirm/route.js:9-21,104-140`

**Evidence:** `GET` reads `userID` from the query string with no session check and, on success, sets `membership.status=active`, issues the access key, and awards stake (`:104-136`). It *does* gate on a verified Square payment/subscription for the resolved customer (`:32-102`), which limits pure forgery — but it is still an unauthenticated, side-effecting GET keyed on a caller-supplied `userID`.

**Impact:** Side effects on GET are CSRF-prone and cache/prefetch-unsafe; activation/reward logic is driven by an unauthenticated identifier. Severity is held at Medium because the Square payment gate must still be satisfied.

**Remediation:** Require a session and bind to the session's `userID`; move state mutation off GET (use POST); treat this strictly as a verified callback.

---

### SEC-16 — Webhook signature compared with `===`
**Severity:** Medium
**Location:** `src/app/api/v1/square/webhooks/payment/route.js:12`

**Evidence:** `return hmac.digest("base64") === signature;` — non-constant-time comparison.

**Impact:** Theoretical timing side-channel on signature verification. Lower practical risk than SEC-03 but on the same trust boundary.

**Remediation:** Compare with `crypto.timingSafeEqual` over equal-length buffers.

**Status:** ✅ Remediated (shipped with SEC-03 in PR #47). `verifySquareSignature` (`src/lib/squareSignature.js`) uses `crypto.timingSafeEqual` over equal-length buffers and fails closed; covered by `test/unit/squareSignature.test.js`.

---

### SEC-17 — No idempotency on the payment webhook
**Severity:** Medium
**Location:** `src/app/api/v1/square/webhooks/payment/route.js`

**Evidence:** The handler processes events without recording/deduplicating the Square event ID. Square retries deliver duplicates.

**Impact:** Duplicate processing → double-awarded stake, duplicate state transitions, repeated access-key issuance.

**Remediation:** Persist processed event IDs and short-circuit duplicates; make mutations idempotent (upserts keyed on event/subscription ID).

**Status:** ✅ Remediated (branch `remediation/sec-17-webhook-idempotency`). `src/lib/webhookIdempotency.js` atomically claims each Square `event_id` (unique insert in `processed_webhook_events`, TTL-expired) before any state mutation; a duplicate redelivery is acked 200 and skipped. On processing failure the claim is released so Square's retry reprocesses (exactly-once on success, at-least-once on failure). Guarded by `test/unit/webhook-idempotency.test.js`.

---

### SEC-18 — Unauthenticated seed / migration / test endpoints
**Severity:** Medium
**Location:** `src/app/api/seed/route.js`, `src/app/api/test-toggle/route.js`, `src/app/api/v1/migrations/disable-notifications/route.js`, `src/app/api/v1/migrations/merge-interests/route.js`

**Evidence:** None reference `auth()`/session/role. Migration routes perform bulk writes across all users; `test-toggle` triggers a device toggle.

**Impact:** Anonymous callers can run bulk data mutations or toggle hardware. Even "harmless" seed/migration endpoints are a data-integrity and DoS risk in production.

**Remediation:** Gate behind admin auth (or remove from the deployed build); never ship migration/seed/test handlers as open endpoints.

**Status:** ✅ Remediated (branch `remediation/sec-18-gate-seed-migration`, issue #63). New shared guard `src/lib/adminGuard.js` (`guardOperationalEndpoint`) applied to `seed`, `test-toggle`, `migrations/{disable-notifications, merge-interests, seed-bounty-ideas}`, `badges/seed`, and `bounties/seed`: all now require an **admin** session (anon→401, non-admin→403). The purely dev/test handlers (`seed`, `test-toggle`) additionally **404 in production** (CLAUDE.md §8). Scope notes: `admin/migrate-memberships` was already admin-gated; `holodeck/seed-badges` is intentional CTF content (§14). Regression tests: `test/unit/admin-guard.test.js`, `test/e2e/seed-migration-auth.test.js`.

---

### SEC-19 — Body-driven NoSQL operator injection risk on write routes
**Severity:** Medium
**Location:** `src/app/api/v1/notifications/controller.js:23` (`NotificationService.create(body)`), `src/app/api/v1/users/service.js:25` (`createUser(userData)` from raw body), update paths

**Evidence:** Several handlers pass `await req.json()` objects directly into service/model writes without coercing field types or stripping `$`-prefixed operators. (GET routes use `searchParams.get` → strings, so they are not operator-injectable; the risk is on JSON-body routes.)

**Impact:** Crafted bodies (e.g. fields containing `$`-operators, or unexpected nested objects) can alter query/update semantics or write unintended fields. Compounds with the missing auth findings.

**Remediation:** Validate/whitelist body fields per route (zod or equivalent); reject `$`-prefixed keys; coerce expected scalar types.

**Status:** ✅ Remediated (branch `remediation/sec-19-operator-injection`). Shared `src/lib/mongoSanitize.js` (`stripMongoOperators`, recursive `$`-key strip) applied to the body-driven writes: `users/service.createUser` and `notifications/service.create`. The user self-update path was already whitelisted in E2 (SEC-02, `sanitizeSelfUpdate`, now sharing this helper). GET routes use `searchParams` (strings), not operator-injectable. Guarded by `test/unit/mongo-sanitize.test.js`.

---

## Low / Informational

### SEC-20 — Verbose logging of profiles, PII, and errors
**Severity:** Low
**Location:** `auth.js` (e.g. `:21,29,97,159`), various routes
`console.log` dumps full OAuth profiles, user objects, and raw errors. In production this can leak PII/tokens into log aggregation. **Remediation:** scrub/structure logs; drop profile/object dumps; never log tokens or decrypted email.

### SEC-21 — Hardcoded infrastructure endpoints as fallbacks
**Severity:** Low
**Location:** `src/app/api/v1/upload/route.js:9-14,40,68` (`s3.crittercodes.dev`, `fablab-bounties`), `src/lib/access-control.js:1` (`http://localhost:3001`), `src/app/api/admin/pair-card/route.js:29` (`socket.crittercodes.dev`)
Hardcoded hosts/buckets as `||` fallbacks make environments ambiguous and can route traffic to the wrong target if env vars are missing. **Remediation:** require config explicitly; fail if unset.

### SEC-22 — Orchestrator container spawn input handling
**Severity:** Low (verify)
**Location:** `vps/orchestrator/*`
Container/label names are built from `userID`/`missionID`. A character allowlist appears to be applied before use; confirm it covers all sinks (Traefik rule strings, env injection) and cannot be bypassed. **Remediation:** validate against a strict pattern, prefer the Docker SDK's parameterization over string interpolation.

---

## Appendix A — API route authentication matrix (verified)

Legend: ✅ enforced · ⚠️ partial/incorrect · ❌ none. "Authz" = role/ownership beyond mere login.

| Route | AuthN | AuthZ | Notes |
|-------|:----:|:----:|-------|
| `v1/users` GET/POST/PUT/DELETE | ❌ | ❌ | SEC-02 — full CRUD open; privilege-escalation via PUT |
| `v1/users/merge`, `/nudge`, `/change-password` | ❌ | ❌ | identity from body, no session |
| `v1/notifications` GET/POST/PUT | ❌ | ⚠️ | SEC-14 IDOR via `userID` param |
| `v1/memberships/confirm` | ❌ | ⚠️ | SEC-15 — Square payment gate only |
| `v1/square/webhooks/payment` | ⚠️ | n/a | SEC-03 fails open; SEC-16/17 |
| `internal/check-access`, `register-card` | ⚠️ | n/a | SEC-04 hardcoded fallback secret |
| `v1/upload` | ❌ | ❌ | SEC-08 |
| `image-proxy` | ❌ | n/a | SEC-09 SSRF |
| `seed`, `test-toggle`, `v1/migrations/*` | ❌ | ❌ | SEC-18 |
| `admin/pair-card` | ⚠️ | ❌ | SEC-11 role check commented out |
| `v1/payments`, `donations/checkout` | ❌ | ❌ | unauth payment initiation; validate amounts |
| `v1/portfolio` POST/PUT | ❌ | ⚠️ | actor `userID` from body (IDOR) |
| `v1/arcade/submit`, `terminal/submit-flag` | ⚠️ | ❌ | score/flag attribution from body — CTF game scope |
| `v1/admin/plans` GET/POST/PUT | ✅ | ✅ | correct `role==="admin"` gate (good reference pattern) |
| `v1/transactions/award` | ✅ | ✅ | admin-gated (good) |
| `v1/bounties` GET/POST/PUT | ✅ | ✅ | session + creator/admin ownership (good) |

> The "good" rows show the project already has a correct authorization pattern (`admin/plans`, `transactions/award`, `bounties`). The remediation for most findings is to apply that existing pattern consistently — see `03-boundary-violations.md` for why the inconsistency exists.

## Addendum (2026-05-29) — findings surfaced during remediation planning

These were discovered while defining the encryption/data-protection standard ([`06-security-standards.md`](./06-security-standards.md)). Tracked under Epic **E5**.

### SEC-23 — Weak field-level encryption for PII at rest
**Severity:** High
**Location:** `src/app/api/auth/[...nextauth]/service.js:13,19-62`
**Evidence:**
- Hardcoded fallback key: `const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default_key_32charslong____'` (`:13`).
- `aes-256-cbc` with a **fixed all-zero IV** (`Buffer.alloc(16, 0)`, `:22,32,45,55`) — deterministic and **unauthenticated**.
- Decrypt **fails open**, returning the input ciphertext on error (`:36-38,59-61`).

**Impact:** Deterministic ciphertext leaks equality: anyone who can read the DB (see SEC-01) can confirm whether a specific email/phone exists and correlate records that share a value — a privacy/PII leak. CBC without a MAC is malleable and integrity-free. The fallback key is a landmine (and being 27 bytes it actually throws on `aes-256-cbc`, so the system already depends on the env var — but the literal must go regardless).
**Remediation:** Use authenticated encryption (**AES-256-GCM**, random IV per record) for stored values; for equality search use a separate **keyed HMAC blind index**, not deterministic ciphertext; manage the key in a KMS/secret store with rotation; remove the fallback; make decryption fail closed. (Epic E5 / WI-5.1; key-fallback removal also folds into E3/WI-3.2.)

**Status:** ⚠️ Partially done / planned. The hardcoded fallback key is **removed** (`ENCRYPTION_KEY` is env-only). The crypto redesign (CBC→GCM + HMAC blind index + fail-closed) is a **phased, backfilled, staging-validated data migration** — email is a deterministic-ciphertext *search key* (login/dedup/lookup), so switching to GCM without a blind index + backfilling every record would lock members out. Documented as a step-by-step plan: [`docs/migrations/sec-23-pii-encryption-gcm-blind-index.md`](../migrations/sec-23-pii-encryption-gcm-blind-index.md). Deferred for deliberate execution + SEC sign-off.

### SEC-24 — Sensitive data (incl. verification tokens) written to logs
**Severity:** High
**Location:** `src/app/api/auth/[...nextauth]/service.js:73,82,122`; reinforces SEC-20 (`auth.js`).
**Evidence:** `console.log(userData)` (`:73`) and a create-time log (`:82`) dump user data; `:122` logs the plaintext email **and the email verification token**.
**Impact:** Verification/reset tokens in logs are a direct account-takeover vector; plaintext PII in logs defeats the at-rest encryption and violates data-minimization.
**Remediation:** Remove these logs; adopt a structured logger with field redaction; never log tokens, passwords (even hashed), decrypted PII, or secrets. (Epic E5 / WI-5.2.)

### SEC-25 — No HTTP security headers / transport hardening
**Severity:** Medium
**Location:** `next.config.mjs` (no `headers()`); no HSTS/CSP/`X-Content-Type-Options`/`X-Frame-Options`/`Referrer-Policy`/`Permissions-Policy`.
**Impact:** Missing defense-in-depth against clickjacking, MIME-sniffing, mixed content, referrer leakage; no HSTS to enforce TLS.
**Remediation:** Add a security-headers policy (HSTS w/ preload, a CSP, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`/frame-ancestors, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`); enforce HTTPS. (Epic E5 / WI-5.3.)

## Appendix B — Suggested remediation order
1. Rotate the leaked DB credential and purge git history (SEC-01).
2. Add a baseline API auth gate / wrapper (SEC-10) and lock down `v1/users/*` (SEC-02, SEC-12).
3. Fail-closed on the Square webhook and IoT secrets (SEC-03, SEC-04, SEC-05, SEC-06).
4. Lock the upload route and image proxy (SEC-08, SEC-09).
5. Remove hardcoded/fallback secrets everywhere (SEC-07, SEC-13, SEC-21).
6. Address IDOR / GET-mutation / idempotency / injection (SEC-11, SEC-14–SEC-19).
