# ADR 0015 — Automated provider-credential provisioning + reCAPTCHA → Cloudflare Turnstile

- **Status:** Accepted
- **Date:** 2026-07-19

## Context

Moving off Vercel to self-hosted infra means we now own credential provisioning that Vercel used
to hide. Some secrets we already generate ourselves; some provider keys/tokens can be created via
provider APIs; and some can only be created by clicking in a vendor console. We want to **automate
what is automatable** (config-as-code, no click-ops — `lab-stack/CLAUDE.md`) and **document the rest**
so onboarding a provider is repeatable, not tribal knowledge. The trigger was reCAPTCHA: the app's
classic reCAPTCHA v2 keys **cannot** be created by any API (console-only), which blocked automation.

## Decision

### 1. A three-tier model for credential provisioning
- **Tier 1 — Self-generated.** No provider involved: `AUTH_SECRET`, `JWT_SECRET`, `ENCRYPTION_KEY`,
  `INTERNAL/SOCKET_API_SECRET`, Mongo passwords (openssl CSPRNG — `scripts/gen-secrets.sh`), SSH/CA
  keys (`ssh-keygen` — `ssh-ca/`). Already automated.
- **Tier 2 — API-provisionable.** The provider exposes a create-API, so given a **scoped admin token**
  we create the credential, write it to the shared vault + `.env`, idempotently. Covered by the new
  `scripts/provision-provider-keys.sh` (provider registry): **Cloudflare Turnstile** widgets,
  **Cloudflare scoped API tokens**, **Tailscale** tailnet auth keys, **ZeroTier** network/member auth,
  **PurelyMail** mailboxes (adapter exists), **S3/object-store** access keys. Each admin token is
  itself a Tier-3 or vault-held credential, least-privilege, one per purpose.
- **Tier 3 — Console-only.** The provider offers **no** create-API; provisioning is a documented
  manual checklist (`docs/runbooks/provider-provisioning.md`), values then stored in the vault:
  **Google OAuth client** (SSO), **Discord OAuth app**, **Square app**, and **classic reCAPTCHA**.

### 2. Replace classic reCAPTCHA with Cloudflare Turnstile (moves it Tier 3 → Tier 2)
Classic reCAPTCHA v2 is Tier 3 (console-only) and we already had a test-key leak into staging.
**Cloudflare Turnstile** is free, privacy-friendly, fits our Cloudflare-fronted stack, and its widgets
are **API-creatable** (`POST /accounts/{id}/challenges/widgets` → sitekey + secret; verified the
endpoint, requires a **Turnstile:Edit** token). Adopting it makes the captcha a Tier-2, fully-automated
credential. Requires an app change (swap `react-google-recaptcha` + `google.com/recaptcha/api/siteverify`
for the Turnstile script/`@marsidev/react-turnstile` + `challenges.cloudflare.com/turnstile/v0/siteverify`)
— tracked as a separate app PR. Env: `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (build) + `TURNSTILE_SECRET_KEY`
(runtime), replacing the `*_RECAPTCHA_*` vars.

### 3. Provisioned credentials land in the vault (source of truth)
The provisioning tool writes created keys to `../.env` (source-safe) and they belong in the shared
Vaultwarden Infrastructure collection (ADR 0014, `secrets-pull`). Admin/provisioning tokens are
least-privilege, held in the vault, never committed.

## Consequences

- **+** New credentials (esp. Cloudflare-family + captcha) are created reproducibly from code, not
  console clicks; the automatable/manual boundary is explicit, so nobody wastes time trying to
  API-create a Tier-3 credential.
- **+** Turnstile removes a whole class of problem (reCAPTCHA test-key/domain-allowlist footguns) and
  keeps the anti-bot control inside the stack we already operate.
- **−** Tier-2 still depends on a human-provisioned **scoped admin token** per provider (bootstrap
  chicken-and-egg) — those are Tier-3/manual and vault-held.
- **−** The Turnstile switch is an app change (code + tests + the register/verify flow) — not free;
  sequenced as a follow-up PR. Until it lands, staging keeps classic reCAPTCHA (reuse the prod key).

## Alternatives considered
- **Keep classic reCAPTCHA, stay manual** — rejected: perpetuates the console-only footgun that already
  bit us; no automation path.
- **reCAPTCHA Enterprise (GCP API)** — API-creatable, but adds a GCP dependency + service account and
  still an app migration; Turnstile is simpler and already in-stack.
- **Auto-mint provider admin tokens too** — can't; token creation is itself Tier-3 for most providers
  (and a bootstrap root-of-trust that should stay human-gated).

## Related
- `scripts/provision-provider-keys.sh` + `docs/runbooks/provider-provisioning.md`; ADR 0014 (shared
  vault + secrets-pull); `scripts/gen-secrets.sh` (Tier 1); `cloudflare/*.sh` (existing CF automation).
