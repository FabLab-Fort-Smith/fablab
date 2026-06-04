# ADR 0002 — Use Coolify as the deploy engine

- **Status:** Accepted
- **Date:** 2026-06-03
- **Decision owner:** John Annis (FabLab Fort Smith)

## Context

We want Vercel's developer experience self-hosted: git-push deploy, **preview deployments per
branch/PR**, atomic zero-downtime swaps, instant rollback, and automatic HTTPS — on our own
VPS, open-source, at FabLab budget. We compared the tools teams shortlist in 2026.

### Options compared

| Option | Git-push | Preview deploys | UI | Auto-TLS | Footprint | License | Notes |
|---|:--:|:--:|:--:|:--:|:--:|---|---|
| **Coolify** | ✅ | ✅ **native, best-in-class** | ✅ | ✅ | ~2 GB+ | Apache-2.0 (true OSS) | Closest to Vercel; v4.0 May 2026 |
| Dokploy | ✅ | ✅ good | ✅ | ✅ | lighter | partly source-available | Younger (2024), faster UI, license caveats |
| Dokku | ✅ | ⚠️ DIY | ❌ | ✅ (plugin) | tiny (~1 GB) | MIT | Mature, CLI-first, no native previews |
| CapRover | ✅ | ❌ | ✅ | ✅ | medium | Apache-2.0 | Swarm-based, dated, no real previews |
| Kamal | ✅ (deploy cmd) | ❌ | ❌ | ✅ | tiny | MIT | No UI/previews/build-detect; single-app focus |
| DIY CI + registry + Watchtower | ✅ | ⚠️ DIY | ❌ | ⚠️ DIY | varies | n/a | Max control + best supply-chain; highest maintenance |

## Decision

Adopt **Coolify** (self-hosted, Docker-based PaaS) as the deploy engine for `lab-stack`,
fronted by **Cloudflare (free tier)** for edge caching/TLS/DDoS. Keep SSDLC test-gating in
**CI** (Coolify has no native test-gate; `@rules/workflow-cicd.md`).

## Rationale

- **Preview deployments are the differentiator** and Coolify has the strongest native story
  (per-PR isolated environments, auto subdomains `pr-N.preview.<domain>`, auto-cleanup) — this
  maps directly onto our model: one `lab-site/<site>/` folder, with production/staging/preview
  environments built from branches (ADR 0005).
- Native git-push deploy for **both GitHub and GitLab** (ADR 0003), built-in Traefik +
  Let's Encrypt (incl. wildcard for previews), one-click rollback, deployment history.
- **True open-source (Apache-2.0)** — no feature paywall/source-available caveats (the main
  knock on Dokploy). Large community; actively developed (v4.0, May 2026).
- 8 GB RackNerd VPS (ADR 0004) is comfortably above Coolify's ~2 GB floor.

## Consequences

- **Positive:** all 7 Vercel features covered (6 on-VPS + Cloudflare edge); fast path to a
  working platform; low cost (~VPS bill).
- **Negative / accepted:**
  - Heaviest option — runs a control plane (DB, queue, proxy) on the VPS; more to operate.
  - The **Coolify UI is a source of truth** → config-drift risk vs. pure IaC. *Mitigation:*
    keep host + bootstrap as code (ADR 0004), export/back up Coolify config, document setup in
    runbooks, change via reviewed process (`@rules/topic-iac-cloud.md` "no click-ops" spirit).
  - No native test-gate → CI owns it (merge-blocking gates).
  - Single VPS = SPOF → backups + tested restore; HA deferred (see overview §5).

## Alternatives & when we'd revisit

- **Dokploy** if Coolify proves too heavy and the source-available license is acceptable.
- **DIY CI + signed-image + registry** if supply-chain control/compliance ever outweighs
  convenience (strongest SBOM/provenance story; we'd hand-build previews/TLS/rollback).
- **Dokku/Kamal** if we collapse to a single, simple app with no preview need.

## Sources

- Open-source Vercel alternatives compared (Coolify/Dokku/Kamal/CapRover), Autonoma, 2026 —
  https://getautonoma.com/blog/open-source-alternatives-vercel
- Dokploy vs Coolify 2026 (preview deploys, license) — https://blog.logrocket.com/dokploy-vs-coolify-production/
  and https://contabo.com/blog/blog-coolify-vs-dokploy-comparison/
- Coolify preview deployments docs/wiki — https://coolify.io/docs and
  https://deepwiki.com/coollabsio/coolify/5.6-preview-deployments
- Self-hosted deployment tools compared (2026) — https://haloy.dev/blog/self-hosted-deployment-tools-compared
