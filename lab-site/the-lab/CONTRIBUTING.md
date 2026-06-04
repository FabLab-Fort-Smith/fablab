# Contributing to The-Lab

Welcome! This guide is written to be friendly to **everyone** — including contributors who aren't full-time developers. If a term is unclear, ask in the issue or PR; no question is too basic.

> The complete engineering rules live in **[`CLAUDE.md`](./CLAUDE.md)** (the single source of truth for both people and AI tools). This page is the short, human-friendly on-ramp.

## The short version
1. **Every change starts with a GitHub issue.** Find or open one that describes the problem. No fix without a tracked issue.
2. **Work on your own branch**, never directly on `main`. Branch names: `fix/<short-description>`, `feat/<short-description>`, or `remediation/<area>-<slug>` for audit fixes.
3. **Open a Pull Request** back into `main` using the PR template. Link the issue (e.g. "Refs #12", or "Closes #12" when it fully resolves it).
4. **Add tests** that prove your change works end-to-end (real request → logic → database → response), including the case that was broken.
5. **Don't break anything that depends on your code.** If you change how a function/route is called, update everyone who calls it in the same PR.
6. **Wait for the automated checks (CI) to pass** and for a review before merging. Security-related changes also need a security review.

## Golden rules for safety (please don't skip)
- **Never put passwords, API keys, tokens, or database connection strings in the code.** They come from environment variables / a secrets manager.
- **Never log sensitive data** (passwords, tokens, people's emails/phone numbers, full user objects).
- **Always require login** for anything that isn't meant to be public, and check that the logged-in person is allowed to do the action.
- **Encrypt sensitive data** — see `CLAUDE.md` §3 and `docs/audit/06-security-standards.md`.
- The **"Hack the Lab" game** (`vps/missions/**`, `holodeck`, `arcade`, the terminal activity) contains *intentional* fake vulnerabilities and secrets for the game. **Leave them alone** — don't "fix" or remove them. If you're not sure whether something is game content or a real problem, ask first. (`CLAUDE.md` §7.)

## Useful commands
- Install: `npm install`
- Run locally: `npm run dev`
- Lint: `npm run lint`
- Tests: `npm test`
- Build: `npm run build`

## Where to read more
- Coding & architecture rules: [`CLAUDE.md`](./CLAUDE.md)
- How we deliver changes (branches, PRs, reviews, CI): [`docs/audit/05-engineering-process.md`](./docs/audit/05-engineering-process.md)
- Security standards (encryption, no data leakage): [`docs/audit/06-security-standards.md`](./docs/audit/06-security-standards.md)
- What the current known issues are: [`docs/audit/01-security-findings.md`](./docs/audit/01-security-findings.md) and the GitHub issues tracker.
