# Security Policy

## Reporting a vulnerability

If you discover a security issue in this project (the deploy platform or the websites it
serves), please report it privately:

- **Email:** john.annis@fablabfortsmith.org
- Do **not** open a public issue for an unfixed vulnerability.

Include: affected component (`lab-stack` / `lab-site/<name>`), a description, reproduction
steps, and impact. We aim to acknowledge within **72 hours** and to triage on the SSDLC
remediation SLAs (`@rules/workflow-vuln-mgmt.md`): Critical/actively-exploited 24–72h,
High 7 days, Medium 30 days.

## Scope & sensitivity

The platform handles **restricted** material — deploy tokens, registry credentials, TLS
private keys, and webhook signing secrets. Treat any exposure of these as a security
incident (`@rules/workflow-incident-response.md`): rotate first, then investigate.

## Supported

This project is pre-release. Only the current `main` is supported.
