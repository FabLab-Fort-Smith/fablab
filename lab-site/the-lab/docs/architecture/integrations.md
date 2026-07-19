---
title: Integrations
status: current
audience: developers, operators, reviewers
owners: app dev
last_reviewed: 2026-05-29
related:
  - overview.md
  - auth.md
  - access-control-iot.md
---

# Integrations

> **Status:** Current — covers the external services the app depends on, their entry points, required configuration, and failure modes.
> **Audience:** Engineers integrating with these services and operators configuring environments.  ·  **Last reviewed:** 2026-05-29

## Overview

The-Lab integrates seven external services: **Square** (payments/subscriptions), **Discord** (OAuth, bot, role sync, DMs), **Google** (OAuth sign-in), **Cloudflare Turnstile** (anti-bot captcha on registration), **AWS-compatible S3** (image uploads), **Google Gemini** (`@google/genai`, badge-image generation), and **PurelyMail** (member mailbox provisioning — via the member-email plugin). Each is wrapped behind a `src/lib`/`src/utils` adapter or a single route so SDK clients are not instantiated inside arbitrary handlers (per <a href="overview.md">the layering rules</a>).

This document is the per-service reference: what each integration is for, where it enters the codebase, the environment variables it needs, and how it behaves on failure or misconfiguration. All required secrets are env-only — there are **no hardcoded fallbacks** for secrets or endpoints (the lone remaining endpoint fallbacks live in CTF-adjacent code, noted below).

## Square — payments & subscriptions

**Purpose.** Checkout, recurring membership billing, and inbound payment webhooks. Square is the source of truth for plan/variation catalog data and subscription state; the app mirrors the resulting access state onto `users.membership` (see <a href="data-model.md">Data model</a>).

**Entry points.**
- `src/lib/square.js` — constructs the Square SDK `Client` (the single adapter).
- `src/app/api/v1/plans/model.js` — reads the Square `catalogApi`, `subscriptionsApi`, and `ordersApi` to assemble the public plan list (with hidden/legacy overlays from the `plans` collection).
- `src/app/api/v1/square/*`, `v1/memberships/*`, `v1/donations/*` — checkout, subscription, and donation flows.
- Webhooks: `src/app/api/v1/square/webhooks/payment/route.js`, verified/idempotent via `src/lib/squareWebhook.js` and `src/lib/webhookIdempotency.js` (the `processed_webhook_events` collection).

**Required env vars.** `SQUARE_ACCESS_TOKEN`, `SQUARE_ENVIRONMENT` (e.g. `sandbox`/`production`). Webhook signature config is read by `src/lib/squareWebhook.js`.

**Failure modes.**
- Webhooks **fail closed** if the signing key is unset; signatures are verified in **constant time**, and redelivery is de-duplicated (Square delivers at-least-once) so effects aren't double-applied.
- `plans/model.js` degrades gracefully: relative-priced variations are resolved from a subscriber's order template inside `try`/`Promise.allSettled`, and any failure is logged and skipped rather than failing the whole list.
- Keep us out of PCI scope — Square handles card data; never store PAN/CVV.

## Discord — OAuth, bot, roles, DMs

**Purpose.** Discord sign-in (OAuth), adding members to the guild, syncing membership/creator roles, posting to channels (e.g. showcase), and DMs.

**Entry points.**
- `auth.js` — the `DiscordProvider` (OAuth, `identify email guilds.join` scope) and the `signIn` callback that calls `DiscordService.addMemberToGuild`. Supports a "link intent" cookie flow so connecting Discord to an existing account doesn't create a ghost user.
- `src/lib/discord.js` (`DiscordService`) — the bot adapter: `sendChannelMessage`, `sendDirectMessage`, `addMemberToGuild`, `addRole`/`removeRole`, `syncCreatorRoles`, `syncMembershipRole`, `getMember`, `getGuildChannels`, `createInvite`. All calls go through `request()` against `https://discord.com/api/v10` with a `Bot <token>` header.
- `src/app/api/discord/interactions` — inbound Discord interactions.

**Required env vars.** `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` (OAuth, in `auth.js`); `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID` (bot, in `discord.js`). Channel/role IDs come from `src/lib/constants.js`.

**Failure modes.** `DiscordService` is defensive: if `DISCORD_BOT_TOKEN` is unset, `request()` warns and returns `null` (no throw); guild/role/channel helpers no-op when `GUILD_ID` is missing. API errors are logged and return `null`/`false` rather than throwing, so a Discord outage degrades features (role sync, showcase posts) without breaking the core request.

## Google — OAuth sign-in

**Purpose.** Google OAuth sign-in.

**Entry points.**
- `auth.js` — the `GoogleProvider`; its `profile()` looks up the user by email (then `googleId`), creating the account on first sign-in via `AuthController.register`.

**Required env vars.** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (OAuth).

**Failure modes.** Google OAuth `profile()` errors are caught and surfaced as a generic auth failure.

## Cloudflare Turnstile — anti-bot captcha

**Purpose.** Captcha verification on the public registration endpoint to deter automated sign-ups.

**Entry points.**
- `src/app/auth/register/page.js` — renders the Turnstile widget (`@marsidev/react-turnstile`) using the public site key. With no site key set the widget shows a "[CONFIG] captcha unavailable" notice and submission stays blocked.
- `src/app/api/auth/register/route.js` — verifies the Turnstile token against `https://challenges.cloudflare.com/turnstile/v0/siteverify`, sending `secret` + `response` as a POST form body (`URLSearchParams`), before registering. The request is bounded by a 5s `AbortSignal.timeout`.

**Required env vars.** `TURNSTILE_SECRET_KEY` (server-side verification); `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (public client-side widget). Both are minted via `make provision-keys ARGS=turnstile` (ADR 0015) — there is **no hardcoded fallback** site key (SEC-21).

**Failure modes.** Registration **fails closed** on captcha: a missing token returns 400, a missing `TURNSTILE_SECRET_KEY` returns 500 ("Captcha verification is unavailable" — it does not silently pass), an unsuccessful verification returns 400, and a network error/timeout against the Turnstile upstream returns 503 (SEC-21).

## AWS-compatible S3 — image uploads

**Purpose.** Stores user-uploaded images (avatars, showcase/portfolio, bounty images) on an S3-compatible object store.

**Entry points.**
- `src/app/api/v1/upload/route.js` — the authenticated upload handler (`@aws-sdk/client-s3` `PutObjectCommand`). The S3 client is built lazily so a missing config doesn't break module import.
- `src/utils/s3.util.js` — the client-side helper that POSTs a `File` to `/api/v1/upload`.

**Required env vars.** `S3_BUCKET_NAME`, `S3_ENDPOINT` (both required — handler returns 500 if absent), `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_REGION` (defaults to `us-east-1`).

**Failure modes & controls.**
- **Auth required** — anonymous uploads return 401.
- **Content-based validation** — the file type is detected from **magic bytes** (`detectImageType`), not the client-declared MIME/extension; only JPEG/PNG/GIF/WebP are allowed (SVG intentionally excluded to avoid stored XSS). Unsupported content returns 415.
- **Size limit** — 5 MB; oversize returns 413.
- **Server-generated key** — `uploads/<uuid>.<ext>`; the client filename is never trusted.
- Internal errors return a generic message (no stack/host leakage).

## Google Gemini (`@google/genai`) — badge images

**Purpose.** Generates badge artwork (a phosphor-green terminal style) and uploads it to S3, setting `badges.imageUrl`.

**Entry points.** `src/app/api/v1/holodeck/generate-badge-images/route.js` — authenticated POST; instantiates `GoogleGenAI`, generates an image per badge (model `gemini-3.1-flash-image-preview`), uploads the PNG to S3, and updates the badge via `BadgeModel.updateBadge`. Body options: `{}` (all badges), `{ badgeId }` (one), `{ skipExisting: true }`.

**Required env vars.** `GEMINI_API_KEY` (returns 500 if unset). Reuses the S3 env vars above for upload.

**Failure modes.** Requires an authenticated session (401 otherwise). Per-badge generation/upload errors are captured into the per-item `results` array (`status: 'error'`) rather than failing the whole batch; a Gemini response with no image data throws for that badge only.

> **Note (CTF boundary):** this route lives under the `holodeck/` path, which is part of the "Hack the Lab" CTF zone, but it performs a **real** operation (generating real badge images). Unlike the planted CTF content, it must remain secure. It is also the one integration whose S3 client still carries hardcoded endpoint/bucket defaults (`https://s3.crittercodes.dev`, `fablab-bounties`) — the production upload path in `src/app/api/v1/upload/route.js` has no such fallbacks.

## Configuration summary

| Service | Required env vars | Adapter / entry point |
|---|---|---|
| Square | `SQUARE_ACCESS_TOKEN`, `SQUARE_ENVIRONMENT` (+ webhook signing) | `src/lib/square.js`, `src/lib/squareWebhook.js` |
| Discord (OAuth) | `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` | `auth.js` |
| Discord (bot) | `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID` | `src/lib/discord.js` |
| Google (OAuth) | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | `auth.js` |
| Cloudflare Turnstile | `TURNSTILE_SECRET_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | `src/app/api/auth/register/route.js`, `src/app/auth/register/page.js` |
| S3 | `S3_BUCKET_NAME`, `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_REGION` | `src/app/api/v1/upload/route.js`, `src/utils/s3.util.js` |
| Gemini | `GEMINI_API_KEY` (+ S3 vars) | `src/app/api/v1/holodeck/generate-badge-images/route.js` |

## Related documents

- <a href="overview.md">Architecture Overview</a> — system context and the SDK-wrapping rule.
- <a href="auth.md">Authentication &amp; Authorization</a> — Google/Discord providers and the credentials flow.
- <a href="access-control-iot.md">Access control (IoT tier)</a> — the separate VPS integrations (socket-server, orchestrator).
- <a href="../audit/06-security-standards.md">Security standards</a> — webhook, upload, and SSRF controls.

## PurelyMail — member mailbox provisioning

Provisions `@fablabfortsmith.org` mailboxes for members. Consumed **only** by the `member-email`
plugin (see <a href="../features/member-email.md">the feature doc</a> and <a href="plugin-platform.md">the plugin platform</a>); disabled by default.

- **Adapter (seam):** `src/lib/purelymail.js` — the single entry point for all PurelyMail calls
  (mirrors `src/lib/square.js`). Named functions: `createMailbox`, `getMailbox`, `mailboxExists`,
  `modifyMailbox`, `suspendMailbox`, `resetMailbox`, `deleteMailbox`, `listMailboxes`, `checkCredit`.
- **API:** base `https://purelymail.com/api/v0/*` — a **fixed host constant** (never built from
  input; SSRF-safe by construction). POST-only; header `Purelymail-Api-Token`; envelope
  `{ type: "success", result }` | `{ type: "error", code, message }`. The adapter unwraps `result`,
  throws a typed `PurelyMailError` on `type:error`, times out (10s), and retries network/5xx only.
- **Configuration (env):**
  - `PURELYMAIL_API_TOKEN` — API token (created in the PurelyMail account settings). **Secret.**
  - `PURELYMAIL_DOMAIN` — the managed mail domain (e.g. `fablabfortsmith.org`).
  - Both are read **fail-closed at call time** (a missing value throws `PurelyMailError("config")`).
    They are intentionally **not** in `REQUIRED_ENV`: the plugin ships disabled, and a disabled
    plugin must not be able to block app boot. `purelymailReady()` gates enabling/using the plugin
    with a clear message when they're unset.
- **Failure modes:** provider/network failure → member claim returns `502`/`503` and nothing is
  persisted; a mailbox is created only after a successful PurelyMail call, and a persistence race
  (unique-index collision) rolls the mailbox back. PurelyMail is **pay-as-you-go** — a
  `checkCredit()` floor + a per-member cap bound spend.
- **Security:** the token, mailbox passwords, and members' personal recovery emails are **never
  logged**. `createMailbox` generates a random password that is immediately discarded — PurelyMail
  owns the credential; the member sets it via the welcome/reset flow.

## Changelog
| Date | Change | Author |
|------|--------|--------|
| 2026-05-29 | Initial version | app dev |
| 2026-07-13 | Add PurelyMail (member-email plugin) | app dev |
