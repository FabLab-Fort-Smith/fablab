// Edge audit-batch signature verification (S6-b edge auth).
//
// Each edge holds a dedicated Ed25519 AUDIT-signing key and signs its store-and-forward audit batches
// (firmware `crypto.sign_audit_batch`). Before the cloud runs the fail-closed anchor check on a batch it
// verifies that signature against the edge's REGISTERED public key — so a relaying broker (or anyone with
// the internal bearer) cannot forge or suppress an edge's audit, and the edge's records are non-repudiable.
//
// Byte-parity with the edge: both sign/verify over `canonical({edgeId, records})` — the SAME recursive
// key-sorted, space-free JSON the edge produces via `canonical_bytes` (allowlistCrypto.canonical, §2 F3).
// This is fail-secure: any bad key / bad sig / malformed input returns false, NEVER a thrown grant.

import crypto from "crypto";

import { canonical } from "./allowlistCrypto.js";

/**
 * Verify an edge's detached Ed25519 signature over its audit batch.
 * @param {string} pubSpkiB64  the edge's registered public key (SPKI DER, base64)
 * @param {string} edgeId      the edge id the batch claims (bound into the signed bytes — anti-replay)
 * @param {Array}  records     the batch records (verified byte-for-byte via canonical)
 * @param {string} sigB64      the detached signature, base64
 * @returns {boolean} true iff the signature is valid for exactly these bytes under this key
 */
export function verifyEdgeBatchSig(pubSpkiB64, edgeId, records, sigB64) {
  try {
    if (typeof pubSpkiB64 !== "string" || typeof sigB64 !== "string" || typeof edgeId !== "string") return false;
    const key = crypto.createPublicKey({ key: Buffer.from(pubSpkiB64, "base64"), format: "der", type: "spki" });
    if (key.asymmetricKeyType !== "ed25519") return false; // reject a non-Ed25519 key rather than mis-verify
    const msg = Buffer.from(canonical({ edgeId, records }));
    return crypto.verify(null, msg, key, Buffer.from(sigB64, "base64"));
  } catch {
    return false; // any failure (bad key/sig/shape) denies — never raises into the caller
  }
}

const EdgeAuditSig = { verifyEdgeBatchSig };
export default EdgeAuditSig;
