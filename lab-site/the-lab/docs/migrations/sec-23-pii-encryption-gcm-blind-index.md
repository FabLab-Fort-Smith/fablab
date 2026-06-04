# SEC-23 migration plan — PII at rest: AES-256-CBC(zero-IV) → AES-256-GCM + HMAC blind index

**Finding:** SEC-23 (High) — issue #24 (Epic E5 / WI-5.1). **Status:** planned, not started.

**Already done:** the hardcoded fallback key was removed (`ENCRYPTION_KEY` is env-only now; SEC-23 bullet 1 / overlaps E3). **Remaining:** the crypto scheme + searchable-field handling + data migration documented here.

## Why this is a migration, not a code change
`src/app/api/auth/[...nextauth]/service.js` encrypts email/phone with **`aes-256-cbc` and a fixed all-zero IV** — i.e. **deterministic** ciphertext — and decrypt **fails open** (returns the input on error). Two problems, one of which makes this hard:

1. **Security:** deterministic + unauthenticated ciphertext leaks equality (confirms whether an email/phone exists, correlates records) and has no integrity. Fail-open decrypt hides corruption.
2. **The catch:** the system **relies on the determinism** for lookup — `UserModel.findByEmail(AuthService.encryptEmail(email))` is how login, registration dedup, `verify-credentials`, and `users/service.getUserByQuery({email})` find a user. Switching to GCM (random IV ⇒ non-deterministic) **breaks every email lookup** unless we add a **keyed HMAC blind index** and **backfill it onto every existing record**. Get this wrong and **every member is locked out of login**.

Because existing rows are CBC-encrypted with no blind index, this needs a **phased, backfilled, staging-validated** rollout — it cannot be a single deploy, and it cannot be verified without the real data.

## Target design
- **At-rest values (email, phone):** `aes-256-gcm`, **random 12-byte IV per record**, store `v2:<iv_b64>:<tag_b64>:<ct_b64>` (versioned so decrypt can tell formats apart). Authenticated; **decrypt fails closed** (throw) once legacy support is removed.
- **Searchable field (email):** a separate column `emailIndex` = `HMAC-SHA256(BLIND_INDEX_KEY, normalize(email))` (lowercased/trimmed). Lookups query `emailIndex`, never ciphertext. Phone gets a blind index only if it's ever searched (today it isn't).
- **Keys:** `ENCRYPTION_KEY` (32-byte, GCM) and a **distinct** `BLIND_INDEX_KEY` (HMAC) — never the same key for both. Both in the secret manager/KMS with a documented rotation cadence (§12).

## Phased rollout
**Phase A — dual-read code (deploy first, no behaviour change for existing users):**
- New crypto module: `encryptField` (GCM, versioned), `decryptField` (reads **both** `v2:` GCM **and** legacy raw-hex CBC), `blindIndex(value)`.
- Writes: store GCM ciphertext **and** populate `emailIndex`.
- Lookups: `findByEmail` queries `emailIndex` **with a fallback** to the legacy deterministic-CBC ciphertext, so un-migrated rows are still found during transition.
- Decrypt stays effectively fail-open **only** for the legacy branch during transition (log + metric on failures); new GCM branch fails closed.

**Phase B — backfill migration (admin-gated script, staging first):**
- For every user: `decryptField(legacy)` → `encryptField(GCM)`, compute `emailIndex` (and phone GCM). Idempotent (skip rows already `v2:`), batched, resumable. Run on a **staging snapshot** first; verify a sample logs in.

**Phase C — cutover (after backfill verified in prod):**
- Remove the legacy-CBC decrypt branch and the legacy-lookup fallback; `findByEmail` is blind-index-only; decrypt is **fail-closed** everywhere.

## Consumer audit (must all route through the new helpers)
**Email lookups (need blind index):** `auth/[...nextauth]/service.js` login (`:128`), googleAuth (`:173`), register dedup (`:71/74`), resendVerification (`:227`); `users/service.js` getUserByQuery (`:74`); `users/verify-credentials/route.js` (`:23`); writes in `square/subscriptions/service.js` (`:53`).
**Encrypt on write:** `users/service.js` createUser (`:30`), updateUser (`:150`); auth register (`:71`).
**Decrypt on read (need GCM + legacy compat):** `users/service.js` (`:81/119/331/738`), auth login (`:160`), `notifications/service.js` (`:64`), `admin/duplicates` (`:65`), `admin/delinquent` (`:111-112`). The admin ones already wrap decrypt in try/catch — keep that until Phase C.
`UserModel.findByEmail` (`auth/[...nextauth]/model.js:11`) becomes a blind-index query.

## Validation (before merge / cutover)
- Unit: GCM encrypt→decrypt round-trip; **decrypt of a legacy CBC value still works** (Phase A); blind index is deterministic + stable; decrypt of tampered ciphertext throws (fail-closed); two encryptions of the same email produce **different** ciphertext but the **same** blind index.
- Staging E2E: register → verify → login by email; **existing-record login after backfill**; admin member search by email.
- Backfill **dry-run on a staging DB snapshot**; verify counts (rows migrated == total), spot-check decrypts, confirm no `v1`/legacy rows remain before Phase C.
- SEC sign-off (PII/crypto = security-relevant, §2).

## Rollback
- Phase A is backward-compatible (still reads legacy) — safe to revert.
- Do **not** start Phase C until a prod backfill is verified; if login failures spike post-cutover, revert to the Phase A image (legacy fallback) and re-run/repair the backfill.

## Done-when checklist
- [ ] `BLIND_INDEX_KEY` provisioned (distinct from `ENCRYPTION_KEY`), both in the secret manager
- [ ] Phase A deployed; new signups/edits write GCM + `emailIndex`; existing users unaffected
- [ ] Backfill dry-run on staging snapshot OK; prod backfill complete + verified
- [ ] Phase C: legacy decrypt/lookup removed; decrypt fail-closed; no legacy rows remain
- [ ] Unit + staging E2E green; SEC sign-off
- [ ] #24 closed; E5/WI-5.1 marked done
