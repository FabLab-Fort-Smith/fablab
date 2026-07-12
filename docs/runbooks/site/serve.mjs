// Serve the built runbook catalog for LOCAL/TAILNET viewing only (never public).
// Binds 127.0.0.1 (host tooling) and, if present, the Tailscale IP (tailnet devices) —
// per @rules/topic-tailnet-dev-access. Static files from ./dist; no external deps.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, "dist");
const PORT = Number(process.env.PORT || 8577);
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml" };

if (!fs.existsSync(path.join(DIST, "index.html"))) {
  console.error("dist/ not built — run `npm run build` first.");
  process.exit(1);
}

const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || "/").split("?")[0]);
  let rel = url === "/" ? "index.html" : url.replace(/^\/+/, "");
  const file = path.join(DIST, rel);
  // confine to DIST (no traversal)
  if (!path.resolve(file).startsWith(path.resolve(DIST))) {
    res.writeHead(403).end("forbidden");
    return;
  }
  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(404, { "content-type": "text/plain" }).end("not found");
      return;
    }
    res.writeHead(200, {
      "content-type": TYPES[path.extname(file)] || "application/octet-stream",
      // self-contained pages: lock everything to same-origin (defense in depth)
      "content-security-policy": "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'",
      "x-content-type-options": "nosniff",
    });
    res.end(buf);
  });
});

function tailscaleIp() {
  try {
    return execSync("tailscale ip -4", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim().split("\n")[0] || null;
  } catch {
    return null;
  }
}

// 127.0.0.1 always; add the tailnet IP if available (never 0.0.0.0 → never public).
server.listen(PORT, "127.0.0.1", () => console.log(`runbooks: http://127.0.0.1:${PORT}`));
const ts = tailscaleIp();
if (ts) {
  const t = http.createServer(server.listeners("request")[0]);
  t.listen(PORT, ts, () => console.log(`runbooks (tailnet): http://${ts}:${PORT}`));
}
