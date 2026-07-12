# ADR 0012 — Tailnet-first admin + Cloudflare-gated webhooks for the deploy platform

- **Status:** Proposed
- **Date:** 2026-07-12
- **Builds on:** ADR 0002 (Coolify as deploy engine), ADR 0004 (VPS / config-as-code, SSH-only
  transport), ADR 0006 (migrate from Vercel — instant-deploy + PR-preview UX is the goal). Realizes
  `@rules/topic-tailnet-dev-access.md`, `@rules/std-zero-trust.md`, `@rules/topic-webhooks.md`.

## Context

The Coolify dashboard is a **high-value admin surface** (it can deploy code, read env/secrets, and
control containers). We do not want it exposed on the open internet. Existing controls:

- The origin is firewalled so ports 80/443 accept traffic **only from Cloudflare** (`harden` role),
  and DNS routes `deploy` / `staging` / `*.preview` through Cloudflare.
- We added a `tailscale` role so the VPS joins the owner's tailnet; the dashboard is reachable
  privately at `http://fablab-prod:8000` over WireGuard, with UFW allowing `:8000` from Tailscale
  ranges only.

But the platform's whole purpose (ADR 0006) is to **replicate Vercel's instant-deploy + PR
previews**, which requires **GitHub → Coolify webhooks**. GitHub POSTs deploy events from the
public internet to the Coolify instance URL. A *purely* tailnet-only Coolify cannot receive them.

**Tension:** private admin access (tailnet) vs. a publicly reachable webhook endpoint (instant
deploy). We need both.

## Decision

**Tailnet-first admin, with a Cloudflare-gated public surface scoped to the deploy machinery.**

1. **Admin/UI over the tailnet (primary).** Day-to-day dashboard access is `http://fablab-prod:8000`
   over the tailnet (WireGuard-encrypted; Coolify auth + MFA still enforced). UFW permits `:8000`
   from the Tailscale ranges only (`tailscale` role).
2. **Public instance domain.** Set Coolify's instance FQDN to `https://deploy.fablabfortsmith.org`.
   It is required for TLS, correct generated URLs, **and the GitHub App webhook**. The origin stays
   locked to Cloudflare (`harden`).
3. **Cloudflare Access on the dashboard.** An Access application over `deploy.fablabfortsmith.org`
   with an **Allow** policy limited to the maintainers' identities (email / IdP), MFA-backed — so a
   human who is *not* on the tailnet must still authenticate. Humans never reach the UI unauthenticated.
4. **Webhook path exception (Bypass).** A **Bypass** policy for Coolify's webhook path
   (`/webhooks/*`) so GitHub — which cannot complete a Cloudflare Access challenge — can POST deploy
   events. This is safe because **Coolify HMAC-verifies every webhook** against the per-source secret
   (`@rules/topic-webhooks.md`); optionally tighten with GitHub's published hook IP ranges.
5. **Deployed apps stay public** (`staging.`, `*.preview.`) via Cloudflare as intended — those are
   the websites, not the admin plane.

Concrete Access configuration lives in `lab-stack/cloudflare/access-policy.md`.

## Consequences

- **(+)** Admin attack surface is kept off the open internet (tailnet private path + Cloudflare
  Access for the public path), while instant-deploy and PR previews still function.
- **(+)** Defense in depth: Tailscale ACLs, Cloudflare Access (human identity + MFA), origin locked
  to Cloudflare, HMAC on webhooks, and Coolify's own auth+MFA — no single control is load-bearing.
- **(+)** The Access policy is configuration (documented, reviewable). Managing it via API/Terraform
  needs a **broader token** (`Access: Apps and Policies: Edit`, account-scoped) than the
  `Zone:DNS:Edit` DNS token — keep them separate and least-privilege.
- **(−)** The webhook path is publicly reachable and **not** Access-gated — a deliberate, documented
  exception that relies on HMAC (and optionally a GitHub-IP allowlist). Scope the Bypass to the exact
  webhook path only; never bypass the whole app.
- **(−)** Two admin paths (tailnet + Cloudflare-gated public) to reason about and keep in sync;
  documented here to avoid drift.

## Alternatives considered

- **Tailnet-only, no public domain.** Simplest/most private, but GitHub webhooks can't reach it →
  no instant deploy (defeats ADR 0006). Rejected as the default (viable only with git *polling*,
  which loses the instant/PR-preview UX).
- **Public dashboard behind Cloudflare Access only (no tailnet).** Works and is auth-gated, but the
  admin plane is still reachable on the internet. We keep the tailnet as the *primary* path for a
  private, defense-in-depth posture; Access is the fallback for off-tailnet humans.
- **Git polling instead of webhooks.** Coolify can poll, avoiding any public webhook — but loses
  instant-deploy immediacy and prompt PR previews. Kept as a fallback if we ever choose to close the
  public surface entirely.
- **Cloudflare Tunnel (`cloudflared`) for the dashboard.** Would expose the UI without opening ports,
  as an alternative to Access. More moving parts, and we already front everything via Cloudflare;
  noted as a future option if we drop the public `:80/:443` edge.

---
_Revisit if: we adopt SSO/IdP for Access, move webhook delivery to polling, or add more admin hosts._
