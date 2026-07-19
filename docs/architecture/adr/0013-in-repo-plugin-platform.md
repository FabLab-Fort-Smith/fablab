# ADR 0013 — In-repo plugin platform for The-Lab

- **Status:** Accepted
- **Date:** 2026-07-13

## Context

The-Lab needs a way to ship self-contained, optional features that admins can turn on/off and
configure at runtime — starting with **member email provisioning** (self-service
`xxxx@fablabfortsmith.org` mailboxes via PurelyMail). The ask was for a "WordPress-style" plugin
system: a standard plugin *shape*, a *lifecycle*, and typed *extension points* ("sockets"), with an
admin panel to manage them.

WordPress's defining trait — installing/uploading and executing **arbitrary third-party code at
runtime** — is fundamentally incompatible with this repo's SSDLC: no remote code, vet every
dependency, supply-chain integrity (`the-lab/CLAUDE.md` §5/§12, master ruleset §1). We want the
*ergonomics* (a manifest, enable/disable, config, extension points) without the *attack surface*.

The app has fixed structural constraints any plugin system must respect: strict layering
(`route→controller→service→model→class`, `db` only in the model layer), one privileged role
(`admin`, no groups), and Next.js App Router **filesystem-only** route discovery (routes cannot be
mounted at runtime).

## Decision

Build an **in-repo, vetted-only plugin platform**:

1. **Static discovery, never dynamic loading.** Installed plugins are listed explicitly in
   `src/plugins/index.js` and are ordinary in-repo code reviewed like any other module. There is no
   filesystem scan, no upload, no `eval`, no remote fetch. Manifests are **inert data**, validated +
   frozen at registry build; they are never executed.
2. **A standard plugin shape** (`manifest`): id, name, version, the sockets it binds to, a
   declarative `configSchema` (primitive types only), `requiredPermissions`, and `enabledByDefault`.
3. **Typed sockets (extension points):** a server-side **hook/event bus** (core emits domain events;
   plugins subscribe), an **admin-nav slot**, an **admin-settings panel** (rendered from
   `configSchema`), **API-route mounting** via thin filesystem shims guarded by
   `requirePluginEnabled`, and optional **scheduled-task** routes. The bus is what lets a plugin
   react to core state **without importing another feature's model** (mediated coupling —
   satisfies the layering rule).
4. **DB-persisted runtime state** (enabled + config) in a `plugins` collection, mirroring the
   existing fixed-`_id` settings-doc pattern; every change is audited.
5. **Permissions through one choke point** (`hasPermission`), today resolving to `isAdmin`. A future
   named-group/permission model drops in there by extending the session in `auth.js` — no call-site
   churn.

Member email provisioning ships as the **first plugin**, proving the interface, and is **disabled by
default** (its enabled flag is the feature gate).

## Rationale

- **Security first:** static-vetted plugins keep us inside the SSDLC (no arbitrary code, supply-chain
  integrity) while still delivering the toggle/config/extension ergonomics that motivated the request.
- **Fits the codebase:** the platform honors the layering rule (hook bus mediates cross-feature
  reactions) and the single-`db`/model-owns-persistence convention.
- **Reversible & incremental:** each plugin is independently enable/disable-able; a disabled plugin's
  API surface returns 404 (the guard), so shipping a plugin has near-zero blast radius until enabled.

## Consequences

- Adding a plugin is a code change + PR (not an upload) — intentional; it goes through review + CI
  gates like everything else.
- Each plugin needs thin `route.js` shims under `src/app/api/v1/plugins/<id>/` (the one App-Router
  footprint), because routes can't be mounted at runtime.
- The permission model is single-role today; the seam is documented for a future group model.
- Importing the registry pulls the installed plugins' module graph at boot; imports are kept
  side-effect-free so this is safe (secrets are read fail-closed at call time, not import time).

## Related

- `lab-site/the-lab/docs/architecture/plugin-platform.md` (design + socket reference)
- `lab-site/the-lab/docs/features/member-email.md` (first plugin + STRIDE threat model)
- ADR 0006 (Vercel→Coolify migration); `@rules/topic-architecture-patterns.md`, `@rules/std-owasp-llm.md` (LLM08 excessive agency / least authority)
