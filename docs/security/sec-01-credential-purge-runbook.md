# SEC-01 runbook — rotate + purge the leaked MongoDB credential

**Finding:** SEC-01 (Critical) — issue #11. The production Mongo admin URI
`mongodb://critter:Zapatas2024@23.94.251.158:27017/?...&authSource=admin` was
committed in `list-dbs.js` and `debug-leaderboard.js`.

**What's already done (code half, PR #60):** the two scripts are deleted from the
working tree and a sentinel test (`test/unit/sec-01-no-db-cred.test.js`) blocks
the credential from reappearing in code. **This does NOT close SEC-01** — the
credential still exists in git history and is still valid until rotated.

**What this runbook covers (OPS/SEC-owned):** WI-1.1 rotate · WI-1.4 network ·
WI-1.3 history purge · WI-1.5 verify. Requires repo admin, MongoDB admin, and
infra/firewall access.

> **Sequencing rule (from the remediation plan):** **rotate first** — assume the
> credential is already exfiltrated. History purge happens *after* rotation, never
> before. Network lockdown can run in parallel with rotation.

---

## Where the secret lives (verified)

| Location | Type | Action |
|---|---|---|
| `list-dbs.js`, `debug-leaderboard.js` (history only, removed in #60) | **live credential in code** | **purge from history** (Phase 3) |
| `docs/audit/01-security-findings.md`, `04-p0-remediation-plan.md` | finding evidence (current tree) | leave — post-rotation it's a dead reference |
| `test/unit/sec-01-no-db-cred.test.js` | the string as a regex in the recurrence guard | leave — see Phase 3 caveat |

Commits that carried the credential in the scripts: `738ad05`, `58c460f`,
`b31624c`/`9516d4d` (bootstrap), through removal in `06722e9`/`12c3c42` (#60).
Confirm before purging: `git log --all --oneline -S 'Zapatas2024'`.

---

## Phase 1 — Rotate the credential (WI-1.1) — DO FIRST

1. **Inventory consumers** of `MONGODB_URI` / the `critter` cred:
   - App deployment env (the running Next.js app via `src/lib/database.js`).
   - CI/CD secrets, any infra scripts, `.env*` on dev machines.
   - The two debug scripts (already deleted — no longer consumers).
2. **Create a new least-privilege Mongo user** — scoped to the app database only,
   **not** an `admin` role and **not** `authSource=admin`:
   ```js
   // mongosh, connected as an admin
   use FabLab-Local            // the app DB (per MONGODB_NAME)
   db.createUser({
     user: "thelab_app",
     pwd: passwordPrompt(),     // generate a strong random secret
     roles: [{ role: "readWrite", db: "FabLab-Local" }]
   })
   ```
3. **Store the new URI** in the secret manager / deployment env (never in the repo):
   `MONGODB_URI="mongodb://thelab_app:<newpass>@<host>:27017/FabLab-Local?authSource=FabLab-Local&tls=true"`
4. **Deploy / restart** the app on the new secret; confirm health (reads + writes
   succeed, no auth errors in logs).
5. **Disable the old `critter` user:**
   ```js
   use admin
   db.dropUser("critter")      // or db.updateUser with a new random pwd if still referenced
   ```
6. **Confirm the old credential is rejected:**
   ```bash
   mongosh "mongodb://critter:Zapatas2024@23.94.251.158:27017/?authSource=admin" --eval 'db.runCommand({ping:1})'
   # expect: Authentication failed
   ```

## Phase 2 — Restrict network exposure (WI-1.4) — parallel with Phase 1

1. **Audit reachability:** is `23.94.251.158:27017` reachable from the public
   internet? `nmap -p 27017 23.94.251.158` from an external host.
2. **Firewall** Mongo to app hosts only (security group / `ufw` / bind to private
   interface). Mongo should not accept connections from arbitrary IPs.
3. **Enforce TLS** on the connection (`tls=true` in the URI; server configured with
   a cert).
4. **Verify** an external connection is refused after the change.

## Phase 3 — Purge git history (WI-1.3) — AFTER rotation is confirmed

> Rewriting history is destructive and force-pushes all refs. Schedule a short
> window, freeze merges, and notify every collaborator (they must re-clone).

1. **Install git-filter-repo** (preferred over BFG): `pip install git-filter-repo`.
2. **Back up** a mirror first:
   ```bash
   git clone --mirror git@github.com:FabLab-Fort-Smith/The-Lab.git the-lab-backup.git
   ```
3. **Fresh mirror to rewrite:**
   ```bash
   git clone --mirror git@github.com:FabLab-Fort-Smith/The-Lab.git the-lab-purge.git
   cd the-lab-purge.git
   ```
4. **Remove the credential-bearing scripts from all history** (recommended — precise,
   doesn't touch the audit docs/test):
   ```bash
   git filter-repo --invert-paths --path list-dbs.js --path debug-leaderboard.js
   ```
   **Alternative / additional — redact the literal everywhere** (only if policy
   requires zero occurrences of the string in any blob). Create `replace.txt`:
   ```
   Zapatas2024==>***REMOVED***
   23.94.251.158==>***REMOVED***
   ```
   then `git filter-repo --replace-text replace.txt`.
   ⚠️ **Caveat:** `--replace-text` rewrites *every* occurrence, so it will also
   redact the password shown as evidence in `docs/audit/*` **and** the
   `/Zapatas2024/` regex in `test/unit/sec-01-no-db-cred.test.js` (turning it into
   invalid `/***REMOVED***/` regex). If you use it, follow up with a normal commit
   fixing the sentinel test. Given the credential is rotated (dead) by Phase 1, the
   `--invert-paths` file removal alone is usually sufficient.
5. **Temporarily lift branch protection** on `main` (admin), then **force-push the
   rewritten refs:**
   ```bash
   git push --force --mirror git@github.com:FabLab-Fort-Smith/The-Lab.git
   ```
   Re-enable branch protection immediately after.
6. **Coordinate the team:** every collaborator deletes their local clone and
   re-clones (rebasing old branches onto the rewritten history). Old clones still
   contain the secret.
7. **Invalidate caches & forks:** rewritten-away commits remain reachable by SHA on
   GitHub until garbage-collected — **open a GitHub Support ticket** to purge cached
   views/stale refs. Delete or have owners re-clone any **forks**. Close/re-open PRs
   that reference rewritten SHAs.

## Phase 4 — Verify & prevent recurrence (WI-1.5)

1. **Review Mongo access/audit logs** for unauthorized use since the exposure
   window (connections from unexpected IPs, unusual queries). Escalate to incident
   response (`docs/security/INCIDENT-RESPONSE.md`) if anything is found.
2. **Confirm the secret is gone from history:** `git log --all -S 'Zapatas2024'`
   returns nothing in the rewritten repo (and re-cloned copies).
3. **Flip the secret-scan CI gate to enforced:** the `secret-scan` job
   (`.github/workflows/ci.yml`, gitleaks) is currently `continue-on-error: true`
   "until SEC-01/#11." Once history is clean, remove that flag so committed secrets
   fail CI. The working-tree sentinel (`test/unit/sec-01-no-db-cred.test.js`) stays
   as the unit-test guard.
4. **Rotate any other secrets** that shared the exposure (if the same host/account
   was reused elsewhere).
5. **Close #11** once Phases 1–4 are verified, and mark E1 done in
   `docs/audit/04-p0-remediation-plan.md`.

---

## Rollback / contingency
- If the rewrite goes wrong, restore from `the-lab-backup.git` (`git push --mirror`
  back) **before** re-enabling normal workflow.
- If app connectivity fails after rotation, the new user likely lacks a needed role
  or the `authSource` is wrong — fix the role/URI; do **not** revert to `critter`.

## Done-when checklist
- [ ] New least-privilege app user live; app healthy on it
- [ ] Old `critter` user dropped; old URI returns auth failure
- [ ] Mongo not reachable from public internet; TLS enforced
- [ ] `git log --all -S 'Zapatas2024'` is empty in the rewritten + re-cloned repo
- [ ] Team re-cloned; forks/caches invalidated (GitHub Support ticket if needed)
- [ ] Mongo access logs reviewed for misuse during exposure
- [ ] `secret-scan` CI gate flipped to enforced
- [ ] #11 closed; E1 marked done in the remediation plan
