<!-- Full rules: CLAUDE.md + docs/audit/05-engineering-process.md (§6/§7) + docs/audit/06-security-standards.md -->

## What & why
- Finding / area: <!-- SEC-## / SOLID-## / BND-## / feature -->
- Closes Work Item: <!-- WI-#.# if applicable -->
- Issues: Refs #<!-- epic -->, #<!-- finding -->   <!-- use "Closes #<finding>" ONLY if this PR fully satisfies its acceptance (see 05 §9) -->
- Summary:

## Scope
- [ ] This PR is exactly ONE unit of work (one branch).
- Files touched:

## Security-relevant change? (CLAUDE.md §2)
A change is security-relevant if it touches authn/session, authorization, crypto/secrets, payments/webhooks, PII, file upload, server-side fetch of user URLs, the IoT/`vps` tier, or infra/deploy config.
- [ ] **Not** security-relevant — skip the next two blocks.
- [ ] Security-relevant — threat model / abuse cases recorded here or in the issue (CLAUDE.md §3):
- [ ] Requesting **SEC** review.

## Downstream-impact analysis (required — 05 §4)
- Public contracts changed? (signatures / return shapes / route schema / env / DB fields):
- Consumers of touched symbols (repo search) and effect on each:
- [ ] Contracts preserved, OR all consumers updated in this PR.
- [ ] Existing tests pass unchanged.

## End-to-end tests (required — 05 §5)
- [ ] Every touched/refactored file has E2E coverage through the real boundary.
- New/updated E2E tests:
- Security/abuse case asserted (from the finding/threat model):
- [ ] **Regression test** (bug fix / remediation only): reproduces the issue, would FAIL on the old code, PASSES now; names the finding.

## Security standards (06 — check those that apply)
- [ ] No secrets/keys in code or logs; no `process.env.X || '<literal>'` fallbacks.
- [ ] Sensitive data encrypted (AES-256-GCM + random IV; TLS/WSS in transit); crypto fails closed.
- [ ] AuthN + server-side AuthZ enforced; identity from session, not client input.
- [ ] Input validated; responses field-projected (no PII/hashes/foreign data).
- [ ] Security audit events emitted for security-relevant actions (09).

## Secrets / rotation (if applicable)
- Secret rotated: ____   Old value invalidated: [ ]   (do NOT paste secret values here)

## Verification
- [ ] CI gates green (lint, test, e2e, secret-scan, SAST, SCA, headers/tls/response-shape as applicable).
- [ ] Plain-language labels applied (no opaque codes — CLAUDE.md §13).
