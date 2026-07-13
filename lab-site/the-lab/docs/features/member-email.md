---
title: Member Email Provisioning
status: current
audience: developers, operators, reviewers, SEC
owners: app dev
last_reviewed: 2026-07-13
related:
  - ../architecture/plugin-platform.md
  - ../architecture/integrations.md
  - auth-onboarding.md
  - memberships-payments.md
---

# Member Email Provisioning

> **Status:** Current — the first plugin on the plugin platform (ADR 0013). **Disabled by default.**
> **Audience:** Engineers + SEC reviewing this feature. · **Last reviewed:** 2026-07-13

## What it does

Active members self-claim an `xxxx@fablabfortsmith.org` mailbox. They choose the local part (live
availability check + reserved-name blocklist); the mailbox is created in **PurelyMail** with a
random password and PurelyMail's welcome/reset flow, using the member's **personal** email as
recovery — so the member sets their own password directly in PurelyMail. **No mailbox password is
ever entered into or stored by our app.** Admins manage mailboxes (list / suspend / reset / delete)
from `/dashboard/admin/member-email`.

## Where it lives

- **Plugin:** `src/plugins/member-email/` — `plugin.manifest.js`, `index.js` (hooks), `controller.js`,
  `service.js` (business rules + authz), `model.js` (the `memberMailboxes` collection — owns `db`),
  `class.js`, `reserved.js`, `config.js`.
- **Adapter:** `src/lib/purelymail.js` (see the integrations doc).
- **API (thin shims, gated by `requirePluginEnabled`):** `src/app/api/v1/plugins/member-email/`
  `availability` (GET), `claim` (POST), `mine` (GET), `admin` (GET list / POST action).
- **UI:** member `/dashboard/email`; admin `/dashboard/admin/member-email` (nav contributed via the
  plugin's `adminNav` socket).

## Data

`memberMailboxes` collection: `{ userID, localPart, address, status: active|suspended|revoked,
createdAt, createdBy, updatedAt }`. **Unique indexes** on `address` and `localPart` guard
double-claim races. **No password** is stored. `address` is org email (member-identifying) → treat as
personal data: minimize in logs, deletable on erasure (the `member.deleted` hook removes it).

## Claim rules (server-enforced)

Identity from the session (never the body). Membership must be active (`active`/`probation`/waived/
`subscriptionStatus:ACTIVE`). Local part: lowercased, 3–32 chars, `[a-z0-9._-]`, no leading/trailing
or doubled separators, not reserved. One active mailbox per member (config `maxMailboxesPerMember`).
Spend floor: PurelyMail `checkCredit()` ≥ `minAccountCredit` before any create.

## Configuration

- Plugin config (admin UI, DB-persisted): `maxMailboxesPerMember` (default 1), `minAccountCredit`
  (USD, default 1), `additionalReserved` (extra blocked names).
- Env (see integrations): `PURELYMAIL_API_TOKEN`, `PURELYMAIL_DOMAIN` — fail-closed at call time.

## Threat model (STRIDE)

| Threat | Vector | Mitigation | Verified by |
|---|---|---|---|
| **Spoofing** | claim/manage as another user | identity from session only; body/query `userID` ignored | `member-email-controller-authz.test.js` |
| **Tampering** | Mongo-operator / field injection in `name`/config | strict local-part regex; `$`-key stripping; `configSchema` validation | `member-email-reserved`, `plugin-manifest` tests |
| **Repudiation** | deny provisioning/suspension happened | `auditLog` on every provision/suspend/reset/delete + plugin enable/disable/config | audit calls in service |
| **Info disclosure** | address enumeration; token/PII leak | availability is member-gated + **per-user rate-limited** (`src/lib/rateLimit.js`, 20/min); token/recovery email/password never logged; generic client errors | rate-limit + service + adapter tests |
| **DoS / spend abuse** | mass claims drain PurelyMail credit | active-member gate + **race-safe** per-member cap (post-insert recount + rollback) + credit floor + per-user claim throttle (5/min) | `member-email-service.test.js` (cap race, spend); `rate-limit.test.js` |
| **Elevation** | non-admin runs admin ops; disabled-plugin surface | `assertPermission`/`isAdmin`; `requirePluginEnabled` → 404 when disabled | guard + service tests |
| **SSRF** | server-side fetch to internal targets | adapter host is a fixed constant; domain from env | adapter test (fixed URL) |

Abuse cases are covered by `test/e2e/member-email-*.test.js` and `test/unit/purelymail-adapter`,
`member-email-reserved`, `plugin-*` — anon→401, non-active→403, taken→409, reserved→400, cap→409,
low-credit→503, provider-fail→502, race→409+rollback, disabled→404, injection rejected.

## Operational notes

- **Prerequisite (one-time, human):** the domain is added + DNS-verified in the PurelyMail account
  and a PurelyMail API token is placed in the secret store. Then enable the plugin at
  `/dashboard/admin/plugins`. Enabling is **gated on readiness** — the platform refuses to enable
  the plugin (400) unless `PURELYMAIL_API_TOKEN` + `PURELYMAIL_DOMAIN` are set (`checkReady`).
- **Suspend** semantics: PurelyMail has no native suspend — the adapter rotates the password,
  disables reset, and requires 2FA (reversible by admin reset; mail retained). Auto-suspend fires on
  the `membership.suspended` event (emitted on Square cancel / non-active sync).
- **Erasure integrity:** on `member.deleted` the local record is removed **only after** a confirmed
  PurelyMail delete; a provider failure keeps the record and audits `email.mailbox.erase_failed` so
  the orphan stays tracked for retry.
- **Rate limiting** is **per server instance** (in-memory — `src/lib/rateLimit.js`); on a
  multi-instance deploy the effective limit is per-instance. Back it with a shared store (Redis) for
  a hard cross-instance guarantee (follow-up).
- **Follow-ups:** aliases/forwarding via PurelyMail routing rules; a reconcile task via the `tasks`
  socket; distributed rate limiting; a true DB-backed e2e claim test.
