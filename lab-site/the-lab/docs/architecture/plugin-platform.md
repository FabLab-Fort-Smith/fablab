---
title: Plugin Platform
status: current
audience: developers, operators, reviewers
owners: app dev
last_reviewed: 2026-07-13
related:
  - overview.md
  - integrations.md
  - ../features/member-email.md
---

# Plugin Platform

> **Status:** Current — the in-repo, vetted-only plugin system (ADR 0013).
> **Audience:** Engineers building plugins or reviewing plugin code. · **Last reviewed:** 2026-07-13

## What this is (and is not)

A **WordPress-style** system for optional features an admin can enable/disable and configure at
runtime — **without** WordPress's arbitrary-code-upload risk. Plugins are ordinary **in-repo code**,
discovered from a **static list** (`src/plugins/index.js`), reviewed and CI-gated like any module.
No filesystem scan, no upload, no `eval`, no remote fetch. Manifests are inert data. See ADR 0013.

## Anatomy of a plugin

A plugin lives in `src/plugins/<id>/` and its module exports `{ manifest, register?, onEnable?,
onDisable?, onConfigChange? }`. It is registered by adding it to `src/plugins/index.js`.

### Manifest (the standard shape) — `manifest.schema.js`
```js
{
  id: "member-email",           // kebab slug; equals the directory name
  name, version, description, author,
  sockets: { hooks: [...], adminNav: {label, path, ...}, adminSettings: true, apiRoutes: [...] },
  configSchema: { field: { type: "number|string|boolean|string[]", default, min, max, immutable, description } },
  requiredPermissions: ["<perm-token>"],
  enabledByDefault: false,      // its enabled state IS the feature flag
}
```
Validated + **frozen** at registry build (`defineManifest`). An unknown socket, bad type, or bad
adminNav path throws — a malformed plugin fails loudly, never half-loads.

## Sockets (extension points)

| Socket | Kind | How a plugin uses it |
|---|---|---|
| `hooks` | server events | subscribe in `register(ctx)` via `ctx.on(event, handler)` |
| `adminNav` | UI slot | manifest declares a link; enabled plugins' links merge into the admin home |
| `adminSettings` | UI slot | a config form is rendered from `configSchema` in the plugins panel |
| `apiRoutes` | HTTP | thin `route.js` shims under `src/app/api/v1/plugins/<id>/` guard + delegate |
| `tasks` | cron | (optional) guarded internal route hit by external cron |

### Hook (event) bus — `src/lib/plugins/hooks.js`
The core emits typed domain events at canonical transition sites; enabled plugins subscribe. This is
how a plugin reacts to core state **without importing another feature's model** — the bus mediates.
Handlers are best-effort and isolated (a throw is audited, never breaks the emitter). Core events:

| Event | Emitted from | Payload |
|---|---|---|
| `member.registered` | `AuthService.register` | `{ userID }` |
| `membership.activated` | `memberships/confirm` (status→active) | `{ userID, type }` |
| `membership.suspended` | `memberships/subscription` (cancel / non-active sync) | `{ userID }` |
| `member.deleted` | `UserService.deleteUser` | `{ userID }` |

Core code emits via **`registry.emitEvent(event, payload)`** (not the raw bus): it **reconciles**
this instance's wiring against the DB first, so an event still reaches a plugin that was enabled on a
**different** server instance (the in-process bus alone would miss it). Handlers stay best-effort.

## Lifecycle & state

- **Discovery/boot:** `src/instrumentation.js register()` calls `initPlugins()` after env validation.
  The registry validates manifests, hydrates enabled/config from the DB, and wires enabled plugins'
  hooks. Fails safe (plugins default disabled) if the DB is unavailable.
- **State (durable source of truth):** a `plugins` collection, one fixed-`_id` doc per plugin
  (`{ pluginId, enabled, config, updatedBy, updatedAt }`), owned by `src/lib/plugins/model.js` (the
  only platform file that touches `db`).
- **Enable/disable/config:** `src/lib/plugins/service.js` (admin-only, audited) persists to the DB
  then reflects the change on the instance (wire/unwire hooks, re-read config).
- **Route gating:** a disabled (or unknown) plugin's API shims return **404** via
  `requirePluginEnabled` — the surface truly disappears. Reads the DB; fails **closed**.

## Managing plugins (admin)

- **API:** `GET/PATCH/PUT /api/v1/admin/plugins` (admin-only; thin route → controller → service).
- **UI:** `/dashboard/admin/plugins` — list, enable/disable, and edit config (form generated from
  `configSchema`).

## Permissions (single choke point)

`src/lib/plugins/permissions.js` `hasPermission(actor, perm)` — today every plugin permission
resolves to `isAdmin(actor)` (the app's one privileged role). **Group-ready seam:** to add named
groups later, extend the session in `auth.js` (`jwt` + `session` callbacks) to carry
`permissions`/`groups` and change this one function — no plugin or route changes.

## Readiness gate

A plugin module may export **`checkReady()` → `{ ok, reason? }`**. The platform calls it in
`setEnabled(true)` and **refuses to enable** (400) when `ok === false` — so an admin can't turn on a
feature whose required config/integration is missing (e.g. member-email requires `PURELYMAIL_*`).

## Building a new plugin — checklist

1. `src/plugins/<id>/plugin.manifest.js` — `defineManifest({...})`.
2. `index.js` — export `{ manifest, register?, onEnable?, checkReady?, ... }`; wire hooks in `register(ctx)`.
3. Business layers per the app convention: `service.js`, `model.js` (owns `db`), `class.js`.
4. API shims under `src/app/api/v1/plugins/<id>/**/route.js`: `requirePluginEnabled('<id>')` → delegate.
5. Add the module to `src/plugins/index.js`.
6. Tests (unit + abuse/e2e) and docs; ship `enabledByDefault: false`.
