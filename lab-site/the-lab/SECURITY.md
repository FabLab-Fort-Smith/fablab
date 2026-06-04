# Security Policy

We take the security of The-Lab and our members' data seriously. Thank you for helping keep it safe.

## Reporting a vulnerability

**Please report security vulnerabilities privately — do not open a public issue.**

- Email **security@fablabfortsmith.org** <!-- confirm/route this address --> with details and steps to reproduce.
- Include: affected URL/endpoint/file, impact, reproduction steps, and any logs/PoC. **Do not** include live secrets in your report.
- We will acknowledge within **2 business days** and aim to give a remediation timeline after triage.

### Our response targets (triage → fix)
| Severity | Target |
|----------|--------|
| Critical | ≤ 48 hours |
| High | ≤ 7 days |
| Medium | ≤ 30 days |
| Low | ≤ 90 days |

(See `docs/audit/05-engineering-process.md` and `docs/security/INCIDENT-RESPONSE.md` for how we handle confirmed issues, including breach notification when personal data is involved.)

## Scope

**In scope:** the production web application, its API, and supporting infrastructure (database, storage, payment/webhook handling, the IoT/device control tier).

**Out of scope:** the **"Hack the Lab" capture-the-flag game** is *intentionally vulnerable* and is a feature, not a bug. Planted flags, fake credentials, and deliberate weaknesses in the following are expected and **must not** be reported as vulnerabilities:
- `vps/missions/**`
- `src/app/dashboard/activities/terminal/**`
- `src/app/api/v1/holodeck/**`, `src/app/api/v1/arcade/**`, `src/app/components/holodeck/**`

If you find a way to break out of the game into real infrastructure or member data, **that is in scope** — please report it.

## Safe harbor

We will not pursue or support legal action against researchers who, in good faith:
- make a reasonable effort to avoid privacy violations, data destruction, and service disruption,
- only interact with accounts they own or have explicit permission to test,
- do not access or exfiltrate other members' personal data, and
- report promptly and give us reasonable time to remediate before public disclosure.

## Supported versions

The deployed `main` branch is the only supported version.
