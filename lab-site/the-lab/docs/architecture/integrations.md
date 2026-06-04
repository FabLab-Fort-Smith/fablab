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

The-Lab integrates five external services: **Square** (payments/subscriptions), **Discord** (OAuth, bot, role sync, DMs), **Google** (OAuth sign-in + reCAPTCHA), **AWS-compatible S3** (image uploads), and **Google Gemini** (`@google/genai`, badge-image generation). Each is wrapped behind a `src/lib`/`src/utils` adapter or a single route so SDK clients are not instantiated inside arbitrary handlers (per <a href="overview.md">the layering rules</a>).

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

## Google — OAuth sign-in & reCAPTCHA

**Purpose.** Google OAuth sign-in, and reCAPTCHA verification on the public registration endpoint to deter automated sign-ups.

**Entry points.**
- `auth.js` — the `GoogleProvider`; its `profile()` looks up the user by email (then `googleId`), creating the account on first sign-in via `AuthController.register`.
- `src/app/api/auth/register/route.js` — verifies the reCAPTCHA token against `https://www.google.com/recaptcha/api/siteverify` before registering.

**Required env vars.** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (OAuth); `RECAPTCHA_SECRET_KEY` (server-side verification).

**Failure modes.** Registration **fails closed** on captcha: a missing token returns 400, a missing `RECAPTCHA_SECRET_KEY` returns 500 ("Captcha verification is unavailable" — it does not silently pass), and an unsuccessful verification returns 400 (SEC-21). Google OAuth `profile()` errors are caught and surfaced as a generic auth failure.

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
| Google (reCAPTCHA) | `RECAPTCHA_SECRET_KEY` | `src/app/api/auth/register/route.js` |
| S3 | `S3_BUCKET_NAME`, `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_REGION` | `src/app/api/v1/upload/route.js`, `src/utils/s3.util.js` |
| Gemini | `GEMINI_API_KEY` (+ S3 vars) | `src/app/api/v1/holodeck/generate-badge-images/route.js` |

## Related documents

- <a href="overview.md">Architecture Overview</a> — system context and the SDK-wrapping rule.
- <a href="auth.md">Authentication &amp; Authorization</a> — Google/Discord providers and the credentials flow.
- <a href="access-control-iot.md">Access control (IoT tier)</a> — the separate VPS integrations (socket-server, orchestrator).
- <a href="../audit/06-security-standards.md">Security standards</a> — webhook, upload, and SSRF controls.

## Changelog
| Date | Change | Author |
|------|--------|--------|
| 2026-05-29 | Initial version | app dev |
