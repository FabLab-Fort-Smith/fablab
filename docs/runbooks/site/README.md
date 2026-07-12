# Runbook site — interactive checklist catalog

Generates an **interactive, accessible web catalog** of the fablab runbooks from
`docs/runbooks/*.md`. The markdown stays the single source of truth — this only renders it, so
the checklists can never drift from the runbooks.

## What you get
- **Catalog index** grouping every runbook by **category** and **usage** (cards with progress).
- **Guided walkthrough** per runbook: sections are shown **one at a time, in order**, with
  **Previous/Next** controls and a "Section X of N" indicator; ←/→ arrow keys navigate; the current
  position is saved/restored (`localStorage`). A **Show all** toggle switches to the full page, and
  printing always shows every section. Section changes move focus to the heading and announce via a
  live region (keyboard/screen-reader friendly).
- **Per-runbook pages** where numbered steps and `- [ ]` items become **interactive checkboxes**;
  progress is saved per-runbook in the browser (`localStorage`), with a progress meter, **Reset**,
  and **Print**.
- **Accessible (WCAG 2.2 AA target):** semantic HTML, one `<h1>`/page, skip link, `<main>`/`<nav>`
  landmarks, keyboard-operable controls with visible focus, an `aria-live` progress announcement,
  `prefers-color-scheme` + a theme toggle, `prefers-reduced-motion`, and print styles.
- **Self-contained output** — inline CSS/JS, no external/CDN requests → CSP-safe, works over
  `file://` and offline.

## Use
```bash
cd docs/runbooks/site
npm ci
npm run build      # -> dist/ (git-ignored)
npm test           # structure + a11y basics + self-contained checks
npm run serve      # 127.0.0.1:8577 (+ tailnet IP if `tailscale` is present) — never public
```
`npm run serve` **hot-reloads** — it watches `docs/runbooks/*.md` + the generator, rebuilds on
change, and live-reloads open browsers (the live-reload client is injected only at serve time, so
`dist/` stays production-clean).

Open `dist/index.html` directly, or `npm run serve` and browse from a tailnet device
(`@rules/topic-tailnet-dev-access`). **Do not** publish it publicly — runbooks contain internal
ops detail. CI (`.github/workflows/ci.yml` → *Runbook site*) builds + tests it on every change.

## Cataloging a runbook
Add YAML front-matter to the runbook `.md` (all optional — sensible fallbacks apply):
```yaml
---
title: Bootstrap the VPS
category: Provisioning & Setup      # groups it in the index (see CATEGORY_ORDER in build.mjs)
usage: One-time / rebuild           # shown as a chip
order: 10                           # sort within a category
summary: One-line description for the card.
---
```
Any new `docs/runbooks/*.md` is picked up automatically (`README.md` is skipped). Categories order
by `CATEGORY_ORDER`; unknown categories sort last under their own heading.

## How it works (`build.mjs`)
markdown-it renders each runbook; a small rule tags ordered-list items (procedure steps) and the
task-list plugin handles `- [ ]` — both become stateful checkboxes. Headings get stable ids for the
on-page contents list. Output is written to `dist/` (rebuilt clean each run).
