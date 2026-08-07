---
title: Refresh staging from production (anonymized)
category: Data & Backup
usage: On demand, and before a release
order: 42
summary: Rebuild the staging database from production with all personal data replaced by synthetic values encrypted under staging's own key. Fails closed if any real data survives.
---

# Runbook: Refresh staging from production (anonymized)

> One command; #107 phase 2. Rules: `@rules/std-privacy.md`, master §5, the-lab `CLAUDE.md` §8.

## When to use
- Before testing something that needs production-shaped data.
- **As a pre-release step** when promoting staging → production (`promote-staging-to-prod.md`).

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
  `lab-site/the-lab/scripts/anonymize-staging.mjs`; issue #107.

---
_Last validated: 2026-08-07 (full run: 1946 docs restored, 69 users anonymized, verification passed). Owner: platform._
