# ADR 0010 — Provision MongoDB via Ansible (standalone), as config-as-code

- **Status:** Accepted
- **Date:** 2026-07-11
- **Amends:** ADR 0007 (self-hosted MongoDB) — supersedes only its *provisioning method*
  ("a Coolify-managed service"). The self-host-vs-external decisions in 0007 stand.

## Context

ADR 0007 chose to self-host MongoDB on the single VPS (ADR 0004) but left it as a **manually
created Coolify service** — the operator clicked through the Coolify UI to create the container,
set a root password, and add an app user/DB. That is click-ops: not reproducible, not reviewable,
and the generated `MONGO_ROOT_PASSWORD` / `MONGO_APP_PASSWORD` (from `make secrets`) had nothing
consuming them. The platform's principle is **config-as-code, no click-ops** (ADR 0004,
`lab-stack/CLAUDE.md`). A true multi-node cluster is not possible on one 8 GB host, and the app
(The-Lab) uses no multi-document transactions or change streams (verified — 0 uses), so a replica
set is not required today.

## Decision

Provision MongoDB with an **Ansible `mongodb` role** run during `make converge`:

- **Standalone** `mongod` (single node) via a **Docker Compose** stack the role templates onto the
  VPS (`/opt/fablab/mongodb`), pinned image, named volume.
- On a **dedicated private docker network** (`fablab`) with **no published host port**; the
  Coolify-deployed app attaches to that network and connects by container name.
- **Root** credentials and a **least-privilege app user + database** are created from the
  auto-generated secrets in `../.env` (`MONGO_ROOT_PASSWORD` / `MONGO_APP_PASSWORD`), read at
  converge time; the app user gets `readWrite` on the app DB only.
- The role writes a root-only `/etc/fablab/mongo.env` (`MONGODB_URI` + network + image) that the
  **backup cron** (roles/backups) sources — backups run `mongodump` in an ephemeral container on
  the private network.

## Rationale

- **Config-as-code + reproducible:** the DB is now part of the reviewed, idempotent converge (ADR
  0004) instead of hand-clicks; consumes the generated secrets so nothing is set by hand.
- **Standalone, not a "cluster":** one VPS can't host a real multi-node cluster; the app needs no
  transactions/change streams, so standalone is correct and lighter. A single-node replica set is
  an easy future toggle if transactions are later needed.
- **Ansible- vs Coolify-managed:** automating Coolify's API to create a DB service is brittle and
  version-specific and fights Coolify's own credential generation; an Ansible compose stack on a
  shared network is portable, testable, and keeps one source of truth for the creds.

## Consequences

- **Positive:** reproducible DB provisioning; generated creds actually used; private-network-only;
  least-privilege app user; backups already wired to it.
- **Negative / accepted:**
  - Mongo lives outside Coolify's service catalog — Coolify won't show/manage it; our Ansible +
    backups role own its lifecycle. The Coolify app must be **attached to the `fablab` network**
    (a documented one-time step).
  - The app password rests in a root-only init script + `mongo.env` on the VPS (0600) — standard
    for self-hosted; rotate via `make secrets ARGS=--force` then re-converge + redeploy.
  - **TLS in transit** and **at-rest encryption** are not yet configured (Community edition lacks
    native at-rest; rely on host-disk encryption). Tracked as hardening follow-ups; private-net +
    auth + least-privilege are in place now.
  - Still a SPOF on one host (as in 0007); HA/replica deferred.

## Alternatives considered

- **Keep Coolify-managed (ADR 0007 as-is):** rejected — click-ops, not reproducible, ignores the
  generated secrets.
- **Coolify API automation:** rejected — brittle/version-specific; hard to make idempotent.
- **Single-node replica set now:** deferred — extra moving parts (keyfile, `rs.initiate`) for a
  capability the app doesn't use yet; documented as an easy toggle.
- **Managed Atlas:** still the escape hatch per ADR 0007 if ops/HA burden grows — the
  `MONGODB_URI` abstraction keeps the switch low-friction.
