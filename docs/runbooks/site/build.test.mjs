// Tests for the runbook-site generator: run the build, then assert structure, interactivity,
// accessibility basics, and self-containment. No browser needed. Run: npm test (node --test).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(dir, "dist");
execFileSync(process.execPath, ["build.mjs"], { cwd: dir, stdio: "pipe" });

const read = (f) => fs.readFileSync(path.join(dist, f), "utf8");
const pages = fs.readdirSync(dist).filter((f) => f.endsWith(".html"));
const runbookPages = pages.filter((f) => f !== "index.html");

test("builds an index + at least one runbook page", () => {
  assert.ok(pages.includes("index.html"), "index.html exists");
  assert.ok(runbookPages.length >= 2, "≥2 runbook pages");
  assert.ok(pages.includes("bootstrap-vps.html"), "bootstrap-vps page exists");
});

test("index groups runbooks by category and shows usage", () => {
  const idx = read("index.html");
  assert.match(idx, /Provisioning &amp; Setup/, "Provisioning category present");
  assert.match(idx, /Deploy &amp; Release/, "Deploy category present");
  assert.match(idx, /class="chip">[^<]*One-time/, "usage chip present");
  for (const p of runbookPages) assert.match(idx, new RegExp(`href="${p}"`), `index links ${p}`);
});

test("every page: one <h1>, lang, title, skip link, <main> landmark", () => {
  for (const f of pages) {
    const h = read(f);
    assert.equal((h.match(/<h1[\s>]/g) || []).length, 1, `${f}: exactly one h1`);
    assert.match(h, /<html lang="en"/, `${f}: lang set`);
    assert.match(h, /<title>[^<]+<\/title>/, `${f}: has title`);
    assert.match(h, /class="skip" href="#main"/, `${f}: skip link`);
    assert.match(h, /<main id="main">/, `${f}: main landmark`);
  }
});

test("runbook pages have interactive, labelled checkboxes + progress + reset", () => {
  for (const f of runbookPages) {
    const h = read(f);
    assert.ok((h.match(/type="checkbox"/g) || []).length > 0, `${f}: has checkboxes`);
    assert.doesNotMatch(h, /type="checkbox"[^>]*\sdisabled/, `${f}: checkboxes NOT disabled`);
    assert.match(h, /id="rb-meter"/, `${f}: progress meter`);
    assert.match(h, /aria-live="polite"/, `${f}: live region for progress`);
    assert.match(h, /id="rb-reset"/, `${f}: reset control`);
    assert.match(h, /localStorage/, `${f}: persists progress client-side`);
  }
});

test("self-contained: no external stylesheet/script/font/img requests (CSP-safe)", () => {
  for (const f of pages) {
    const h = read(f);
    assert.doesNotMatch(h, /<link[^>]+href="https?:\/\//i, `${f}: no external stylesheet`);
    assert.doesNotMatch(h, /<script[^>]+src=/i, `${f}: no external script src`);
    assert.doesNotMatch(h, /<img[^>]+src="https?:\/\//i, `${f}: no external image`);
    assert.doesNotMatch(h, /@import|url\(https?:/i, `${f}: no external css import`);
  }
});

test("theme + reduced-motion honored in CSS", () => {
  const h = read("index.html");
  assert.match(h, /prefers-color-scheme:dark/, "dark scheme");
  assert.match(h, /prefers-reduced-motion:reduce/, "reduced motion");
  assert.match(h, /@media print/, "print styles");
});

test("runbook pages are a guided walkthrough: ordered sections + prev/next + show-all", () => {
  for (const f of runbookPages) {
    const h = read(f);
    const secs = (h.match(/<section class="rb-section"/g) || []).length;
    assert.ok(secs >= 2, `${f}: ≥2 walkthrough sections`);
    // all sections after the first start hidden (one shown at a time)
    assert.equal((h.match(/<section class="rb-section"[^>]*\shidden>/g) || []).length, secs - 1, `${f}: only first section visible`);
    assert.match(h, /class="rb-prev"/, `${f}: Previous control`);
    assert.match(h, /class="rb-next"/, `${f}: Next control`);
    assert.match(h, /id="rb-showall"/, `${f}: Show-all toggle`);
    assert.match(h, /class="rb-secpos"[^>]*aria-live="polite"/, `${f}: live section indicator`);
    assert.match(h, /rb-sec:/, `${f}: persists walkthrough position`);
    // section headings are focus targets for keyboard/AT navigation
    assert.match(h, /<h2 id="[^"]+" tabindex="-1">/, `${f}: section heading focusable`);
    // print reveals hidden sections
    assert.match(h, /\.rb-section\[hidden\]\{display:block!important\}/, `${f}: print shows all sections`);
  }
});
