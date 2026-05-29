# AGENTS.md

The engineering rules for any AI / code-generation agent working in this repo are defined **canonically in [`CLAUDE.md`](./CLAUDE.md)**. Read and follow it before generating or changing code.

Do not duplicate the rules here — this pointer exists only so tools that look for `AGENTS.md` find the single source of truth. If a rule needs to change, change it in `CLAUDE.md` (and the binding docs it references under `docs/audit/`), not here.

Key reminders (full detail in `CLAUDE.md`):
- Binding docs: `docs/audit/06-security-standards.md` (security) and `docs/audit/05-engineering-process.md` (delivery).
- PR-only into `main`; one feature branch per unit of work; no downstream impact; full end-to-end tests; a tracked GitHub issue per fix.
- Encrypt everything; no secrets/PII in code or logs; authenticate every non-public route.
- `vps/missions/**`, `holodeck`, `arcade`, and the terminal activity are **intentional CTF content** — do not "fix" their planted vulnerabilities (see `CLAUDE.md` §7).
