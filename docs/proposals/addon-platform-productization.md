---
title: "Goal prompt — Addon platform for multi-FabLab reuse (Phase 1: framework + manager + pilots)"
status: proposed
audience: implementer (Claude Code) + repo owner
related: docs/architecture/plugin-platform.md (ADR 0013)
---

# Goal prompt: make The-Lab a reusable FabLab platform via addons — Phase 1

## 1. North star (the product goal)
Turn The-Lab from one FabLab's site into a **reusable solution other FabLabs deploy as their website /
member manager / etc.** Not every facility needs the same features, so optional functionality lives in
**addons** each facility can **enable/disable and configure**. The admin **Addon Manager** shows every
addon as a **card (icon · name · description · category · enabled state)**; **clicking a card opens a
configuration popup** to edit/save that addon's settings.

## 2. Distribution model (decided)
**Self-host, per-instance.** Each FabLab forks/deploys its **own** instance (own MongoDB, domain,
Coolify, secrets). Addon enable/disable + config is **global to that instance** — **no multi-tenant
SaaS plumbing in this phase**. Design addons **tenant-agnostic** so a future SaaS tenancy layer can be
added without rework, but do not build it now.

## 3. This already largely exists — build on it, do not reinvent
A production-grade, **vetted-only, static-registry** plugin platform is in place (ADR 0013 —
`docs/architecture/plugin-platform.md`). Reuse it:
- **Hook bus** `src/lib/plugins/hooks.js` — `CORE_EVENTS` (4 today), `onHook/offPlugin/emitHook`;
  handlers isolated (a throw is audited `plugin.hook.failed`, never breaks the emitter/siblings);
  **payloads are IDs only, never PII**.
- **Registry/loader** `src/lib/plugins/registry.js` — discovery is a **static import list**
  (`src/plugins/index.js`), **no filesystem/network scan, no `eval`**; `initPlugins()` fails safe (DB
  down ⇒ plugins default disabled, app still boots); `reconcile()` keeps per-instance wiring in sync
  with the DB (source of truth) and reconciles before emit.
- **Context** `src/lib/plugins/context.js` — a plugin touches **only** `ctx = { pluginId, config
  (frozen), on(event,handler), audit(event,fields) }`. No DB handle, no cross-feature model access.
- **Manifest** `src/lib/plugins/manifest.schema.js` (`defineManifest`): `id` (= dir name, kebab
  3–40), `name`, `version` (semver), `description`, `sockets` (catalog: `hooks`, `adminNav`,
  `adminSettings`, `apiRoutes`, `tasks`), `configSchema` (**flat primitives only** today:
  `number|string|boolean|string[]`, with `default/min/max/immutable`), `requiredPermissions`,
  `enabledByDefault` (its state IS the feature flag; ships `false`).
- **Persistence** `src/lib/plugins/model.js` — one `plugins` doc per id: `{ _id:"plugin:<id>",
  pluginId, enabled, config, updatedAt, updatedBy }`; **global (no tenant axis)**.
- **Admin API** `GET/PATCH/PUT /api/v1/admin/plugins` (list / setEnabled / **PUT** setConfig) —
  admin-gated, `checkReady()` before enable, `validateConfig` drops unknown/`$`/`_id` keys + honors
  `immutable`, audited. **Route guard** `requirePluginEnabled` → disabled/unknown ⇒ **404**, fails
  closed.
- **Reference addons (the template to copy):** `src/plugins/door-access-controller/` and
  `src/plugins/member-email/` — each **owns its own collections** and reads core **only via published
  services** (`UsersService`/`UserService`), never another feature's model.
- **Tests exist:** `test/unit/plugin-manifest.test.js`, `plugin-permissions.test.js`;
  `test/e2e/plugin-registry-reconcile.test.js`, `plugin-service-readiness.test.js`,
  `plugins-admin-authz.test.js`.

## 4. The gap between "as-built" and the goal (what Phase 1 closes)
1. **Card → config popup is unbuilt (but close).** Two split surfaces today: the admin-home
   (`dashboard/admin/page.js`) renders enabled-plugin cards that **navigate to the plugin's full
   page**; config editing is an **inline schema-driven form on a separate page**
   (`dashboard/admin/plugins/page.js`, `ConfigField`). No modal, and card ≠ its config UI. Unifying
   is **mostly UI reassembly** — the schema-driven form already exists.
2. **Card metadata isn't first-class.** Icon/description reach the card only via `adminNav` extra
   keys (`sym`/`desc`/`color`) that pass through **unvalidated**. Promote `icon`, `description`,
   `category` to validated manifest fields for a real gallery card.
3. **Config schema is too thin for real settings** — no `select`/enum, `secret`, multiline/`text`, or
   grouped fields; rich addons (door's policy) bypass `configSchema` into their own model, so those
   settings aren't discoverable/editable through the manager.
4. **Only 4 hook events (membership lifecycle).** To make more features addons without them
   reaching into core models, the **event catalog must broaden** (check-in, payment/subscription,
   badge-award, portfolio-publish, …) — versioned, still ID-only payloads.

## 5. Scope of Phase 1 (and what is explicitly OUT)
**In:** formalize the addon manifest (card metadata + richer, still-declarative config schema); build
the **Addon Manager gallery (cards) → config popup (schema-rendered, validated, save)** unified with
enable/disable; broaden the event catalog enough for the pilots; **extract 1–2 pilot addons** end-to-
end to prove the pattern (incl. their config popup).

**Out (deferred — do NOT do in Phase 1; record as backlog §8):** multi-tenant SaaS / per-tenant
enable+config+isolation; extracting **all** addon-candidates; **de-branding / facility-config**
parameterization (30+ hardcoded FabLab-Fort-Smith strings, domains, Discord/CTF); addon
packaging/distribution as artifacts; decoupling the entangled shared-state features (badges, bounties,
portfolio, volunteers, coupons, wallet, the "Hack the Lab" CTF cluster) off the `users` document.

## 6. Non-negotiable invariants (carry through every slice)
- **Security model of ADR 0013 stays intact:** static registry, **no `eval`/dynamic import of addon
  code**, vetted-only; guards **fail closed** (disabled ⇒ 404); `checkReady()` gates enable; every
  enable/disable/config mutation **admin-gated + audited**; **event payloads remain ID-only (no
  PII)**; a plugin still touches only `ctx` (published services + its own collections).
- **Config validation is server-side** (extend `validateConfig`) — the popup is convenience, not the
  control; reject unknown/`$`/`_id`, honor `immutable`, and validate the new field types (enum
  membership, secret write-only, length/format).
- **Secrets never leave the server** — a `secret` config field is **write-only**: never returned in
  the GET/list payload or rendered with its value in the popup (show "set/unset" + replace).
- **Per-slice:** own branch/worktree off `dev`, signed commits (noreply email), tests to the master
  §4 gate, `sdlc-security-engineer` review, fold findings, own PR, **owner merges**. Docs updated
  (ADR 0013 + addon-author guide).
- **Prod-promotion gate (learned 2026-09-06):** `main` == prod; never promote/deploy prod without
  explicit approval; auto-deploy is OFF; promote via the runbook. All this work lands on `dev` →
  staging; production is a separate, approved step.

## 7. Slice plan (AD-1 … AD-5) — each its own branch/PR, SEC-reviewed
- **AD-1 — Manifest: card metadata + richer config schema.**
  Add validated `icon` (emoji/short), `description`, `category` to the manifest for the gallery card
  (migrate the two existing manifests off `adminNav` extras). Extend `configSchema` field types with
  `select` (enum + options), `secret` (write-only), `text` (multiline), and per-field `label`/`help`;
  extend `validateConfig` + coercion accordingly. Update `defineManifest` + both reference manifests.
  Tests: manifest validation (good/bad), config validation incl. new types + secret redaction.
  *Acceptance:* `defineManifest` accepts/validates the new fields; secret values never serialize.

- **AD-2 — Addon Manager: gallery cards → config popup.**
  Unify the two surfaces into one Addon Manager: a **gallery of cards** (icon · name · description ·
  category · enabled badge · ready/not-ready) for **all** registered addons; **click → accessible
  modal** (WCAG 2.2 AA — focus trap, Esc, `aria-modal`/labelledby) that renders the schema-driven
  form (reuse/extend `ConfigField` for the AD-1 types) + the enable/disable toggle; save calls the
  existing `PATCH`/`PUT /api/v1/admin/plugins` with server-side validation; disabled-but-configurable
  addons still open. Keep the admin-home enabled-plugin cards linking to full pages (unchanged).
  Tests: route/authz unchanged + green; a component/axe smoke on the manager (jest-axe already added
  in AC-8b). *Acceptance:* card→popup edit/save works; secret fields show set/unset only; a11y-clean.

- **AD-3 — Broaden the event catalog (versioned, ID-only).**
  Add the `CORE_EVENTS` the pilots need + obvious near-terms — e.g. `CHECKIN_RECORDED`,
  `PAYMENT_SUCCEEDED`, `SUBSCRIPTION_CHANGED`, `BADGE_AWARDED`, `PORTFOLIO_PUBLISHED`,
  `CONTACT_SUBMITTED` — with ID-only payloads, emit sites in the owning core services (best-effort,
  never block the core txn), and `KNOWN_EVENTS` validation. Document the catalog in ADR 0013.
  Tests: emit-site unit tests (fire best-effort, isolated). *Acceptance:* new events fire without
  affecting the core path; a handler throw stays isolated + audited.

- **AD-4 — Pilot addon A (cleanest extraction): `contact-submissions`.**
  Recommended first pilot — the map found it has **no core imports**. Extract into
  `src/plugins/contact/` following the door/member-email template: manifest (card icon/name/desc/
  category + `adminNav` to its admin list + `configSchema`: e.g. notification recipient (secret? or
  plain email), retention days, honeypot toggle), owns the `contact_submissions` collection, subscribe
  to nothing or emit `CONTACT_SUBMITTED`; register in `src/plugins/index.js`; route guard so it 404s
  when disabled. Prove card→popup config end-to-end. Tests + SEC review.
  *Acceptance:* enabling/disabling toggles the feature + its admin surface; config edits via the popup
  take effect; disabled ⇒ routes 404.

- **AD-5 — Pilot addon B (proves a coupled-ish extraction): `repair` **or** `announcements`.**
  Pick one self-contained-but-slightly-coupled feature to prove the pattern past the trivial case.
  `repair` (own `repairs` collection, route currently has no auth import — add proper admin gating as
  part of extraction) or `announcements` (auth-only). Same template: manifest + card + config (e.g.
  repair: categories, SLA days, auto-notify on status change via an event; announcements: default
  channel, pin limit). Tests + SEC review.
  *Acceptance:* second addon lands using the identical template — demonstrating repeatability + that
  the manager/gallery scales to N addons.

> If the owner wants a stretch pilot instead of AD-5, the **"Hack the Lab" CTF bundle**
> (`arcade`+`holodeck`+`terminal`+`bugs`) is the highest-value optional feature to make an addon — but
> it's **NEEDS-DECOUPLING** (reaches `users.stake`/`badges`/`capturedFlags` + models directly), so it
> belongs after the §8 decoupling work, not in Phase 1.

## 8. Deferred backlog (Phase 2+ — do not start without a new go-ahead)
- **Decouple shared state off `users`:** move `stake`(wallet), `badges`, `capturedFlags`,
  `membership.volunteerLog`, `membership.accessKey` and the `users/service.js` imports of
  Badge/Bounty/Portfolio models behind published services + events (the pattern door/member-email
  already prove) — the precondition to extracting badges/bounties/portfolio/volunteers/wallet/CTF.
- **Multi-tenant SaaS axis:** add a tenant dimension to `plugins` state + registry/guard/`isEnabled`,
  per-tenant config/secrets, and data isolation (tenantId + enforced filter, or DB-per-tenant).
- **De-branding / facility-config layer:** a single facility config (name, domain, logo, colors,
  contact email, integration creds, feature defaults) replacing the 30+ hardcoded org strings/domains
  and the Discord/CTF specifics; seed/defaults for a new facility.
- **Addon packaging/distribution:** a versioned addon artifact + install flow (still vetted-only) so
  another FabLab adds an addon without sharing full source.
- **Richer config** beyond AD-1 (nested/grouped schemas) if addons demand it.

## 9. Definition of done (Phase 1)
- Manifest supports validated card metadata + the richer config field types; secrets write-only.
- Addon Manager renders a card gallery for all addons; card→popup edits + saves config (server-
  validated) + toggles enable/disable; WCAG 2.2 AA; existing admin-plugins API/authz/guard tests
  still green.
- Event catalog broadened + documented; emit sites isolated/best-effort.
- **1–2 pilot features shipped as real addons** using the reference template, enable/disable/config
  proven end-to-end, routes 404 when disabled.
- Every slice: tests to gate, SEC-reviewed, own PR, owner-merged to `dev`; ADR 0013 + a new
  **addon-author guide** updated. No prod deploy without explicit approval.
