---
title: Refresh staging from production (anonymized by default; time-boxed real mode)
category: Data & Backup
usage: On demand, and before a release
order: 42
summary: Rebuild the staging database from production. DEFAULT anonymizes all personal data (fails closed). An explicit, time-boxed, auto-reverting real-data mode re-keys real member email/phone into staging for a short validation window.
---

# Runbook: Refresh staging from production

> One command; #107 phase 2. Rules: `@rules/std-privacy.md`, master §5, the-lab `CLAUDE.md` §8,
> `@rules/workflow-gated-actions.md`.

## When to use
- Before testing something that needs production-shaped data → **default (anonymized)**.
- **As a pre-release step** when promoting staging → production (`promote-staging-to-prod.md`).
- To validate a flow against REAL member data for a short window → **real-data mode** (see below).
  This is a **gated action** — get explicit human approval per window; it is never the default and
  is never triggered automatically.

## Why anonymize (it is not only policy)
Copying production into staging is forbidden unless the personal data is irreversibly replaced. It
is also **broken** without anonymizing: production and staging use **different `ENCRYPTION_KEY`s**,
and member emails are deterministically encrypted with that key — so prod rows cannot be decrypted
or matched by staging, and every email/login flow silently fails for copied users. The anonymizer
rewrites emails/phones to synthetic values encrypted under **staging's** key, so those flows work.

## Steps

- [ ] Confirm nobody is mid-test on staging — this **drops and rebuilds** `thelab_staging`.
- [ ] Run it from `lab-stack/`:
      ```bash
      cd lab-stack
      bash scripts/refresh-staging-from-production.sh --yes
      ```
- [ ] Watch for both verification lines: *every user email decrypts … to a synthetic address* and
      *no plaintext real-looking email addresses remain*. Anything else means STOP.
- [ ] Confirm staging is serving and on the right database (see Verification below).
- [ ] Tell whoever is testing that accounts are now `member<N>@staging.invalid` /
      `staging-only-password`.

It resolves both apps **by name** through the Coolify API (no hardcoded uuids), reads production's
`MONGODB_URI` from Coolify (never written to disk), dumps production read-only, restores into
`thelab_staging` with `--drop`, then runs the anonymizer **inside the staging container** so it uses
the app's own key and crypto scheme.

Afterwards every staging account is `member<N>@staging.invalid` with password
**`staging-only-password`** (one shared bcrypt hash, verified to authenticate).

## Real-data mode (GATED — explicit, time-boxed, auto-reverting)

Sometimes staging must be validated against **real** member data (e.g. a payment/webhook flow that
only reproduces with live-shaped records). Instead of faking, the anonymizer's `--real-data` path
**re-keys** member email/phone: it DECRYPTS them with the **production** `ENCRYPTION_KEY` and
RE-ENCRYPTS them under **staging's** `ENCRYPTION_KEY`, so the real values are usable and readable by
staging. Everything else (names, other collections) comes across as real; door-card codes and addon
secrets are **not** re-keyed (different keys) and stay unreadable in staging — never a plaintext leak.

This is a **gated action** (`@rules/workflow-gated-actions.md`): a human decides to open a window,
supplies a reason + their name for the audit trail, and sets an expiry. It is never the default.

```bash
cd lab-stack
bash scripts/refresh-staging-from-production.sh --yes --real-data \
  --until 2026-09-09T18:00:00Z \
  --reason "verify Square webhook against real subscription metadata" \
  --operator "your-name"
```

- **Window cap.** `--until` must be a future ISO-8601 timestamp within the cap
  (`STAGING_REAL_MAX_WINDOW_HOURS`, **default 48h**). Missing/unparseable/past/over-cap `--until`,
  or a missing `--reason`/`--operator`, is **rejected** and the run falls back to **anonymized**
  (fail closed — never real). Keep windows as short as the task needs.
- **Production key handling.** The prod `ENCRYPTION_KEY` is read **transiently** from Coolify (exactly
  like the prod URI), passed to the container over **stdin** as a JSON line, and used only to decrypt.
  It is **never** written to staging's env or disk, never logged/printed, and the buffer is zeroized
  after use. It is never persisted to staging.
- **Fail closed.** If the prod key is absent/wrong, or any decrypt/verify fails, the run **aborts the
  real path and anonymizes instead** — staging is never left half-real or holding undecryptable prod
  data. If real mode was requested but not applied, the wrapper exits non-zero and says so (staging is
  left anonymized/safe).
- **Audit.** A real run writes a `_staging_data_mode` marker doc (`mode:"real"`, `operator`, `reason`,
  `startedAt`, `expiresAt`) plus a log line. No member PII and no keys are in the marker.
- **Internet-reachable staging.** Staging is on the public internet. During a real window it holds
  real member data — **keep the window short and restrict access** (e.g. tighten Cloudflare
  Access / IP allowlist for the window). Treat the window as handling restricted data (master §5).

### Auto-revert (real PII must not outlive the window)

Real data is removed automatically once the window passes — even if you forget:

- **Idempotent revert script** — `lab-stack/scripts/staging-data-mode-revert.sh` runs the anonymizer's
  `--revert-if-expired` mode inside the staging container: it re-anonymizes iff the marker is expired
  (or missing/malformed/tampered — fail-safe) and **no-ops** when already anonymized or the window is
  still active. `--force` anonymizes unconditionally. Safe to run anytime.
- **Scheduled trigger (config-as-code).** The `mongodb` ansible role installs the anonymizer + a thin
  wrapper on the VPS and an **hourly cron** (`fablab-staging-data-mode-revert`, minute
  `mongodb_staging_revert_minute`) that runs `--revert-if-expired`. It uses the staging container's
  **own** `ENCRYPTION_KEY`/`MONGODB_URI` — it never needs the production key, so no secret is handled
  on the VPS. Logs to `/var/log/fablab-staging-data-mode.log`. Enable/disable via
  `mongodb_staging_revert_enabled`.

> **Gated infra actions (human):** opening a real-data window (`--real-data`) and installing the
> scheduled revert (an ansible `make converge`) are gated — get explicit approval. Do not run the
> refresh against real infra as part of a code change.

## What it guarantees (and how)
- **Fails closed.** The anonymizer exits non-zero unless *every* user email decrypts with staging's
  key to a synthetic address, and no document anywhere still contains a real-looking email. The
  wrapper propagates that failure with a blunt message — if you see it, treat `thelab_staging` as
  production data and re-run.
- **Content is preserved.** Badges, plans, bounties, portfolio, check-ins and arcade data come across
  byte-identical; only personal fields change. Verified by field-by-field comparison.
- **Payment identifiers, door codes and third-party ids are removed:** `transactionId`, `metadata`,
  `membership.squareCustomerId`/`squareSubscriptionId`, `membership.accessKey.code`, and
  Discord/Google ids are replaced or dropped.

## Traps found while building this (do not re-learn them)
- **Enumerating collections is not enough.** The first version scrubbed users/contacts/transactions
  and the verifier caught real emails in `repairs` and `bugs`. The sweep now walks **every**
  collection, so new ones are covered automatically.
- **A blanket "rewrite any *name field" rule destroys content** — badge names ("Fiber Laser
  Certified") and plan names ("Basic (Monthly)") became "Test Person N". A `name` is only personal
  when the same document also carries contact details.
- **Loose phone matching destroys structure.** A permissive digits-and-punctuation pattern rewrote
  `imageUrl`s, a date (`endsAt`) and a UUID. Free-text matching now applies only to free-text FIELDS,
  and ids/URLs/timestamps are never touched.
- **Never hand-write a bcrypt hash.** The first version shipped an invented hash that verified
  against nothing, so no staging account could log in. Generate it and verify:
  `node -e 'import("bcryptjs").then(async b=>console.log(await b.default.hash("staging-only-password",10)))'`
- **The anonymizer must run from `/app` inside the container**, not `/tmp` — node resolves bare
  imports (`mongodb`) from the script's directory upward, and only `/app` has `node_modules`.

## Verification
```bash
# staging is serving and pointed at the right database
curl -s -o /dev/null -w '%{http_code}\n' https://staging.fablabfortsmith.org/
ssh fablab-prod 'docker logs <staging-container> --tail 20 | grep "Using Database"'
```
Expect `Using Database: thelab_staging`.

## Rollback
The refresh only rebuilds `thelab_staging`. Production is read-only throughout, and the legacy
`thelab` database is still present as the pre-migration staging copy until #107 retires it.

## Related
- `promote-staging-to-prod.md`, `backup-restore.md`; `lab-stack/scripts/refresh-staging-from-production.sh`,
  `lab-stack/scripts/staging-data-mode-revert.sh`, `lab-site/the-lab/scripts/anonymize-staging.js`,
  `lab-stack/ansible/roles/mongodb/` (scheduled auto-revert); issue #107.

---
_Last validated: 2026-08-07 (full anonymized run: 1946 docs restored, 69 users anonymized, verification passed). Owner: platform._
_Real-data mode + auto-revert added 2026-09-08 (code + unit tests only; a real run and the timer install are gated infra actions, not yet exercised against real infra)._
