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
 * @param {{get:Function,set:Function}} anchorStore  per-edge anchor persistence
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
  const anchor = anchorStore.get(edgeId); // {bootEpoch,lastSeq,chainTip} | null

  let toApply = records;
  let duplicates = 0;

  if (anchor && anchor.bootEpoch === boot) {
    if (last.seq < anchor.lastSeq) {
      // the edge's reported tip is BELOW what the cloud anchored for this boot → tail-truncation/rollback
      alerts.push({ type: ALERT.TAIL_TRUNCATION, anchored: anchor.lastSeq, reported: last.seq });
      return { accepted: 0, duplicates: records.length, alerts };
    }
    if (last.seq === anchor.lastSeq) {
      return { accepted: 0, duplicates: records.length, alerts }; // a re-send of the current tip
    }
    toApply = records.filter((r) => r.seq > anchor.lastSeq);
    duplicates = records.length - toApply.length;
    const firstNew = toApply[0];
    if (firstNew.seq !== anchor.lastSeq + 1) {
      alerts.push({ type: ALERT.GAP, from: anchor.lastSeq, to: firstNew.seq });
    } else if (firstNew.prev !== anchor.chainTip) {
      // continues at the right seq but doesn't link to OUR anchored tip → the edge forked/rewrote history
      alerts.push({ type: ALERT.TAMPER, reason: "chain-fork", seq: firstNew.seq });
    }
  } else if (anchor && anchor.bootEpoch !== boot) {
    alerts.push({ type: ALERT.BOOT_TRANSITION, from: anchor.bootEpoch, to: boot });
    if (first.seq !== 0) alerts.push({ type: ALERT.GAP, from: -1, to: first.seq });
  } else if (first.seq !== 0) {
    alerts.push({ type: ALERT.GAP, from: -1, to: first.seq }); // first-ever batch should start at seq 0
  }

  anchorStore.set(edgeId, { bootEpoch: boot, lastSeq: last.seq, chainTip: last.hash });
  return { accepted: toApply.length, duplicates, alerts };
}

const AuditAnchor = { ALERT, recordHash, ingestAuditBatch };
export default AuditAnchor;
