// Dev server for the runbook catalog — LOCAL/TAILNET only (never public). Hot-reloads: watches
// the source markdown + generator, rebuilds on change, and live-reloads open browsers over SSE.
// The live-reload client is injected AT SERVE TIME only, so the built dist/ stays production-clean.
// Binds 127.0.0.1 (+ the Tailscale IP if present) — never 0.0.0.0. Per @rules/topic-tailnet-dev-access.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, "dist");
const RUNBOOKS_DIR = path.resolve(__dirname, "..");
const PORT = Number(process.env.PORT || 8577);
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml" };

const clients = new Set();
const LIVERELOAD = `<script>(function(){try{var e=new EventSource("/__livereload");e.onmessage=function(m){if(m.data==="reload")location.reload();};}catch(_){}})();</script>`;

function build() {
  try {
    execFileSync(process.execPath, ["build.mjs"], { cwd: __dirname, stdio: "inherit" });
    return true;
  } catch {
    console.error("build failed — leaving previous dist/ in place");
    return false;
  }
}

let timer = null;
function scheduleRebuild(reason) {
  clearTimeout(timer);
  timer = setTimeout(() => {
    console.log(`change (${reason}) → rebuilding…`);
    if (build()) for (const res of clients) res.write("data: reload\n\n");
  }, 150);
}

build(); // initial

// Watch the source markdown + the generator; ignore generated output to avoid a rebuild loop.
try {
  fs.watch(RUNBOOKS_DIR, { recursive: true }, (_evt, file) => {
    if (!file) return;
    const f = String(file);
    if (f.includes(`site${path.sep}dist`) || f.includes("node_modules")) return;
    if (f.endsWith(".md") || f.endsWith("build.mjs")) scheduleRebuild(f);
  });
} catch {
  console.warn("recursive watch unavailable — hot reload disabled (build once).");
}

const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || "/").split("?")[0]);
  if (url === "/__livereload") {
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
    res.write("retry: 1000\n\n");
    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }
  const rel = url === "/" ? "index.html" : url.replace(/^\/+/, "");
  const file = path.join(DIST, rel);
  if (!path.resolve(file).startsWith(path.resolve(DIST))) {
    res.writeHead(403).end("forbidden");
    return;
  }
  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(404, { "content-type": "text/plain" }).end("not found");
      return;
    }
    const headers = {
      "content-type": TYPES[path.extname(file)] || "application/octet-stream",
      "content-security-policy": "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'",
      "x-content-type-options": "nosniff",
    };
    if (path.extname(file) === ".html") {
      res.writeHead(200, headers);
      res.end(buf.toString("utf8").replace("</body>", `${LIVERELOAD}</body>`));
    } else {
      res.writeHead(200, headers);
      res.end(buf);
    }
  });
});

function tailscaleIp() {
  try {
    return execSync("tailscale ip -4", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim().split("\n")[0] || null;
  } catch {
    return null;
  }
}

server.listen(PORT, "127.0.0.1", () => console.log(`runbooks (hot-reload): http://127.0.0.1:${PORT}`));
const ts = tailscaleIp();
if (ts) {
  const t = http.createServer(server.listeners("request")[0]);
  t.listen(PORT, ts, () => console.log(`runbooks (tailnet):    http://${ts}:${PORT}`));
}
