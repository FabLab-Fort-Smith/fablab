// Link-A wire framing helpers for the broker shell (S2c-1 SEC review F1/F2) — pure + testable, so the
// DoS/lockout guards on the mTLS listener are unit-covered rather than living only in the socket glue.

/**
 * Newline-delimited line decoder with a hard buffer cap (CWE-400): a newline-less flood can't grow
 * memory unbounded — on overflow it signals the caller to drop the connection. push() returns the
 * complete lines parsed from this chunk (the trailing partial is retained for the next push).
 * @param {{maxLineBytes?:number}} [opts]
 */
export function makeLineDecoder({ maxLineBytes = 65536 } = {}) {
  let buf = "";
  return {
    push(chunk) {
      buf += chunk;
      const idx = buf.lastIndexOf("\n");
      if (idx < 0) {
        if (buf.length > maxLineBytes) { buf = ""; return { overflow: true, lines: [] }; } // no newline + too big
        return { overflow: false, lines: [] };
      }
      const complete = buf.slice(0, idx);
      buf = buf.slice(idx + 1); // trailing partial after the last newline
      const lines = complete.split("\n");
      if (buf.length > maxLineBytes) { buf = ""; return { overflow: true, lines }; } // partial already oversized
      return { overflow: false, lines };
    },
  };
}

/**
 * Bounded per-connection replay guard for scans (SEC review F2): dedups only when BOTH `requestId`
 * and `nonce` are present (a scan lacking them is NOT collapsed into one key that would drop every
 * later scan — that was a silent lockout); bounded set (rolling clear) so it can't grow unbounded.
 * Returns "ok" (first sight), "duplicate" (drop), or "no-nonce" (can't dedup — process anyway).
 * @param {{cap?:number}} [opts]
 */
export function makeReplayGuard({ cap = 4096 } = {}) {
  const seen = new Set();
  return {
    check(requestId, nonce) {
      if (requestId == null || nonce == null) return "no-nonce";
      const key = `${requestId}:${nonce}`;
      if (seen.has(key)) return "duplicate";
      if (seen.size >= cap) seen.clear(); // bound memory: start a fresh window
      seen.add(key);
      return "ok";
    },
  };
}

const BrokerFraming = { makeLineDecoder, makeReplayGuard };
export default BrokerFraming;
