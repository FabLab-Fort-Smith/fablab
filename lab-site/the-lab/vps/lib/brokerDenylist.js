// Broker-side edge revocation (S3b / F7). A CA-signed edge client cert is normally trusted on Link-A;
// this deny-list lets ops REVOKE a compromised edge by its cert CN WITHOUT re-issuing the CA (there's
// no CRL yet). The file (BROKER_EDGE_DENYLIST) holds CNs — a JSON array of strings, or newline-delimited
// (# comments allowed). It is re-read on mtime change so a revocation takes effect promptly (next
// connection), not only on broker restart.
//
// Fail-safe posture (deliberate, not fail-open-by-accident):
//   - No path configured, or file absent → empty list (no revocations). A missing deny-list means
//     "nothing revoked yet", NOT "deny everyone" — denying all edges on a missing file would be a
//     self-inflicted site outage.
//   - File exists but unreadable/malformed → KEEP the last good list (never suddenly allow a revoked
//     edge, never suddenly lock out the whole site) and log an error; on the FIRST-ever load error,
//     fall back to empty + log loudly. Either way the operator is alerted.

import fs from "fs";

/**
 * @param {object} deps
 * @param {string|null} deps.path  BROKER_EDGE_DENYLIST file path (null/absent → deny-list disabled).
 * @param {(event:string,fields?:object)=>void} [deps.log]
 * @param {(p:string)=>number|null} [deps.mtimeMs]  stat helper (null if absent) — injectable for tests.
 * @param {(p:string)=>string} [deps.readText]      read helper — injectable for tests.
 * @returns {{isDenied:(cn:string)=>boolean, size:()=>number}}
 */
export function makeEdgeDenylist({ path, log = () => {}, mtimeMs, readText } = {}) {
  const statMtime = mtimeMs || ((p) => { try { return fs.statSync(p).mtimeMs; } catch { return null; } });
  const read = readText || ((p) => fs.readFileSync(p, "utf8"));
  let denied = new Set();
  let loadedOnce = false;
  let lastMtime = null;

  function parse(text) {
    const t = String(text).trim();
    if (t.startsWith("[")) {
      const arr = JSON.parse(t); // throws on malformed → caller keeps last-good
      if (!Array.isArray(arr)) throw new Error("deny-list JSON is not an array");
      return new Set(arr.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim()));
    }
    // newline-delimited: skip blanks + # comments
    return new Set(
      t.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#")),
    );
  }

  function refresh() {
    if (!path) return; // disabled
    const m = statMtime(path);
    if (m === null) { // file absent → no revocations (not an error)
      if (loadedOnce && denied.size) log("denylist.file-missing", { note: "keeping last-good list" });
      else { denied = new Set(); loadedOnce = true; }
      return;
    }
    if (loadedOnce && m === lastMtime) return; // unchanged — cheap no-op
    try {
      denied = parse(read(path));
      lastMtime = m;
      loadedOnce = true;
      log("denylist.loaded", { count: denied.size });
    } catch (e) {
      // exists but broken: keep last-good (or empty on first-ever) + alert — never lock out the site.
      if (!loadedOnce) { denied = new Set(); loadedOnce = true; }
      // Advance lastMtime so a PERSISTENTLY-corrupt file is re-read once per mtime change, not on every
      // connection (S3b review F1, CWE-400). An operator fixing the file bumps mtime → we re-read.
      lastMtime = m;
      log("denylist.load-error", { reason: (e && e.message) || String(e), keeping: denied.size });
    }
  }

  return {
    isDenied(cn) {
      if (!path || !cn) return false;
      refresh(); // mtime-gated; cheap when unchanged
      return denied.has(cn);
    },
    size: () => denied.size,
  };
}

const BrokerDenylist = { makeEdgeDenylist };
export default BrokerDenylist;
