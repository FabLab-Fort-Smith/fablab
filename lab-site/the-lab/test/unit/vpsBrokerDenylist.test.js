// vps/lib/brokerDenylist.js (S3b / F7) — edge revocation deny-list: parsing, mtime-gated reload,
// and the fail-safe posture (missing/malformed file never locks out the site nor un-revokes).

import { makeEdgeDenylist } from "../../vps/lib/brokerDenylist.js";

// A controllable fake file: set .text + .mtime; mtimeMs returns null to simulate an absent file.
function fakeFile(initial) {
  const f = { text: initial, mtime: 1, reads: 0, missing: initial === undefined };
  return {
    f,
    mtimeMs: () => (f.missing ? null : f.mtime),
    readText: () => { f.reads += 1; return f.text; },
  };
}

test("no path → deny-list disabled, nothing denied", () => {
  const dl = makeEdgeDenylist({ path: null });
  expect(dl.isDenied("edge-1")).toBe(false);
});

test("JSON-array file: denies listed CNs only", () => {
  const { mtimeMs, readText } = fakeFile('["edge-bad","edge-worse"]');
  const dl = makeEdgeDenylist({ path: "/dl", mtimeMs, readText });
  expect(dl.isDenied("edge-bad")).toBe(true);
  expect(dl.isDenied("edge-ok")).toBe(false);
});

test("newline file: skips blanks and # comments", () => {
  const { mtimeMs, readText } = fakeFile("# revoked edges\nedge-bad\n\n  edge-worse  \n");
  const dl = makeEdgeDenylist({ path: "/dl", mtimeMs, readText });
  expect(dl.isDenied("edge-bad")).toBe(true);
  expect(dl.isDenied("edge-worse")).toBe(true);
  expect(dl.isDenied("# revoked edges")).toBe(false);
});

test("mtime-gated: re-reads on change, caches when unchanged", () => {
  const ff = fakeFile('["a"]');
  const dl = makeEdgeDenylist({ path: "/dl", mtimeMs: ff.mtimeMs, readText: ff.readText });
  expect(dl.isDenied("a")).toBe(true);
  expect(dl.isDenied("b")).toBe(false);
  const readsAfterFirst = ff.f.reads;
  dl.isDenied("a"); dl.isDenied("a");           // same mtime → no re-read
  expect(ff.f.reads).toBe(readsAfterFirst);
  ff.f.text = '["b"]'; ff.f.mtime = 2;           // ops edits the file → revoke b, un-revoke a
  expect(dl.isDenied("b")).toBe(true);
  expect(dl.isDenied("a")).toBe(false);
});

test("absent file → empty (no revocations), not a lockout", () => {
  const ff = fakeFile(undefined); // missing
  const dl = makeEdgeDenylist({ path: "/dl", mtimeMs: ff.mtimeMs, readText: ff.readText });
  expect(dl.isDenied("anyone")).toBe(false);
  expect(dl.size()).toBe(0);
});

test("first-ever load malformed → empty + logged (fail-safe, no lockout)", () => {
  const logs = [];
  const ff = fakeFile("[ broken json"); // starts with '[' → JSON path → parse throws
  const dl = makeEdgeDenylist({ path: "/dl", mtimeMs: ff.mtimeMs, readText: ff.readText, log: (e, f) => logs.push({ e, f }) });
  expect(dl.isDenied("anyone")).toBe(false); // didn't deny-all
  expect(logs.some((l) => l.e === "denylist.load-error")).toBe(true);
});

test("malformed AFTER a good load → keeps last-good (still revoked, still logs)", () => {
  const logs = [];
  const ff = fakeFile('["edge-bad"]');
  const dl = makeEdgeDenylist({ path: "/dl", mtimeMs: ff.mtimeMs, readText: ff.readText, log: (e, f) => logs.push({ e, f }) });
  expect(dl.isDenied("edge-bad")).toBe(true);
  ff.f.text = "[ corrupted"; ff.f.mtime = 2;     // file corrupted on next read
  expect(dl.isDenied("edge-bad")).toBe(true);     // last-good retained — revoked edge stays revoked
  expect(logs.some((l) => l.e === "denylist.load-error")).toBe(true);
});

test("file goes missing after a good load → keeps last-good", () => {
  const ff = fakeFile('["edge-bad"]');
  const dl = makeEdgeDenylist({ path: "/dl", mtimeMs: ff.mtimeMs, readText: ff.readText });
  expect(dl.isDenied("edge-bad")).toBe(true);
  ff.f.missing = true;                            // file deleted
  expect(dl.isDenied("edge-bad")).toBe(true);     // don't silently un-revoke
});
