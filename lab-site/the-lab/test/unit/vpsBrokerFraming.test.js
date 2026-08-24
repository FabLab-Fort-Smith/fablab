// vps/lib/brokerFraming.js — the Link-A DoS/lockout guards (SEC review F1/F2).

import { makeLineDecoder, makeReplayGuard } from "../../vps/lib/brokerFraming.js";

describe("makeLineDecoder (F1 — bounded buffer)", () => {
  test("splits newline-delimited lines, retains the trailing partial across pushes", () => {
    const d = makeLineDecoder({});
    expect(d.push('{"a":1}\n{"b":2}\n{"c"')).toEqual({ overflow: false, lines: ['{"a":1}', '{"b":2}'] });
    expect(d.push(":3}\n")).toEqual({ overflow: false, lines: ['{"c":3}'] });
  });
  test("a newline-less flood overflows (signal to drop the connection) instead of growing unbounded", () => {
    const d = makeLineDecoder({ maxLineBytes: 16 });
    const r = d.push("x".repeat(64)); // no newline, over the cap
    expect(r.overflow).toBe(true);
    expect(r.lines).toEqual([]);
  });
  test("a complete oversized line still delivers, and doesn't leave an oversized partial", () => {
    const d = makeLineDecoder({ maxLineBytes: 8 });
    const r = d.push("aaaaaaaaaaaa\nbbbb"); // long complete line + small partial
    expect(r.overflow).toBe(false);
    expect(r.lines).toEqual(["aaaaaaaaaaaa"]);
  });
});

describe("makeReplayGuard (F2 — dedup without lockout)", () => {
  test("dedups on (requestId,nonce) when both present", () => {
    const g = makeReplayGuard({});
    expect(g.check(1, "n1")).toBe("ok");
    expect(g.check(1, "n1")).toBe("duplicate");
    expect(g.check(2, "n1")).toBe("ok");
  });
  test("a scan MISSING requestId/nonce is NOT collapsed into one key (no silent lockout)", () => {
    const g = makeReplayGuard({});
    expect(g.check(undefined, undefined)).toBe("no-nonce");
    expect(g.check(undefined, undefined)).toBe("no-nonce"); // still processed, not dropped as a dup
    expect(g.check(5, undefined)).toBe("no-nonce");
  });
  test("the seen set is bounded (rolling clear) so it can't grow unbounded", () => {
    const g = makeReplayGuard({ cap: 3 });
    expect(g.check(1, "a")).toBe("ok");
    expect(g.check(2, "b")).toBe("ok");
    expect(g.check(3, "c")).toBe("ok"); // size hits cap
    expect(g.check(4, "d")).toBe("ok"); // triggers clear + add — no unbounded growth
    // after a clear, an earlier key is no longer "seen" (acceptable: bounded window; edge is the
    // authoritative anti-replay-pulse control per design §3a)
    expect(g.check(1, "a")).toBe("ok");
  });
});
