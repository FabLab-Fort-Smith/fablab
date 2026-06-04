# ADR 0004 — Host on RackNerd VPS; provider-agnostic server + on-host config-as-code

- **Status:** Accepted
- **Date:** 2026-06-03

## Context

We start on a **RackNerd 8 GB KVM VPS**. The user wants a blend of "infra as code" (#2) and
"provider-agnostic" (#3). We checked whether RackNerd supports declarative provisioning.

**Finding:** RackNerd runs on **SolusVM**. Its *client* API only performs lifecycle operations
(boot/reboot/shutdown/rebuild/status/usage) — there is **no Terraform provider** and **no API
to provision a new VPS**; instances are ordered through the RackNerd portal/billing (WHMCS).
So "provision the VPS with Terraform" is **not available** at this provider.

## Decision

Split the concern in two:

1. **The server instance is a provider-agnostic given (#3).** Order the RackNerd VPS manually
   (Ubuntu LTS). Nothing in `lab-stack` assumes RackNerd-specific provisioning APIs, so the
   stack runs on **any Linux VPS** — we can move providers later without rework.
2. **Everything *on* the server is config-as-code (#2).** OS hardening, users, Docker, Coolify
   install, and reverse-proxy/app config are defined as **idempotent code** — `cloud-init` for
   first boot + **Ansible** for convergent configuration — committed to `lab-stack/`. The
   server is reproducible from code even though the VM order isn't.

## Rationale

- Honest about the platform's real capability (no fictional Terraform provider).
- Keeps the IaC benefits that matter most: **reproducibility, review, drift control** of the
  server's configuration.
- **Portability:** provider-agnostic config means a future move (Hetzner/DO/etc., which *do*
  have Terraform providers) is incremental — we'd add a provisioning layer, not rewrite.
- 8 GB RAM comfortably exceeds Coolify's ~2 GB floor (ADR 0002).

## Consequences

- **Positive:** reproducible, reviewable host config; no lock-in; cheap to start.
- **Negative / accepted:**
  - **Manual VM ordering & DNS** are out-of-band steps (documented in a bootstrap runbook), not
    code. The SolusVM client API can script reboot/rebuild only.
  - One VPS = **single point of failure** → automated **encrypted backups + a tested restore
    runbook** (`@rules/workflow-data-lifecycle.md`, `@rules/topic-reliability.md`); HA deferred.
  - Must **harden the host** ourselves (CIS-aligned: SSH keys only, firewall, fail2ban,
    unattended-upgrades, non-root deploy user — `@rules/std-cis.md`); budget VPS ≠ managed.

## Alternatives considered

- **Provider with a Terraform provider** (Hetzner/DigitalOcean/Linode) for full
  provision-as-code — deferred; revisit if we outgrow a single RackNerd box or need HA. The
  provider-agnostic design above makes that migration cheap.
- **Managed PaaS (Vercel/Netlify)** — the thing we're explicitly replacing for cost/control.

## Sources

- RackNerd uses SolusVM; client-API capabilities — https://lowendtalk.com/discussion/167911/does-racknerd-provide-api-access
- SolusVM client API reference — https://docs.solusvm.com/en/solusvm2/api-reference/api/
