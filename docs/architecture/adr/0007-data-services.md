# ADR 0007 — Data services: self-hosted MongoDB; external object storage & email

- **Status:** Accepted
- **Date:** 2026-06-03

## Context

The-Lab depends on a MongoDB database, S3-compatible object storage (`s3.crittercodes.dev`),
and SMTP email. Self-hosting on a single budget VPS (ADR 0004) means deciding, per service,
what runs on the box vs. stays external — balancing cost, operational burden, the single-VPS
SPOF, and data sensitivity (personal/payment data — `@rules/std-privacy.md`, `@rules/std-pci.md`).

## Decision

- **MongoDB → self-hosted on the VPS** as a Coolify-managed service (dedicated container/volume).
- **Object storage → external**, unchanged (`s3.crittercodes.dev`); the migrated app points at it.
- **Email (SMTP) → external**, unchanged; the migrated app points at it.

## Rationale

- **MongoDB self-hosted:** keeps the primary datastore on infrastructure we control, no managed-
  DB cost. *Accepted trade-off:* we own its backups, security, patching, and it shares the SPOF
  and resources with the app (8 GB headroom helps).
- **Storage & email external:** least migration risk and keeps user uploads/PII and mail
  reputation off the budget VPS; these are stable, working integrations — don't move what isn't
  the goal. Treated as **untrusted upstreams** (`@rules/topic-api-consumption.md`).

## Consequences

- **Positive:** controlled DB; minimal blast radius for the migration; lower cost.
- **Negative / accepted — MongoDB on the VPS:**
  - **Backups are now our job** — automated, **encrypted**, off-box, with a **tested restore**
    on a schedule (`@rules/workflow-data-lifecycle.md`, `@rules/topic-reliability.md`); the DB
    holds personal + payment-adjacent data (restricted — master §5).
  - **Security:** bind to the private Docker network only (not public), strong auth,
    least-privilege app user, TLS, at-rest encryption; NoSQL-injection discipline in the app
    (`@rules/topic-nosql.md`).
  - **SPOF / capacity:** DB + app on one host — monitor resources; HA/replica deferred and
    documented (overview §5).
  - **PCI:** storing only Square tokens/order references — **never PAN/SAD** — keeps the DB out
    of the cardholder-data store category (`@rules/std-pci.md`).
- **External services:** dependency on third parties — set timeouts/retries, scope credentials
  least-privilege, rotate, and never log payloads with PII/secrets.

## Alternatives considered

- **Managed MongoDB Atlas** — offloads ops/backups/HA and removes the DB from the SPOF; rejected
  for now (cost + decision to self-host). *Revisit* if backup/HA burden or growth warrants it —
  the connection-string abstraction makes that switch low-friction.
- **Self-host MinIO + mail relay** — more self-contained but more to operate/secure; rejected to
  keep the migration small.
