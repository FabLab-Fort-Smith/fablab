---
title: Door Access Controller (addon)
status: draft
audience: developers, operators, reviewers
owners: app dev, SEC
last_reviewed: 2026-08-19
related:
  - access-control-iot.md
  - auth.md
  - data-model.md
---

# Door Access Controller (addon)

> **Status:** Draft / scaffold — the pure policy engine + plugin wiring exist and are tested; the
> model, HTTP routes, admin UI, and offline-allowlist signer are the next slices (see
> [Migration](#migration-strangler-not-big-bang)).
> **Audience:** Engineers and operators on physical access control. Security-relevant (touches the
> `vps/` IoT tier + authorization) — SEC review required (`CLAUDE.md` §2/§6).

## Why this addon

Physical door access already works, but the logic is **scattered and hardcoded**: good-standing
rules live inline in `src/app/api/v1/access/unlock/route.js` and `src/app/api/internal/check-access/route.js`,
pairing in `admin/pair-card` + `memberships/pair-key`, and there is no configurable role/time policy.
This addon **consolidates** that into one policy-owning plugin and **adds** configurable
role × time × door × account policy, QR + app-triggered entry, and a signed **offline allowlist** for
availability — without changing the Pi Pico / Pi Zero firmware or the `vps/socket-server.js` control
contract.

## The one rule the design turns on

**The core owns identity; the addon owns policy.** The core app resolves membership **facts** (status,
role, subscription, waived, community) and **presents them per request**. The addon **never re-derives
good-standing** — it receives facts and applies door policy → `ALLOW` / `DENY`. This keeps membership as
the single source of truth and the addon as a pure, testable policy engine
(`src/plugins/door-access-controller/policy.js`).

## Hardware (as-is)

The door unit is **two boards**; only the Pico holds the WebSocket to the VPS.

```
[Pi Zero: NFC reader + UI]  --UART/GPIO-->  [Pi Pico: door relay + WS client]  --WSS-->  [vps/socket-server]
```

Scan → Pi Zero reads → Pi Pico sends over WS → validated on the VPS → Pi Pico unlocks on-authorized →
Pi Zero shows `Authorized | Unauthorized`.

## Trust boundaries & secrets

Reuses the existing IoT-tier secrets (`access-control-iot.md`), all env-only, constant-time, fail-closed:

| Secret | Guards |
|---|---|
| `DEVICE_SECRETS` | door device → socket-server WebSocket auth |
| `SOCKET_API_SECRET` | app → socket-server control (unlock, allowlist push) |
| `INTERNAL_API_SECRET` | socket-server → app scan-authorize (`internal/check-access`) |
| `DOOR_ALLOWLIST_SIGNING_KEY` *(new)* | addon signs the offline allowlist; device/socket-server verify (Ed25519) |

## Flow A — online scan (primary)

```mermaid
sequenceDiagram
  autonumber
  participant Z as Pi Zero (NFC+UI)
  participant P as Pi Pico (relay+WS)
  participant S as socket-server (VPS)
  participant C as App core
  participant A as Addon policy
  Z->>P: card UID (local)
  P->>S: scan {cred, doorId} over WS  [DEVICE_SECRETS]
  S->>C: POST /internal/check-access  [INTERNAL_API_SECRET]
  Note over C: resolve cred → member; load FACTS (status·role·sub·ban)
  C->>A: decide(facts, door, now)
  Note over A: policy: role × time-window × door × account
  A-->>C: allow / deny + reason
  Note over C: audit(outcome, door)
  C-->>S: {granted, minimal id}
  S-->>P: result over WS
  Note over P: on-authorized → fire relay (fail-secure)
  P-->>Z: result → UI: Authorized / Unauthorized
```

The `decide()` at the core→addon boundary is the one edge the split turns on. Validation stays "on the
VPS" as today — the socket-server just delegates the decision to the core, which presents facts.

## Flow B — app-triggered unlock (push)

```mermaid
sequenceDiagram
  autonumber
  participant M as Member app (session)
  participant C as App core (access/unlock)
  participant A as Addon policy
  participant S as socket-server → Pico relay
  M->>C: POST /access/unlock (session)
  Note over C: identity + facts from session
  C->>A: decide(facts, door, now)
  A-->>C: allow / deny
  C->>S: on ALLOW → unlockDoor(deviceId)  [SOCKET_API_SECRET]
```

Same `decide()`, second entry point — the badge path and the app path can never disagree.

## Flow C — offline (fail-secure)

```mermaid
sequenceDiagram
  autonumber
  participant A as Addon policy
  participant S as socket-server (local grant DB)
  participant P as Pi Pico
  Note over A: every N min — build list: hash(cred) → doors·windows·expiry; sign(Ed25519)
  A->>S: push signed snapshot  [SOCKET_API_SECRET]
  Note over S,P: --- later: app core unreachable ---
  P->>S: scan over WS
  Note over S: verify sig + TTL, match hash, check door + window (no live core)
  S-->>P: valid & in-window → UNLOCK; missing/expired → DENY
```

The socket-server replays a signed, expiring grant the addon already computed; it never derives
membership. App down → "recent grants only"; VPS down → doors held, exit stays mechanical. Revocation
lag during an outage = one refresh interval (bounded, documented).

## Data model

Flat operational knobs live in the manifest `configSchema` (`requireGoodStanding`, `allowAdminBypass`,
`defaultTimezone`, `offlineRefreshMinutes`, `offlineTtlMinutes`). The **structured** policy is too rich
for the flat schema and lives in the addon's own collection(s) (`model.js`, layered per `CLAUDE.md` §4):

- **Door registry** — `{ doorId, name, deviceId, timezone, enabled }`.
- **Access policy** — `rules: Rule[]` + `accountOverrides: {userID → "allow"|"deny"}`. A `Rule` is
  `{ id, roles[], doors[], windows[], credentialTypes? }` (see the `policy.js` JSDoc). `"deny"` is a ban
  (wins over everything); `"allow"` waives only the good-standing gate — rules still apply.
- **Card model** — `{ userID, codeEnc, pairedAt }`. Card codes are **Restricted/PII** → **AES-256-GCM +
  random IV** at rest (`CLAUDE.md` §5); a **keyed HMAC blind index** for scan lookup (never deterministic
  ciphertext, never logged).
- **Offline allowlist snapshot** — `{ issuedAt, ttl, entries: [{ credHash, doors[], windows[] }], sig }`,
  signed Ed25519. `credHash` is a keyed hash, not the raw card code.

## Scaffold status

Built + tested (slice 1 — policy engine):
- `policy.js` — pure engine `decide(facts, door, credentialType, now, policy)`; deny-by-default;
  admin-bypass, ban-wins, good-standing gate, role/door/window/credential rules, overnight windows.

Built + tested (slice 2 — model + authorize route):
- `cardCrypto.js` — AES-256-GCM (random IV) at rest + keyed HMAC **blind index** for lookup; raw
  card codes never stored/logged.
- `facts.js` — pure `user → Facts` projection (the "core presents facts" boundary).
- `model.js` / `class.js` — `doorAccessCards` (encrypted, unique blind index), `doorAccessDoors`
  registry, single `doorAccessPolicy` doc. Only file that touches the DB.
- `service.js` — `authorize({credentialType, credentialValue, doorId, now})`: resolve credential →
  member (blind index, or session userID for app), read facts via `UsersService`, load policy+door,
  `decide()`, audit every outcome. Revocation hooks now soft-revoke / delete the member's cards.
- `controller.js` + `src/app/api/v1/plugins/door-access-controller/authorize/route.js` — machine-to-machine
  endpoint for the socket-server, guarded by `requirePluginEnabled` (404 when off) + `INTERNAL_API_SECRET`
  (constant-time). Returns only `{granted}` + minimal identity.
- `checkReady()` now gates enable on `accessControlReady()` **and** `cardCryptoReady()`.
- **63 unit tests** total (`test/unit/doorAccess*.test.js`): policy 21, crypto 6, facts 4, service 6,
  route 5 (+ existing plugin registry/manifest suites still green).

Built + tested (slice 3 — parallel-run + cutover):
- `parallelRun.js` — `shadowCompare({user, doorId, liveGranted})` evaluates the addon policy against
  the user the LIVE path already resolved (isolating the policy migration from the card-store
  migration), audits `door-access.shadow` as `agree`/`diverged`, and reports `authoritative` only when
  the cutover flag is set. **Never throws; never mutates the live decision.**
- `internal/check-access/route.js` instrumented: computes the live decision as before, then consults
  `shadowCompare` inside the existing try/catch. Shadow-only by default (no behavior change); returns
  the addon decision **only** when the addon is enabled AND `config.authoritative === true`.
- New `authoritative` boolean in the manifest `configSchema` (default false) — the admin-controlled
  cutover switch. **12 more tests** (`doorAccessParallelRun` 6, `checkAccessParallelRun` 6).

Migration procedure with this slice: enable the addon in staging (shadow only) → seed policy + doors →
watch `door-access.shadow` for `diverged` events until they're understood/zero → flip `authoritative`
→ verify → then retire the inline good-standing block from `check-access`.

Built + tested (slice 4 — enrollment + migration):
- `Service.enrollCard({userID, code})` — encrypt (GCM) + blind index → replace the member's card in
  the addon store (one active card per member). Raw code never logged/returned.
- `parallelRun.enrollIfEnabled({userID, code})` — guarded coexistence hook: enrolls into the addon
  store when the addon is enabled + card keys are set; **never throws**, never logs the code.
- `internal/register-card/route.js` — now calls `enrollIfEnabled` after the live plaintext save (both
  stores stay in sync during migration), and **stops logging the card code** (SEC §5 leak fixed).
- `scripts/migrate-access-cards.mjs` — idempotent, resumable, `--dry-run`, `--limit` backfill of the
  existing plaintext `membership.accessKey.code` into the encrypted addon store; counts only, never a
  code. Its inline crypto is locked to `cardCrypto.js` by a **pinned blind-index test vector**.
- **11 more tests** (pinned vector, `enrollCard` ×2, `enrollIfEnabled` ×3, `register-card` ×4 incl. a
  no-code-in-logs assertion). Migration script `node --check` clean.

Migration order: deploy this → enable addon in staging → run `migrate-access-cards.mjs --dry-run` then
for real → new pairings enroll automatically via `register-card` → the addon's authorize/shadow now
resolves real cards → proceed with the parallel-run/cutover from slice 3.

Built + tested (slice 5 — app-triggered unlock):
- `access/unlock/route.js` instrumented with the same guarded shadow/cutover as `check-access`:
  computes the live good-standing decision (unchanged responses/audits), then `shadowCompare({user,
  doorId, credentialType:"app", liveGranted})`. In shadow mode the live decision stands; under cutover
  the addon decides the gate. The physical unlock (`toggleLight`) fires only on a grant. Also dropped a
  `console.log` that printed the username + standing detail (minor info-leak reduction).
- **7 tests** (`accessUnlockParallelRun`): 401/404, shadow-mode grant/deny (community, lapsed), and
  cutover deny-overrides-grant / grant-overrides-community-deny.

Both live entry points (`check-access` scan + `access/unlock` app tap) now route through the SAME
addon `shadowCompare`/policy — one decision, no drift — flag-gated by `authoritative`.

Built + tested (slice 6 — offline allowlist, app side):
- `allowlistCrypto.js` — **Ed25519** sign/verify over a canonical (key-order-independent) payload;
  app holds the private `DOOR_ALLOWLIST_SIGNING_KEY`, the socket-server only the public
  `DOOR_ALLOWLIST_VERIFY_KEY`. Verify never throws.
- `policy.allowedDoorsForFacts()` — time-independent projection (which doors + windows a member
  gets) used to build a snapshot entry per card.
- `Service.buildSignedAllowlist()` — assembles `{credHash: card.bi, entries:[{doorId, windows}]}`
  per active card (facts via `UsersService`), stamps `issuedAt`/`expiresAt` (TTL), signs.
  `Service.refreshAllowlist()` builds + `pushAllowlist()` to the socket-server (skips, audited, if
  unsigned). Revocation hooks now best-effort re-push.
- `offlineDecision.decideOffline()` — the **canonical** offline check (verify sig + TTL → credHash →
  door → window; deny-by-default) the socket-server ports.
- Guarded refresh route `POST /api/v1/plugins/door-access-controller/allowlist/refresh`
  (`requirePluginEnabled` + `INTERNAL_API_SECRET`), for a timer to call every `offlineRefreshMinutes`.
- **27 tests** (crypto 7, projection 7, offline-decision 6, service 4, route 3).

Built + tested (slice 7 — socket-server wiring):
- `vps/lib/offlineAccess.js` — the socket-server's offline decider + in-memory snapshot store: a
  faithful **port** of the addon's verify + blind-index + decide logic (Ed25519 `DOOR_ALLOWLIST_VERIFY_KEY`,
  `DOOR_CARD_INDEX_KEY` to recompute a scanned code's `credHash`). `setSnapshot` verifies before storing
  (a forged push is rejected). A `door-access.tz` in the snapshot carries the window timezone.
- `vps/socket-server.js` endpoints (all `requireApiSecret`):
  - `POST /api/v2/allowlist` — store the pushed signed snapshot.
  - `GET  /api/v2/allowlist/status` — `{hasSnapshot, expiresAt, entryCount, expired}`.
  - `POST /api/v2/authorize` — authorize a scan **online-first** (calls the app's `check-access` with a
    4s timeout via `APP_INTERNAL_URL` + `INTERNAL_API_SECRET`), falling back to the offline decision on
    any failure. Returns `{granted, mode:"online"|"offline", reason?}`. The panel points here instead of
    calling `check-access` directly, so doors keep working during an app/network outage (fail-secure).
- **Parity guard**: `doorAccessOfflineParity` asserts the addon (signer/decider) and the vps port agree
  on blind index + the full decision reason space, so the two can't silently drift.
- **~20 tests** (`vpsOfflineAccess` + `doorAccessOfflineParity`); the addon signs, the vps verifies
  (interop proven). `node --check` clean on the socket-server; the existing `apiAuth` vps test still green.

Deferred to the vps deploy: the panel/device points its scan authorization at
`POST /api/v2/authorize`, and a timer (or the app) calls `.../allowlist/refresh` every
`offlineRefreshMinutes`. Snapshot persistence across a socket-server restart (currently in-memory →
fail-secure until the next push) is a follow-up if a restart-during-outage window matters.

Built + tested (slice 8 — admin UI):
- Admin API `GET/POST /api/v1/plugins/door-access-controller/admin` (thin shim → controller;
  `requirePluginEnabled` + session). Service methods `adminOverview`, `adminUpsertDoor`,
  `adminSavePolicy`, `adminRevokeCard` — **admin-only** via `assertPermission(actor, PERM_ADMIN)`
  (deny-by-default), input-validated (rejects `$`/dotted override keys = Mongo-injection defense),
  and **cards are sanitized** (never return `codeEnc`/`bi`). Policy save + card revoke best-effort
  re-push the allowlist.
- Admin page `src/app/dashboard/admin/door-access-controller/page.js` (matches the `adminNav` path):
  doors table + add/update form, policy editor (rules + overrides), paired-cards table with revoke,
  and an allowlist status + "Refresh now". Accessible: `<main>` + heading order, `<label htmlFor>` on
  every input, `<th scope>`, an `aria-live` status region. UX gate only — the API enforces authz.
- **13 tests** (`doorAccessAdminService` 6, `doorAccessAdminRoute` 7): non-admin → 403 on every
  mutation, validation/injection rejects, card sanitization, 404-when-disabled, 401-no-session.

The `authoritative` cutover flag is edited through the platform's generic plugin **config** panel
(`adminSettings: true`), not this page.

Next slices (own branches/PRs):
1. **E2E** — DB-backed authorize test (mongodb-memory-server) for the full request→DB→response path.
2. **Retire plaintext** — once cutover is proven, stop writing `membership.accessKey.code` and drop it.
3. **Manual a11y pass** (keyboard + screen reader) on the admin page before it ships (master a11y mandate).

## Migration (strangler, not big-bang)

Real doors are live. Do **not** cut over in one step:
1. Land `policy.decide()` + tests (this slice) — no behavior change; addon disabled.
2. **Parallel-run**: call `decide()` alongside the existing inline good-standing check in
   `check-access`/`access/unlock`, log divergences, compare before trusting it.
3. Move each route to `decide()` one at a time once parallel-run agrees.
4. Add the offline allowlist + socket-server verify; enable the addon in **staging** first (DAST).
5. Enable in production via the admin panel (the feature flag). Firmware unchanged throughout.

## Threat model (STRIDE, quick pass)

| Threat | Control |
|---|---|
| **S**poofing a device / the socket-server | `DEVICE_SECRETS` (WS), `SOCKET_API_SECRET` / `INTERNAL_API_SECRET` (HTTP), all constant-time, fail-closed |
| **T**ampering with the offline list | Ed25519 signature + short TTL; `credHash` keyed; a stale/forged list won't verify |
| **R**epudiation | every decision (grant **and** deny) audited with actor, door, reason (`src/lib/audit.js`) — no PII |
| **I**nfo disclosure | card codes AES-256-GCM at rest + blind index; responses return minimal identity; nothing sensitive logged |
| **D**enial of service | fail-secure entry + mechanical egress; offline cache keeps recent grants working through an app/network outage |
| **E**levation of privilege | deny-by-default policy; ban wins over admin; addon enable/config is high-impact → gated + audited, narrower privilege than generic admin (planned) |

Abuse cases to test (per `CLAUDE.md` §7): anonymous scan → deny; forged `INTERNAL_API_SECRET` → 401;
banned user during their normal window → deny; replay of an expired allowlist → deny; disabled addon →
route 404 (fail-closed).

## Required env vars (additions)

| Variable | Where | Purpose |
|---|---|---|
| `DOOR_CARD_ENC_KEY` | `cardCrypto.js` | secret → AES-256-GCM key (SHA-256 derived) encrypting card codes at rest |
| `DOOR_CARD_INDEX_KEY` | `cardCrypto.js` | secret → HMAC key for the card blind index (lookup without a reversible ciphertext) |
| `DOOR_ALLOWLIST_SIGNING_KEY` | addon (`allowlistCrypto.js`) | Ed25519 **private** key (base64 pkcs8 DER) — signs the offline allowlist (Flow C) |
| `DOOR_ALLOWLIST_VERIFY_KEY` | socket-server (`vps/lib/offlineAccess.js`) | Ed25519 **public** key (base64 spki DER) — verifies the snapshot; app-side tests also use it |
| `DOOR_CARD_INDEX_KEY` (also on vps) | socket-server | recompute a scanned code's `credHash` offline (same HMAC secret as the app's card index) |
| `APP_INTERNAL_URL` | socket-server | app base URL for the online `check-access` call in `POST /api/v2/authorize` (offline fallback if unreachable) |

Both card keys are required to enable the addon (`checkReady`), and must be provisioned from the
secret store per environment — never committed (`workflow-secrets`).

Existing `ACCESS_CONTROL_API_URL`, `SOCKET_API_SECRET`, `WS_SERVER_URL`, `INTERNAL_API_SECRET`,
`DEVICE_SECRETS` are reused (`access-control-iot.md`).

## Changelog
| Date | Change | Author |
|------|--------|--------|
| 2026-08-19 | Draft + policy-engine scaffold | app dev |
