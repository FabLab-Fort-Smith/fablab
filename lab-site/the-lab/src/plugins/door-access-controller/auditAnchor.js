// Cloud audit anchor (S6-a) — the tamper-EVIDENT edge audit chain becomes tamper-DETECTABLE here.
//
// Edges hash-chain their offline decisions and store-and-forward them (S4b-a audit.py). A physically-
// present attacker can rewrite an edge's whole local chain or truncate its un-uploaded tail with no
// LOCAL gap. The cloud closes that by keeping a per-edge ANCHOR it controls — {bootEpoch, lastSeq,
// chainTip} — that the edge cannot rewrite. On ingest we recompute each record's hash with the SAME
// canonical+SHA-256 contract the edge used (cross-language byte-parity, §2 F3), verify internal linkage,
// then check continuity against the anchor: dedup already-seen (edgeId,bootEpoch,seq), and ALERT on a
// gap, a chain fork (rewrite), a tail-truncation (the edge's tip regressed), or a bad hash/link (tamper).
//
// Pure over an injected anchor store: { get(edgeId) -> anchor|null, set(edgeId, anchor) }.

import crypto from "crypto";

import { canonical } from "./allowlistCrypto.js";

export const ALERT = {
  GAP: "gap",
  TAMPER: "tamper",
  TAIL_TRUNCATION: "tail-truncation",
  BOOT_TRANSITION: "boot-transition",
};

/** Recompute a record's hash — MUST byte-match edge audit.py `_hash` (canonical of the same fields). */
export function recordHash(r) {
  return crypto
    .createHash("sha256")
    .update(canonical({ prev: r.prev, bootEpoch: r.bootEpoch, seq: r.seq, ts: r.ts, event: r.event }))
    .digest("hex");
}

/**
 * Ingest one store-and-forward batch for an edge (all records share one bootEpoch, seq-ascending).
 *
 * FAIL-CLOSED anchor discipline (S6-a review F1/F2/F6): the cloud advances the anchor ONLY to a tip that
 * (a) passed hash+link integrity, (b) is strictly forward of the anchored tip, AND (c) links to the
 * cloud-held `chainTip`. Any tamper, chain-fork, gap, or tail-truncation → alert, accept NOTHING, and
 * leave the trusted anchor UNCHANGED (never rewound, never advanced across the unverifiable).
 *
 * Per-boot retention (F4): anchors are kept per `(edgeId, bootEpoch)` so a legit reflash (new boot) does
 * not wipe a prior boot's final anchor, and a re-presented OLD boot is checked against ITS retained
 * anchor (closing the old-boot rollback). Distinguishing a genuine reflash from a spoofed new boot still
 * needs S6-b edge authentication (bootEpoch is edge-chosen) — BOOT_TRANSITION is a security-relevant
 * alert to correlate with an authorized reflash, not a benign event.
 *
 * @param {{get:Function,set:Function}} anchorStore  get(edgeId)->{boots:{[bootEpoch]:{lastSeq,chainTip}},currentBoot}|null ; set(edgeId, rec)
 * @param {{edgeId:string, records:Array}} batch
 * @returns {{accepted:number, duplicates:number, alerts:Array<{type:string}>}}
 */
export function ingestAuditBatch(anchorStore, { edgeId, records } = {}) {
  const alerts = [];
  if (!edgeId || !Array.isArray(records) || records.length === 0) {
    return { accepted: 0, duplicates: 0, alerts };
  }

  // 1) Internal integrity: every record's hash is correct and links to the previous (tamper-evident).
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    if (!r || typeof r !== "object" || recordHash(r) !== r.hash) {
      alerts.push({ type: ALERT.TAMPER, reason: "bad-hash", seq: r && r.seq });
      return { accepted: 0, duplicates: 0, alerts };
    }
    if (i > 0 && r.prev !== records[i - 1].hash) {
      alerts.push({ type: ALERT.TAMPER, reason: "broken-link", seq: r.seq });
      return { accepted: 0, duplicates: 0, alerts };
    }
  }
  const boot = records[0].bootEpoch;
  if (!records.every((r) => r.bootEpoch === boot)) {
    alerts.push({ type: ALERT.TAMPER, reason: "mixed-boot" });
    return { accepted: 0, duplicates: 0, alerts };
  }
  const first = records[0];
  const last = records[records.length - 1];
  const rec = anchorStore.get(edgeId) || { boots: {}, currentBoot: null };
  if (!rec.boots) rec.boots = {};
  const anchor = rec.boots[boot] || null; // {lastSeq, chainTip} for THIS boot | null

  const advance = () => {
    rec.boots[boot] = { lastSeq: last.seq, chainTip: last.hash };
    rec.currentBoot = boot;
    anchorStore.set(edgeId, rec);
  };

  if (anchor) {
    if (last.seq < anchor.lastSeq) { // reported tip below the anchored tip → rollback/tail-truncation
      alerts.push({ type: ALERT.TAIL_TRUNCATION, anchored: anchor.lastSeq, reported: last.seq });
      return { accepted: 0, duplicates: records.length, alerts };
    }
    if (last.seq === anchor.lastSeq) { // same tip seq — genuine re-send only if the hash matches (F6)
      if (last.hash !== anchor.chainTip) alerts.push({ type: ALERT.TAMPER, reason: "chain-fork", seq: last.seq });
      return { accepted: 0, duplicates: records.length, alerts };
    }
    const toApply = records.filter((r) => r.seq > anchor.lastSeq);
    const duplicates = records.length - toApply.length;
    const firstNew = toApply[0];
    if (firstNew.seq !== anchor.lastSeq + 1) { // gap → HOLD: never advance across the unverifiable (F2)
      alerts.push({ type: ALERT.GAP, from: anchor.lastSeq, to: firstNew.seq });
      return { accepted: 0, duplicates, alerts };
    }
    if (firstNew.prev !== anchor.chainTip) { // contiguous but doesn't link to OUR tip → fork/rewrite (F1)
      alerts.push({ type: ALERT.TAMPER, reason: "chain-fork", seq: firstNew.seq });
      return { accepted: 0, duplicates, alerts };
    }
    advance();
    return { accepted: toApply.length, duplicates, alerts };
  }

  // A bootEpoch not yet seen for this edge = a (claimed) reflash. Retain prior boots' anchors.
  if (rec.currentBoot && rec.currentBoot !== boot) {
    alerts.push({ type: ALERT.BOOT_TRANSITION, from: rec.currentBoot, to: boot });
  }
  if (first.seq !== 0 || first.prev !== "") { // a fresh boot MUST start at the genesis (seq 0, prev "")
    alerts.push({ type: first.seq !== 0 ? ALERT.GAP : ALERT.TAMPER, from: -1, to: first.seq, reason: "bad-genesis" });
    return { accepted: 0, duplicates: 0, alerts };
  }
  advance();
  return { accepted: records.length, duplicates: 0, alerts };
}

const AuditAnchor = { ALERT, recordHash, ingestAuditBatch };
export default AuditAnchor;
