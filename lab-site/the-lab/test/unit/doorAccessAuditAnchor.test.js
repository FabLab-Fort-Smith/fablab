// Cloud audit anchor (S6-a): cross-language hash parity vs the Python edge (audit.py), plus the
// ingest/dedup/gap/tail-truncation/tamper matrix. Anchor store is an in-memory fake.

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
  return { get: (id) => m.get(id) || null, set: (id, a) => m.set(id, a), _m: m };
}


test("record hash byte-matches the Python edge goldens (cross-language parity)", () => {
  const r0 = rec("", "boot-1", 0, 1000, EV_GRANT);
  const r1 = rec(r0.hash, "boot-1", 1, 1001, EV_DENY);
  expect(r0.hash).toBe(PY_HASH0);
  expect(r1.hash).toBe(PY_HASH1);
});

test("first-ever batch from seq 0 is accepted and anchored", () => {
  const s = fakeAnchorStore();
  const r0 = rec("", "b", 0, 1, EV_GRANT);
  const r1 = rec(r0.hash, "b", 1, 2, EV_DENY);
  const res = ingestAuditBatch(s, { edgeId: "edge-1", records: [r0, r1] });
  expect(res).toEqual({ accepted: 2, duplicates: 0, alerts: [] });
  expect(s.get("edge-1")).toEqual({ bootEpoch: "b", lastSeq: 1, chainTip: r1.hash });
});

test("continuation dedups the already-anchored prefix and accepts the new tail", () => {
  const s = fakeAnchorStore();
  const r0 = rec("", "b", 0, 1, EV_GRANT);
  const r1 = rec(r0.hash, "b", 1, 2, EV_DENY);
  const r2 = rec(r1.hash, "b", 2, 3, EV_GRANT);
  ingestAuditBatch(s, { edgeId: "e", records: [r0, r1] });
  const res = ingestAuditBatch(s, { edgeId: "e", records: [r1, r2] }); // r1 already seen
  expect(res).toMatchObject({ accepted: 1, duplicates: 1, alerts: [] });
  expect(s.get("e").lastSeq).toBe(2);
});

test("a re-send of exactly the current tip is all-duplicate, no alert", () => {
  const s = fakeAnchorStore();
  const r0 = rec("", "b", 0, 1, EV_GRANT);
  ingestAuditBatch(s, { edgeId: "e", records: [r0] });
  expect(ingestAuditBatch(s, { edgeId: "e", records: [r0] })).toEqual({ accepted: 0, duplicates: 1, alerts: [] });
});

test("a seq gap raises GAP", () => {
  const s = fakeAnchorStore();
  const r0 = rec("", "b", 0, 1, EV_GRANT);
  ingestAuditBatch(s, { edgeId: "e", records: [r0] });
  const r2 = rec("whatever", "b", 2, 3, EV_GRANT); // seq jumps 0 -> 2
  const res = ingestAuditBatch(s, { edgeId: "e", records: [r2] });
  expect(res.alerts.map((a) => a.type)).toContain(ALERT.GAP);
});

test("tail-truncation: the edge's reported tip regresses below the anchor", () => {
  const s = fakeAnchorStore();
  const r0 = rec("", "b", 0, 1, EV_GRANT);
  const r1 = rec(r0.hash, "b", 1, 2, EV_DENY);
  const r2 = rec(r1.hash, "b", 2, 3, EV_GRANT);
  ingestAuditBatch(s, { edgeId: "e", records: [r0, r1, r2] }); // anchored at seq 2
  const res = ingestAuditBatch(s, { edgeId: "e", records: [r0, r1] }); // now reports only up to seq 1
  expect(res.alerts.map((a) => a.type)).toContain(ALERT.TAIL_TRUNCATION);
  expect(res.accepted).toBe(0);
  expect(s.get("e").lastSeq).toBe(2); // anchor NOT rolled back
});

test("chain fork: right seq but doesn't link to our anchored tip → tamper", () => {
  const s = fakeAnchorStore();
  const r0 = rec("", "b", 0, 1, EV_GRANT);
  ingestAuditBatch(s, { edgeId: "e", records: [r0] });
  // a forged seq-1 that is internally valid but whose prev != the anchored chainTip
  const forged = rec("DIFFERENT-PREV-HASH", "b", 1, 2, EV_DENY);
  const res = ingestAuditBatch(s, { edgeId: "e", records: [forged] });
  expect(res.alerts.some((a) => a.type === ALERT.TAMPER && a.reason === "chain-fork")).toBe(true);
});

test("bad record hash → tamper, nothing accepted", () => {
  const s = fakeAnchorStore();
  const r0 = rec("", "b", 0, 1, EV_GRANT);
  r0.hash = "deadbeef"; // corrupt
  const res = ingestAuditBatch(s, { edgeId: "e", records: [r0] });
  expect(res.alerts[0]).toMatchObject({ type: ALERT.TAMPER, reason: "bad-hash" });
  expect(res.accepted).toBe(0);
  expect(s.get("e")).toBeNull();
});

test("broken internal link → tamper", () => {
  const s = fakeAnchorStore();
  const r0 = rec("", "b", 0, 1, EV_GRANT);
  const r1 = rec("not-r0-hash", "b", 1, 2, EV_DENY); // valid hash of itself, but prev != r0.hash
  const res = ingestAuditBatch(s, { edgeId: "e", records: [r0, r1] });
  expect(res.alerts.some((a) => a.type === ALERT.TAMPER && a.reason === "broken-link")).toBe(true);
});

test("boot transition (reflash) is noted; seq resets to 0", () => {
  const s = fakeAnchorStore();
  const a0 = rec("", "boot-1", 0, 1, EV_GRANT);
  ingestAuditBatch(s, { edgeId: "e", records: [a0] });
  const b0 = rec("", "boot-2", 0, 5, EV_GRANT); // new boot, fresh chain
  const res = ingestAuditBatch(s, { edgeId: "e", records: [b0] });
  expect(res.alerts.map((a) => a.type)).toContain(ALERT.BOOT_TRANSITION);
  expect(res.accepted).toBe(1);
  expect(s.get("e")).toEqual({ bootEpoch: "boot-2", lastSeq: 0, chainTip: b0.hash });
});

test("mixed bootEpoch within a batch → tamper", () => {
  const s = fakeAnchorStore();
  const r0 = rec("", "b", 0, 1, EV_GRANT);
  const r1 = rec(r0.hash, "OTHER", 1, 2, EV_DENY);
  const res = ingestAuditBatch(s, { edgeId: "e", records: [r0, r1] });
  // r1.prev links to r0 (ok) but bootEpoch differs → mixed-boot tamper
  expect(res.alerts.some((a) => a.type === ALERT.TAMPER && a.reason === "mixed-boot")).toBe(true);
});

test("empty / malformed batch is a no-op", () => {
  const s = fakeAnchorStore();
  expect(ingestAuditBatch(s, { edgeId: "e", records: [] })).toEqual({ accepted: 0, duplicates: 0, alerts: [] });
  expect(ingestAuditBatch(s, {})).toEqual({ accepted: 0, duplicates: 0, alerts: [] });
});
