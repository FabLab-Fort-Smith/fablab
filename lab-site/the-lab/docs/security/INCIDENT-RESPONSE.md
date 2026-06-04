# Incident Response Runbook — The-Lab

**Purpose:** how we respond when a security incident is suspected or confirmed. Referenced by `CLAUDE.md` §10. Keep this short, current, and actionable.

> If you suspect an active incident (breach, leaked secret, unauthorized access, ransomware, unauthorized door unlock), **start at step 1 now** — do not wait for certainty.

## Contacts & roles
| Role | Who | Notes |
|------|-----|-------|
| Incident lead / Security owner (SEC) | _<name/email>_ | coordinates the response |
| Engineering on-call | _<name/email>_ | executes containment/fixes |
| Org / data-protection contact | john.annis@fablabfortsmith.org | member & authority notification |
| Reporting inbox | security@fablabfortsmith.org | external reports (see `SECURITY.md`) |

_(Fill in the names above; review quarterly.)_

## Severity scale
- **SEV1 – Critical:** active breach, member PII/payment exposure, physical access compromised, production down.
- **SEV2 – High:** confirmed vulnerability being exploited or a leaked secret with broad access.
- **SEV3 – Moderate:** contained issue, limited exposure, no confirmed data loss.

## Process (detect → contain → eradicate → recover → review)

### 1. Detect & declare
- Capture what was observed, when, and where. Open a **private** tracking issue (label `priority: urgent`, `security`). Assign an incident lead. Set severity.

### 2. Contain
- Stop the bleeding: revoke/rotate affected credentials, disable the affected endpoint/feature, block offending IPs, or take the component offline.
- **Any secret seen in source control or logs is compromised — rotate it immediately** (see SEC-01).
- Preserve evidence first: snapshot relevant logs (DB access, auth, webhook, device-control, app) before changing things.

### 3. Eradicate
- Identify root cause. Remove the attacker's access, backdoors, and the underlying flaw. Patch via the normal branch → PR → review flow (expedited for SEV1/2).

### 4. Recover
- Restore from known-good, verified backups if integrity is in doubt. Re-enable services once validated. Watch closely for recurrence.

### 5. Notify (when personal data is or may be exposed)
- Engage the org/data-protection contact. Notify affected members and authorities per applicable law — **GDPR: within 72 hours** of becoming aware; follow applicable state breach-notification laws. Keep a record of the decision and timeline.

### 6. Post-incident review (blameless)
- Within ~1 week: timeline, root cause, what worked/didn't, and concrete follow-ups. File the follow-ups as issues (with severity SLAs from `CLAUDE.md` §9) and link them here.

## Evidence handling
- Store logs/artifacts in an access-controlled location. Do not paste secrets or member PII into issues/PRs/chat. Reference by location, not value.

## After action
- Update detections/monitoring so this class of incident is caught earlier next time. Update this runbook if any step was unclear.
