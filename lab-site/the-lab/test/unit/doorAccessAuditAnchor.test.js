// Cloud audit anchor (S6-a): cross-language hash parity vs the Python edge (audit.py), plus the
// fail-closed ingest/dedup/gap/tail-truncation/fork/boot matrix. Anchor store is an in-memory fake
// holding the per-edge record { boots: { [bootEpoch]: {lastSeq, chainTip} }, currentBoot }.

import { ALERT, ingestAuditBatch, recordHash } from "@/plugins/door-access-controller/auditAnchor";

// Golden hashes produced by the real edge Python (edge/audit.py `_hash`) — locks JS↔Py byte-parity.
const PY_HASH0 = "a1a15de35d07e8329eb20495dc952de28555cff2efad9f70f66a2cf86cdeaf8c";
const PY_HASH1 = "a5661bf7cfdeb458a4b3034d819bf8767ac16295bde1105a76c68d06bc5b35b6";

const EV_GRANT = { doorId: "front", granted: true, reason: "granted", mode: "offline" };
const EV_DENY = { doorId: "front", granted: false, reason: "no-window", mode: "offline" };

function rec(prev, boot, seq, ts, event) {
  const r = { prev, bootEpoch: boot, seq, ts, event };
  r.hash = recordHash(r);
  return r;
}
function fakeAnchorStore() {
  const m = new Map();
  return { get: (id) => m.get(id) || null, set: (id, a) => m.set(id, a) };
}
const anchorOf = (s, edge, boot) => (s.get(edge)?.boots || {})[boot] || null;

test("record hash byte-matches the Python edge goldens (cross-language parity)", () => {
  const r0 = rec("", "boot-1", 0, 1000, EV_GRANT);
  const r1 = rec(r0.hash, "boot-1", 1, 1001, EV_DENY);
  expect(r0.hash).toBe(PY_HASH0);
  expect(r1.hash).toBe(PY_HASH1);
});

test("first-ever batch from genesis (seq 0, prev '') is accepted and anchored", () => {
  const s = fakeAnchorStore();
  const r0 = rec("", "b", 0, 1, EV_GRANT);
  const r1 = rec(r0.hash, "b", 1, 2, EV_DENY);
  const res = ingestAuditBatch(s, { edgeId: "e", records: [r0, r1] });
  expect(res).toEqual({ accepted: 2, duplicates: 0, alerts: [] });
  expect(anchorOf(s, "e", "b")).toEqual({ lastSeq: 1, chainTip: r1.hash });
});

test("first-ever batch NOT starting at genesis is held (bad-genesis), nothing anchored", () => {
  const s = fakeAnchorStore();
  const r2 = rec("", "b", 2, 3, EV_GRANT); // seq 2, no prior anchor
  const res = ingestAuditBatch(s, { edgeId: "e", records: [r2] });
  expect(res.accepted).toBe(0);
  expect(res.alerts.length).toBeGreaterThan(0);
  expect(s.get("e")).toBeNull();
});

test("continuation dedups the anchored prefix and accepts the new tail", () => {
  const s = fakeAnchorStore();
  const r0 = rec("", "b", 0, 1, EV_GRANT);
  const r1 = rec(r0.hash, "b", 1, 2, EV_DENY);
  const r2 = rec(r1.hash, "b", 2, 3, EV_GRANT);
  ingestAuditBatch(s, { edgeId: "e", records: [r0, r1] });
  const res = ingestAuditBatch(s, { edgeId: "e", records: [r1, r2] });
  expect(res).toMatchObject({ accepted: 1, duplicates: 1, alerts: [] });
  expect(anchorOf(s, "e", "b").lastSeq).toBe(2);
});

test("re-send of exactly the current tip (matching hash) is all-duplicate, no alert", () => {
  const s = fakeAnchorStore();
  const r0 = rec("", "b", 0, 1, EV_GRANT);
  ingestAuditBatch(s, { edgeId: "e", records: [r0] });
  expect(ingestAuditBatch(s, { edgeId: "e", records: [r0] })).toEqual({ accepted: 0, duplicates: 1, alerts: [] });
});

test("F6: same tip seq but a DIFFERENT (forged) hash → chain-fork alert, anchor untouched", () => {
  const s = fakeAnchorStore();
  const r0 = rec("", "b", 0, 1, EV_GRANT);
  ingestAuditBatch(s, { edgeId: "e", records: [r0] });
  const forged0 = rec("", "b", 0, 1, EV_DENY); // same seq 0, different content → different hash
  const res = ingestAuditBatch(s, { edgeId: "e", records: [forged0] });
  expect(res.alerts.some((a) => a.type === ALERT.TAMPER && a.reason === "chain-fork")).toBe(true);
  expect(res.accepted).toBe(0);
  expect(anchorOf(s, "e", "b").chainTip).toBe(r0.hash); // original tip retained
});

test("F2: a seq gap is HELD — alert + nothing accepted + anchor NOT advanced", () => {
  const s = fakeAnchorStore();
  const r0 = rec("", "b", 0, 1, EV_GRANT);
  ingestAuditBatch(s, { edgeId: "e", records: [r0] });
  const forgedFar = rec("ATTACKER", "b", 9, 9, EV_GRANT); // gap 0 -> 9, unverifiable
  const res = ingestAuditBatch(s, { edgeId: "e", records: [forgedFar] });
  expect(res.alerts.map((a) => a.type)).toContain(ALERT.GAP);
  expect(res.accepted).toBe(0);
  expect(anchorOf(s, "e", "b")).toEqual({ lastSeq: 0, chainTip: r0.hash }); // held, not advanced to 9
});

test("F1: chain-fork (contiguous seq, wrong prev) → NOT accepted, anchor NOT advanced", () => {
  const s = fakeAnchorStore();
  const r0 = rec("", "b", 0, 1, EV_GRANT);
  ingestAuditBatch(s, { edgeId: "e", records: [r0] });
  const forged1 = rec("DIFFERENT-PREV", "b", 1, 2, EV_DENY); // seq 1 but prev != anchored tip
  const res = ingestAuditBatch(s, { edgeId: "e", records: [forged1] });
  expect(res.alerts.some((a) => a.type === ALERT.TAMPER && a.reason === "chain-fork")).toBe(true);
  expect(res.accepted).toBe(0);
  expect(anchorOf(s, "e", "b")).toEqual({ lastSeq: 0, chainTip: r0.hash }); // NOT overwritten with forged tip
});

test("tail-truncation: reported tip below the anchor → alert, anchor held", () => {
  const s = fakeAnchorStore();
  const r0 = rec("", "b", 0, 1, EV_GRANT);
  const r1 = rec(r0.hash, "b", 1, 2, EV_DENY);
  const r2 = rec(r1.hash, "b", 2, 3, EV_GRANT);
  ingestAuditBatch(s, { edgeId: "e", records: [r0, r1, r2] });
  const res = ingestAuditBatch(s, { edgeId: "e", records: [r0, r1] });
  expect(res.alerts.map((a) => a.type)).toContain(ALERT.TAIL_TRUNCATION);
  expect(anchorOf(s, "e", "b").lastSeq).toBe(2);
});

test("bad record hash → tamper; broken link → tamper; mixed boot → tamper; none anchored", () => {
  const s = fakeAnchorStore();
  const bad = rec("", "b", 0, 1, EV_GRANT); bad.hash = "deadbeef";
  expect(ingestAuditBatch(s, { edgeId: "e", records: [bad] }).alerts[0]).toMatchObject({ type: ALERT.TAMPER, reason: "bad-hash" });
  const r0 = rec("", "b", 0, 1, EV_GRANT);
  const link = rec("not-r0", "b", 1, 2, EV_DENY);
  expect(ingestAuditBatch(s, { edgeId: "e", records: [r0, link] }).alerts.some((a) => a.reason === "broken-link")).toBe(true);
  const mb = rec(r0.hash, "OTHER", 1, 2, EV_DENY);
  expect(ingestAuditBatch(s, { edgeId: "e", records: [r0, mb] }).alerts.some((a) => a.reason === "mixed-boot")).toBe(true);
  expect(s.get("e")).toBeNull();
});

test("boot-transition (reflash) is flagged, accepted, and RETAINS the prior boot's anchor (F4)", () => {
  const s = fakeAnchorStore();
  const a0 = rec("", "boot-1", 0, 1, EV_GRANT);
  const a1 = rec(a0.hash, "boot-1", 1, 2, EV_DENY);
  ingestAuditBatch(s, { edgeId: "e", records: [a0, a1] }); // boot-1 anchored at seq 1
  const b0 = rec("", "boot-2", 0, 5, EV_GRANT);
  const res = ingestAuditBatch(s, { edgeId: "e", records: [b0] });
  expect(res.alerts.map((a) => a.type)).toContain(ALERT.BOOT_TRANSITION);
  expect(res.accepted).toBe(1);
  expect(anchorOf(s, "e", "boot-2")).toEqual({ lastSeq: 0, chainTip: b0.hash });
  expect(anchorOf(s, "e", "boot-1")).toEqual({ lastSeq: 1, chainTip: a1.hash }); // prior boot NOT wiped
});

test("F4b: replaying an OLD boot with a forged seq0 → tail-truncation vs the retained old-boot anchor", () => {
  const s = fakeAnchorStore();
  const a0 = rec("", "boot-1", 0, 1, EV_GRANT);
  const a1 = rec(a0.hash, "boot-1", 1, 2, EV_DENY);
  ingestAuditBatch(s, { edgeId: "e", records: [a0, a1] });      // boot-1 @ seq 1
  ingestAuditBatch(s, { edgeId: "e", records: [rec("", "boot-2", 0, 5, EV_GRANT)] }); // reflash
  const forgedOld = rec("", "boot-1", 0, 9, EV_GRANT);          // replay old boot, forged genesis
  const res = ingestAuditBatch(s, { edgeId: "e", records: [forgedOld] });
  expect(res.alerts.map((a) => a.type)).toContain(ALERT.TAIL_TRUNCATION); // 0 < anchored boot-1 lastSeq 1
  expect(anchorOf(s, "e", "boot-1").lastSeq).toBe(1);           // old-boot anchor NOT rolled back
});

test("empty / malformed batch is a no-op", () => {
  const s = fakeAnchorStore();
  expect(ingestAuditBatch(s, { edgeId: "e", records: [] })).toEqual({ accepted: 0, duplicates: 0, alerts: [] });
  expect(ingestAuditBatch(s, {})).toEqual({ accepted: 0, duplicates: 0, alerts: [] });
});
