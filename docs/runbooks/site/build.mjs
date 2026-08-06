// Generate an interactive, accessible web catalog of the fablab runbooks from
// docs/runbooks/*.md. Source of truth stays the markdown — this only renders it.
// Output is self-contained (inline CSS/JS, no external requests → CSP-safe) so it works
// offline / over file:// and can be served tailnet-only. See ./README.md.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import MarkdownIt from "markdown-it";
import taskLists from "markdown-it-task-lists";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RUNBOOKS_DIR = path.resolve(__dirname, ".."); // docs/runbooks
const OUT_DIR = path.join(__dirname, "dist");
const SKIP = new Set(["README.md"]);

// Parse YAML front matter. Replaces gray-matter, which was dropped because it is unmaintained
// (4.0.3, 2019) and pinned js-yaml ^3, whose quadratic-CPU `!!omap` flaw (GHSA-5p4m-2wfm-xmqj /
// CVE-2026-59870) is NOT fixed in the 3.x line. gray-matter cannot be moved to js-yaml 4 either:
// it calls the removed `yaml.safeLoad` at import time. js-yaml 4's `load` is the safe loader (no
// arbitrary type construction), so this is also a small attack-surface reduction, not just a
// version bump.
const FRONT_MATTER = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;
function matter(raw) {
  const m = raw.match(FRONT_MATTER);
  if (!m) return { data: {}, content: raw };
  const data = yaml.load(m[1]) ?? {};
  // A scalar/array front matter block is malformed for our purposes; treat it as absent rather
  // than letting `data.title` blow up downstream (fail closed on the data, not the build).
  return {
    data: typeof data === "object" && !Array.isArray(data) ? data : {},
    content: raw.slice(m[0].length),
  };
}

// Category display order for the catalog; anything else falls under "Other".
const CATEGORY_ORDER = [
  "Provisioning & Setup",
  "Deploy & Release",
  "Incident & Recovery",
  "Data & Backup",
  "Operations",
  "Security",
  "Other",
];

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const slugify = (s) =>
  String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

function makeMd() {
  const md = new MarkdownIt({ html: false, linkify: true, typographer: false });
  md.use(taskLists, { enabled: true, label: true });

  // Stable heading ids (for the in-page table of contents).
  md.core.ruler.push("rb_heading_ids", (state) => {
    const seen = {};
    for (let i = 0; i < state.tokens.length; i++) {
      const t = state.tokens[i];
      if (t.type === "heading_open") {
        let id = slugify(state.tokens[i + 1].content) || "section";
        if (seen[id] != null) id = `${id}-${++seen[id]}`;
        else seen[id] = 0;
        t.attrSet("id", id);
      }
    }
  });

  // Tag DIRECT items of ORDERED lists (procedure steps) so we can make them checkable.
  md.core.ruler.push("rb_steps", (state) => {
    const stack = [];
    for (const tok of state.tokens) {
      if (tok.type === "ordered_list_open") stack.push("ol");
      else if (tok.type === "bullet_list_open") stack.push("ul");
      else if (tok.type === "ordered_list_close" || tok.type === "bullet_list_close") stack.pop();
      else if (tok.type === "list_item_open" && stack[stack.length - 1] === "ol") tok.attrJoin("class", "rb-step");
    }
  });

  const baseLi = md.renderer.rules.list_item_open || ((t, i, o, _e, s) => s.renderToken(t, i, o));
  md.renderer.rules.list_item_open = (t, i, o, e, s) => {
    let out = baseLi(t, i, o, e, s);
    if ((t[i].attrGet("class") || "").includes("rb-step")) out += '<input type="checkbox" class="rb-check" />';
    return out;
  };
  return md;
}

function tocFrom(html) {
  const items = [];
  const re = /<h2 id="([^"]+)">(.*?)<\/h2>/g;
  let m;
  while ((m = re.exec(html))) items.push({ id: m[1], text: m[2].replace(/<[^>]+>/g, "") });
  return items;
}

// Split the rendered body into ordered walkthrough sections at each <h2>. Content before the
// first h2 (if any) becomes an "Overview" section. Each section's h2 is made focusable (tabindex
// -1) so we can move focus to it on Next/Prev for screen-reader users.
function splitSections(html) {
  const parts = html.split(/(?=<h2 id=)/).filter((p) => p.trim());
  const out = [];
  for (const p of parts) {
    const m = p.match(/^<h2 id="([^"]+)">([\s\S]*?)<\/h2>/);
    if (m) {
      out.push({
        id: m[1],
        title: m[2].replace(/<[^>]+>/g, "").trim(),
        html: p.replace(/^<h2 id="([^"]+)">/, '<h2 id="$1" tabindex="-1">'),
      });
    } else {
      out.push({ id: "overview", title: "Overview", html: `<h2 id="overview" tabindex="-1">Overview</h2>${p}` });
    }
  }
  return out;
}

const CSS = `
:root{--bg:#fff;--fg:#1a1d24;--muted:#5a6270;--card:#f6f7f9;--border:#d9dde3;--accent:#1f6feb;--ok:#1a7f37;--chip:#eaeef3}
:root[data-theme=dark]{--bg:#0d1117;--fg:#e6edf3;--muted:#9aa4b2;--card:#161b22;--border:#30363d;--accent:#4c9aff;--ok:#3fb950;--chip:#21262d}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#0d1117;--fg:#e6edf3;--muted:#9aa4b2;--card:#161b22;--border:#30363d;--accent:#4c9aff;--ok:#3fb950;--chip:#21262d}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
a{color:var(--accent)}
.skip{position:absolute;left:-999px;top:0;background:var(--accent);color:#fff;padding:.5rem 1rem;z-index:10}
.skip:focus{left:0}
header.top{position:sticky;top:0;background:var(--bg);border-bottom:1px solid var(--border);padding:.75rem 1rem;z-index:5}
.top .row{display:flex;gap:1rem;align-items:center;flex-wrap:wrap;max-width:60rem;margin:0 auto}
.top a.home{font-weight:600;text-decoration:none}
.top .grow{flex:1}
button{font:inherit;background:var(--card);color:var(--fg);border:1px solid var(--border);border-radius:6px;padding:.35rem .7rem;cursor:pointer}
button:hover{border-color:var(--accent)}
progress{width:12rem;height:.8rem;max-width:40vw}
.wrap{max-width:60rem;margin:0 auto;padding:1rem}
main{padding-bottom:4rem}
h1{line-height:1.2}
.chip{display:inline-block;background:var(--chip);color:var(--muted);border:1px solid var(--border);border-radius:999px;padding:.1rem .6rem;font-size:.8rem}
.meta{color:var(--muted);margin:.25rem 0 1rem}
.toc{background:var(--card);border:1px solid var(--border);border-radius:8px;padding:.5rem 1rem;margin:1rem 0}
.toc summary{cursor:pointer;font-weight:600}
.toc ul{margin:.5rem 0 0;padding-left:1.2rem}
code{background:var(--chip);padding:.1rem .3rem;border-radius:4px}
pre{background:var(--card);border:1px solid var(--border);border-radius:8px;padding:.8rem;overflow:auto}
pre code{background:none;padding:0}
table{border-collapse:collapse;width:100%;overflow:auto;display:block}
th,td{border:1px solid var(--border);padding:.4rem .6rem;text-align:left}
blockquote{border-left:4px solid var(--border);margin:1rem 0;padding:.2rem 1rem;color:var(--muted)}
/* checkable items: numbered steps + task-list items */
ol li.rb-step{list-style:none;margin-left:-1.4rem;display:flex;gap:.6rem;align-items:flex-start}
ol li.rb-step>.rb-check{order:-1}
.rb-check,.task-list-item-checkbox{width:1.15rem;height:1.15rem;margin-top:.3rem;flex:0 0 auto;accent-color:var(--accent);cursor:pointer}
li:has(>.rb-check:checked),li.task-list-item:has(>*>.task-list-item-checkbox:checked),li.task-list-item:has(>.task-list-item-checkbox:checked){color:var(--muted)}
input:focus-visible,a:focus-visible,button:focus-visible,summary:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
.cat{margin:2rem 0 .5rem;padding-bottom:.3rem;border-bottom:2px solid var(--border)}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(17rem,1fr));gap:1rem}
.card{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:1rem;display:flex;flex-direction:column;gap:.4rem}
.card h3{margin:.1rem 0}
.card a{text-decoration:none}
.card .summary{color:var(--muted);font-size:.92rem;flex:1}
.card .prog{font-size:.82rem;color:var(--ok)}
.walk{display:flex;gap:.5rem;align-items:center}
.walk .rb-secpos{font-size:.88rem;color:var(--muted);min-width:9rem;text-align:center}
nav.walk.bottom{justify-content:space-between;margin-top:2rem;padding-top:1rem;border-top:1px solid var(--border)}
.rb-section{scroll-margin-top:4.5rem}
.rb-section h2[tabindex]:focus-visible{outline:3px solid var(--accent);outline-offset:3px}
button:disabled{opacity:.45;cursor:not-allowed}
[hidden]{display:none!important}
@media (prefers-reduced-motion:reduce){*{transition:none!important;scroll-behavior:auto!important}}
@media print{header.top,.skip,nav.walk,.toc summary::-webkit-details-marker{display:none!important}.rb-section[hidden]{display:block!important}.toc[open]{border:0}button{display:none}a[href]::after{content:""}}
`;

const themeBtn = `<button id="rb-theme" type="button" aria-label="Toggle light/dark theme">◐ Theme</button>`;

function shell({ title, bodyClass, dataAttrs, main }) {
  return `<!doctype html>
<html lang="en"${dataAttrs || ""}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · fablab runbooks</title>
<style>${CSS}</style>
</head>
<body class="${bodyClass}">
<a class="skip" href="#main">Skip to content</a>
${main}
</body>
</html>`;
}

function runbookPage(rb) {
  const toc = rb.toc.length
    ? `<details class="toc" open><summary>Jump to section</summary><nav aria-label="Sections"><ul>${rb.toc
        .map((t) => `<li><a href="#${t.id}">${esc(t.text)}</a></li>`)
        .join("")}</ul></nav></details>`
    : "";
  const sectionsHtml = rb.sections
    .map(
      (s, i) =>
        `<section class="rb-section" id="sec-${i}" aria-labelledby="${s.id}" data-title="${esc(s.title)}"${
          i > 0 ? " hidden" : ""
        }>${s.html}</section>`
    )
    .join("");
  const walkNav = (place) =>
    `<nav class="walk ${place}" aria-label="Walkthrough navigation">
    <button class="rb-prev" type="button">◀ Previous</button>
    <span class="rb-secpos"${place === "top" ? ' role="status" aria-live="polite"' : ' aria-hidden="true"'}></span>
    <button class="rb-next" type="button">Next ▶</button>
  </nav>`;
  const main = `
<header class="top"><div class="row">
  <a class="home" href="index.html">← All runbooks</a>
  <span class="grow"></span>
  ${walkNav("top")}
  <div class="controls">
    <button id="rb-showall" type="button" aria-pressed="false">Show all</button>
    <progress id="rb-meter" value="0" max="1" aria-label="Checklist progress"></progress>
    <span id="rb-progress" aria-hidden="true"></span>
    <button id="rb-reset" type="button">Reset</button>
    <button type="button" onclick="print()">Print</button>
    ${themeBtn}
  </div>
</div></header>
<div class="wrap">
  <span class="chip">${esc(rb.category)}</span> <span class="chip">${esc(rb.usage)}</span>
  <h1>${esc(rb.title)}</h1>
  ${rb.summary ? `<p class="meta">${esc(rb.summary)}</p>` : ""}
  <p class="meta">Guided walkthrough — one section at a time. Source: <code>docs/runbooks/${esc(
    rb.file
  )}</code> · progress &amp; position saved in your browser only.</p>
  ${toc}
  <div id="rb-live" role="status" aria-live="polite" class="skip"></div>
  <main id="main">${sectionsHtml}</main>
  ${walkNav("bottom")}
</div>
<script>${PAGE_JS}</script>`;
  return shell({ title: rb.title, bodyClass: "runbook", dataAttrs: "", main: `<div data-slug="${esc(rb.slug)}">${main}</div>` });
}

const PAGE_JS = `
(function(){
  var root=document.querySelector('[data-slug]'); var slug=root?root.dataset.slug:'rb'; var key='rb:'+slug; var seckey='rb-sec:'+slug;
  // ---- checklist (persist per runbook) ----
  var boxes=[].slice.call(document.querySelectorAll('.rb-check, input.task-list-item-checkbox'));
  boxes.forEach(function(b,i){ b.disabled=false; b.dataset.i=i; if(!b.getAttribute('aria-label')){var li=b.closest('li'); b.setAttribute('aria-label',(li&&li.textContent?li.textContent.trim().slice(0,90):'item '+(i+1)));}});
  var saved={}; try{saved=JSON.parse(localStorage.getItem(key)||'{}')}catch(e){}
  boxes.forEach(function(b){ if(saved[b.dataset.i]) b.checked=true; });
  var prog=document.getElementById('rb-progress'),meter=document.getElementById('rb-meter'),live=document.getElementById('rb-live');
  function upd(say){var d=boxes.filter(function(b){return b.checked}).length,t=boxes.length; if(meter){meter.max=t||1;meter.value=d;} if(prog)prog.textContent=t?(d+' / '+t+' done'):''; if(say&&live)live.textContent=d+' of '+t+' steps complete';}
  boxes.forEach(function(b){b.addEventListener('change',function(){saved[b.dataset.i]=b.checked;try{localStorage.setItem(key,JSON.stringify(saved))}catch(e){}upd(true);});});
  var r=document.getElementById('rb-reset'); if(r)r.addEventListener('click',function(){boxes.forEach(function(b){b.checked=false});saved={};try{localStorage.removeItem(key)}catch(e){}upd(true);});
  upd(false);
  // ---- guided walkthrough (one section at a time; Prev/Next; position persisted) ----
  var secs=[].slice.call(document.querySelectorAll('.rb-section'));
  var prevBtns=[].slice.call(document.querySelectorAll('.rb-prev'));
  var nextBtns=[].slice.call(document.querySelectorAll('.rb-next'));
  var posEls=[].slice.call(document.querySelectorAll('.rb-secpos'));
  var showAllBtn=document.getElementById('rb-showall');
  var cur=0, showAll=false;
  try{var v=parseInt(localStorage.getItem(seckey)||'0',10); if(v>=0&&v<secs.length)cur=v;}catch(e){}
  function paint(focus){
    if(showAll){ secs.forEach(function(s){s.hidden=false;}); prevBtns.concat(nextBtns).forEach(function(b){b.disabled=true;}); posEls.forEach(function(e){e.textContent='All sections';}); return; }
    secs.forEach(function(s,i){ s.hidden=(i!==cur); });
    prevBtns.forEach(function(b){b.disabled=cur<=0;}); nextBtns.forEach(function(b){b.disabled=cur>=secs.length-1;});
    var title=secs[cur]?secs[cur].getAttribute('data-title'):''; var label=secs.length?('Section '+(cur+1)+' of '+secs.length+(title?' — '+title:'')):'';
    posEls.forEach(function(e){e.textContent=label;});
    try{localStorage.setItem(seckey,String(cur));}catch(e){}
    if(focus&&secs[cur]){ var h=secs[cur].querySelector('h2'); if(h){try{h.focus();}catch(e){}} secs[cur].scrollIntoView({block:'start'}); }
  }
  function go(d){ if(showAll)return; var n=cur+d; if(n<0||n>=secs.length)return; cur=n; paint(true); }
  prevBtns.forEach(function(b){b.addEventListener('click',function(){go(-1);});});
  nextBtns.forEach(function(b){b.addEventListener('click',function(){go(1);});});
  if(showAllBtn)showAllBtn.addEventListener('click',function(){ showAll=!showAll; showAllBtn.setAttribute('aria-pressed',String(showAll)); showAllBtn.textContent=showAll?'Guided':'Show all'; paint(false); });
  document.addEventListener('keydown',function(e){ if(e.altKey||e.ctrlKey||e.metaKey)return; var tag=e.target&&e.target.tagName; if(tag&&/INPUT|TEXTAREA|SELECT|SUMMARY/.test(tag))return; if(e.key==='ArrowRight'){go(1);} else if(e.key==='ArrowLeft'){go(-1);} });
  [].slice.call(document.querySelectorAll('.toc a[href^="#"]')).forEach(function(a){ a.addEventListener('click',function(e){ if(showAll)return; var id=a.getAttribute('href').slice(1); var t=-1; secs.forEach(function(s,i){ if(s.getAttribute('aria-labelledby')===id)t=i; }); if(t>=0){ e.preventDefault(); cur=t; paint(true); } }); });
  window.addEventListener('beforeprint',function(){ secs.forEach(function(s){s.hidden=false;}); });
  window.addEventListener('afterprint',function(){ if(!showAll) paint(false); });
  paint(false);
  ${THEME_JS()}
})();`;

function THEME_JS() {
  return `
  var tt=document.getElementById('rb-theme');
  try{var s=localStorage.getItem('rb-theme'); if(s)document.documentElement.setAttribute('data-theme',s);}catch(e){}
  if(tt)tt.addEventListener('click',function(){var c=document.documentElement.getAttribute('data-theme');var n=c==='dark'?'light':(c==='light'?'dark':(matchMedia('(prefers-color-scheme: dark)').matches?'light':'dark'));document.documentElement.setAttribute('data-theme',n);try{localStorage.setItem('rb-theme',n)}catch(e){}});`;
}

function indexPage(runbooks) {
  const byCat = {};
  for (const rb of runbooks) (byCat[rb.category] ||= []).push(rb);
  const cats = Object.keys(byCat).sort((a, b) => {
    const ia = CATEGORY_ORDER.indexOf(a), ib = CATEGORY_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });
  const sections = cats
    .map((cat) => {
      const cards = byCat[cat]
        .sort((a, b) => (a.order ?? 500) - (b.order ?? 500) || a.title.localeCompare(b.title))
        .map(
          (rb) => `<article class="card" data-slug="${esc(rb.slug)}" data-total="${rb.total}">
        <span class="chip">${esc(rb.usage)}</span>
        <h3><a href="${esc(rb.slug)}.html">${esc(rb.title)}</a></h3>
        <p class="summary">${esc(rb.summary || "")}</p>
        <p class="prog" data-slug="${esc(rb.slug)}">${rb.total} steps</p>
      </article>`
        )
        .join("");
      return `<h2 class="cat">${esc(cat)}</h2><div class="cards">${cards}</div>`;
    })
    .join("");
  const main = `
<header class="top"><div class="row">
  <a class="home" href="index.html">fablab runbooks</a>
  <span class="grow"></span>
  <div class="controls">${themeBtn}</div>
</div></header>
<div class="wrap">
  <h1>Runbook catalog</h1>
  <p class="meta">Interactive, standardized checklists generated from <code>docs/runbooks/*.md</code>.
  Grouped by category &amp; usage. Progress on each runbook is saved in your browser.</p>
  <main id="main">${sections}</main>
</div>
<script>${INDEX_JS}</script>`;
  return shell({ title: "Catalog", bodyClass: "index", dataAttrs: "", main });
}

const INDEX_JS = `
(function(){
  try{var s=localStorage.getItem('rb-theme'); if(s)document.documentElement.setAttribute('data-theme',s);}catch(e){}
  [].slice.call(document.querySelectorAll('.card')).forEach(function(c){
    var slug=c.dataset.slug,total=parseInt(c.dataset.total||'0',10),p=c.querySelector('.prog');
    var d=0; try{var o=JSON.parse(localStorage.getItem('rb:'+slug)||'{}'); d=Object.keys(o).filter(function(k){return o[k]}).length;}catch(e){}
    if(p) p.textContent = total? (d>0? (d+' / '+total+' done') : (total+' steps')) : '';
  });
  ${THEME_JS()}
})();`;

function main() {
  const files = fs.readdirSync(RUNBOOKS_DIR).filter((f) => f.endsWith(".md") && !SKIP.has(f));
  const md = makeMd();
  const runbooks = [];
  for (const file of files.sort()) {
    const raw = fs.readFileSync(path.join(RUNBOOKS_DIR, file), "utf8");
    const { data, content } = matter(raw);
    const h1 = (content.match(/^#\s+(.+)$/m) || [])[1];
    const title = data.title || (h1 ? h1.replace(/^Runbook:\s*/i, "") : file.replace(/\.md$/, ""));
    // Drop the leading markdown H1 — the page template already renders the title as the single <h1>.
    const body = content.replace(/^#[ \t]+.+\r?\n?/m, "");
    const bodyHtml = md.render(body);
    const total = (bodyHtml.match(/class="rb-check"|task-list-item-checkbox/g) || []).length;
    runbooks.push({
      file,
      slug: slugify(file.replace(/\.md$/, "")),
      title,
      category: data.category || "Other",
      usage: data.usage || "as needed",
      summary: data.summary || "",
      order: data.order,
      bodyHtml,
      toc: tocFrom(bodyHtml),
      sections: splitSections(bodyHtml),
      total,
    });
  }
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const rb of runbooks) fs.writeFileSync(path.join(OUT_DIR, `${rb.slug}.html`), runbookPage(rb));
  fs.writeFileSync(path.join(OUT_DIR, "index.html"), indexPage(runbooks));
  console.log(`built ${runbooks.length} runbook(s) + index → ${path.relative(process.cwd(), OUT_DIR)}`);
  for (const rb of runbooks) console.log(`  • ${rb.category} / ${rb.title} (${rb.total} steps)`);
}

main();
