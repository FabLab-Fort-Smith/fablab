# Impact Analysis — Removing Google OAuth as a Sign-In Provider

- **Status:** Draft for decision (shared-custody review)
- **Date:** 2026-07-22
- **Scope:** `lab-site/the-lab` (Next.js 16 App Router / Auth.js v5)
- **Method:** Full read-only code + data-model inventory (evidence cited as `file:line`). Live user
  counts pending — see §7 (authoritative source is the production database).
- **Motivation:** Bring authentication under our own control as part of the Vercel→self-hosted
  migration by retiring the Google identity provider (Discord OAuth + our own
  credentials/Turnstile-gated registration remain).

---

## 1. Executive summary & recommendation

Removing Google OAuth is **low-complexity and well-isolated in code** — the live change is one
provider block in `auth.js` plus three UI/dead-code cleanups. It does **not** ripple into the user
model or services, which treat `googleId` as optional data.

The material risk is **account lockout** for *Google-only* users — accounts created via Google with
**no password and no linked Discord**. They have no other way to authenticate once the provider is
gone. A verification pass found this risk is currently **hard** (not self-recoverable):

> **There is no working self-service password recovery today.** `src/app/auth/forgot-password/page.js:12`
> is a stub ("Password reset API not yet implemented — show a contact prompt"); it displays a
> reassuring message but sends nothing. The only password route, `change-password`
> (`src/app/api/v1/users/change-password/route.js:16,32`), requires the **current** password (which
> OAuth-only users don't have), and the "merge legacy account" UI requires the legacy password too.

**Recommendation: proceed, but gated.** Do **not** remove Google until (a) a real password-recovery
path exists (the true first task — see §6), and (b) a migration campaign has converted or notified
the Google-only population (§6). With those, lockout downgrades from *permanent* to a *recoverable,
self-service password reset*, and the code removal itself is a half-day change.

---

## 2. What Google OAuth touches (inventory)

| Area | Detail | Evidence |
|---|---|---|
| Provider config | `GoogleProvider({clientId, clientSecret})` + `profile()` mapping | `auth.js:3, 16-89` |
| Identity match | by `email` first, then `googleId` (`profile.sub`) | `auth.js:24-28` |
| User create / backfill | new user via `AuthController.register({provider:'google', googleId, status:'verified', image})`; backfills `provider/googleId/image` on existing | `auth.js:30-70` |
| Callbacks | `signIn`/`jwt`/`session` have **no** Google-specific logic (Discord does) | `auth.js:331-438` |
| Dead legacy code | `handleGoogleLogin` / `googleAuth` — defined, **never called** | `controller.js:29-41`, `service.js:172-199` |
| UI entry points | register button; sign-in button (auto-rendered from `providerMap`); settings "link Google" (no disconnect handler) | `register/page.js:168-170`, `signin/SignInClient.js:7,123-131`, `components/profile/tabs/settings.js:138` |
| Admin displays (read-only) | `googleId` shown truncated | `admin/MemberDialog.js:332`, `dashboard/admin/members/page.js:249` |
| Config | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | `auth.js:17-18`; docs `integrations.md:61,113`, `auth.md:77-79`, `configuration.md:99-100` |

---

## 3. Data model

- User provider/identity fields are **independent columns**: `provider` (single-valued string:
  `local`/`google`/`discord`), plus coexisting `googleId`, `discordId`, `password`, `image`
  (`users/class.js:35,40-43`). A user **can** simultaneously have Google + a password + Discord.
- **A "Google-only" user is:** `googleId` non-empty **AND** `discordId` empty **AND**
  `password === 'no password'` — the sentinel string set for OAuth users (`service.js:80`).
  Password login rejects that sentinel (bcrypt compare, `service.js:145`).
- **No unique index** on `email` or `googleId` (no user-collection index at all); uniqueness is
  enforced only in application code (`service.js:76-92`). *(Latent data-integrity note; not caused
  by this change.)*
- **Emails are encrypted at rest** (encrypted before lookup, `service.js:80`). Any "email the
  affected users" step **must** go through the app's mailer (server-side decrypt) — never a raw DB
  email read. *(Also: the raw `{email}` query in `[...nextauth]/model.js:11,145` won't match
  encrypted emails and is effectively broken — relevant to §6.)*

---

## 4. Removal blast radius

**(a) Files that must change** — small and isolated:
1. `auth.js` — remove the `GoogleProvider` block (`:16-89`) and the import (`:3`).
2. `src/app/auth/register/page.js:168-170` — remove the Google button (else it throws
   `UnknownProviderError` when clicked).
3. `src/app/components/profile/tabs/settings.js:138` — remove the Google "link" row (same dead-call
   risk).
4. `src/app/api/auth/[...nextauth]/controller.js:29-41` + `service.js:172-199` — delete the dead
   `handleGoogleLogin` / `googleAuth` legacy path.
5. Docs: `auth.md`, `integrations.md`, `configuration.md`, `overview.md`, `data-model.md`,
   `features/auth-onboarding.md`.
6. Retire `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` from the secret store.
7. *(Optional)* `signin/SignInClient.js:7` — drop the now-unused `OAUTH_LABELS.google` label
   (harmless; the button already auto-drops via `providerMap`).

**(b) Leave in place — NOT Google-OAuth-specific:**
- CSP `img-src *.googleusercontent.com` (`next.config.mjs:38`) + image-proxy SSRF allowlist
  (`api/image-proxy/route.js:19`, `lib/ssrf.js:56`) + their tests (`ssrf-guard.test.js`,
  `image-proxy-ssrf.test.js`) — these serve **stored avatars** for existing users. Removing them
  breaks avatars and the SSRF tests.
- Admin `googleId` displays + duplicate-detection (`admin/duplicates/route.js`) + the
  `users-access-policy.test.js` `googleId` assertion — continue to work against existing data.

**(c) Dangling but harmless:** existing `provider:'google'` / `googleId` values remain as orphan
fields (no FK, no index) — no schema migration required.

**Tests:** no test exercises Google sign-in directly; `googleId` appears only in policy/SSRF tests
that remain valid.

---

## 5. User-facing functionality impact

- **Unaffected (no action):** any user with a password **or** a linked Discord already has a second
  path — removal is transparent to them.
- **Affected:** `googleOnly` accounts (§3 shape) lose their only sign-in method. Today they have
  **no self-service recovery** (§1), so naive removal = **permanent lockout**.
- Sign-in and register Google buttons disappear (auto for sign-in via `providerMap`; manual removal
  for register/settings). Stored Google avatars keep rendering (CSP/proxy retained).

---

## 6. Recommended migration path for existing Google users

**Governing principle:** never remove Google until every Google-only user has *either* already
gained a second credential *or* a working self-service recovery exists. Migrate **while Google
still works** — that is the only window in which these users can still authenticate to act.

### Prerequisite (BLOCKER) — build a recovery path for password-less accounts
Pick one; **(A) is recommended** (durable; also serves future users and post-removal stragglers):
- **(A) Implement forgot-password properly** — email → time-boxed, single-use reset token → set
  password. Must resolve users via the **encrypting `UsersService`** (not the raw `{email}` query in
  `[...nextauth]/model.js`). `resetPassword` already does not require an old password, so it fits
  OAuth-only accounts. *(Filed as its own tracked issue — it is a worthwhile fix regardless of
  Google, since the current stub is a latent support problem.)*
- **(B) Authenticated "Set a password" in settings** — usable by a user *currently signed in via
  Google*. Simplest, but only helps during the window (no post-removal safety net).
- **(C) Admin / bulk "set-password invite"** — fallback for stragglers and support.

### Phased rollout
| Phase | Action | Google enabled? |
|---|---|---|
| 0 — Measure & back up | Run the `googleOnly` query (§7) against **prod**; back up `users` (restore-drill exists). | yes |
| 1 — Build recovery (prereq) | Ship **(A)** the real forgot-password flow (encrypted-email-aware). This is the gate. | yes |
| 2 — Open migration window | In-app nudge on login for Google-only users + email announcement (via the app mailer): *"Google sign-in retires on \<date\>. Set a password or link Discord now to keep access."* Two self-service options: set password (new flow) or link Discord (existing link-intent flow, `auth.js:100-143`). | yes |
| 3 — Remind & re-measure | Reminders at −2wk / −1wk / −1d; re-run the count; drive `googleOnly` → 0. | yes |
| 4 — Cutover | Remove `GoogleProvider` + the 3 UI/dead-code cleanups (§4); retire the creds. | **removed** |
| 5 — Verify & support | Monitor auth-failure + reset metrics; stragglers recover via the now-working forgot-password; admin invite (C) as last resort. | — |

### Communication (privacy-safe)
Emails are encrypted at rest → all outreach goes through the app's mailer (server-side decrypt) or
the in-app nudge — never a raw DB email export. State the retirement date, the two self-service
options, and a support contact.

---

## 7. Data quantification (run against PRODUCTION)

The self-hosted VPS `thelab` DB is **staging** (non-authoritative; the real user base is the
production / Vercel DB, not reachable from the migration host). Run this in **prod** to get the
number that gates removal (`googleOnly`):

```js
db.users.aggregate([{ $group: {
  _id: null,
  total:       { $sum: 1 },
  hasGoogle:   { $sum: { $cond: [ { $and:[ {$ne:["$googleId",null]},{$ne:["$googleId",""]} ] }, 1, 0 ] } },
  hasDiscord:  { $sum: { $cond: [ { $and:[ {$ne:["$discordId",null]},{$ne:["$discordId",""]} ] }, 1, 0 ] } },
  hasPassword: { $sum: { $cond: [ { $and:[ {$ne:["$password",null]},{$ne:["$password",""]},{$ne:["$password","no password"]} ] }, 1, 0 ] } },
  googleOnly:  { $sum: { $cond: [ { $and:[
                 {$ne:["$googleId",null]},{$ne:["$googleId",""]},
                 {$or:[{$eq:["$discordId",""]},{$eq:["$discordId",null]}]},
                 {$or:[{$eq:["$password","no password"]},{$eq:["$password",""]},{$eq:["$password",null]}]}
               ]}, 1, 0 ] } }
}}])
```

---

## 8. Effort & risk rating

| Dimension | Rating | Notes |
|---|---|---|
| Code effort (removal) | **Low** | ~1 provider block + 3 cleanups + docs; ~½ day incl. tests. |
| Prerequisite effort | **Medium** | Building the forgot-password/reset flow (security-relevant; needs threat model + tests + SEC review). |
| Technical risk (removal) | **Low** | Isolated to auth wiring; no model/service ripple; reversible (re-add provider). |
| User/operational risk | **HIGH → LOW** | HIGH if removed naively (permanent lockout, no recovery). LOW once the recovery path exists + campaign run. |
| Compliance/privacy | **Low** | No PII moved; encrypted emails handled via app flows only. |

**Bottom line:** technically easy and reversible; the real work is the **forgot-password
prerequisite** + the **user-migration campaign**, both gated on the `googleOnly` count. Do not
remove Google until the recovery path ships.

---

## 9. Related
- The prerequisite (forgot-password/reset flow) — tracked issue (see repo issues).
- OAuth provider env wiring — issue #70 / PR #71 (Discord + Google client id/secret into Coolify).
- ADR 0015 (Turnstile registration captcha), `docs/architecture/auth.md` (auth overview).
