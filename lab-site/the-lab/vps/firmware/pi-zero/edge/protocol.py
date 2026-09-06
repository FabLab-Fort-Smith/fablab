"""Edge → broker Link-A client protocol framing (S4b-2), pure + testable.

The edge is the mTLS CLIENT: it sends newline-delimited JSON `scan` messages and reads `result`
replies. Each scan carries a `requestId` + `nonce` so the broker's replay guard can dedupe (S2c-1).
The scanned `code` (Restricted/PII) travels only inside the scan message to the broker over mTLS — it
is never logged or persisted. `parse_result` is deny-by-default: any malformed/absent reply → deny.
"""

import json

from .crypto import sign_audit_batch


def build_audit_msg(*, edge_id, signing_key_b64, records):
    """Build one newline-terminated `audit` line: the edge-SIGNED store-and-forward batch (S6-b-c2).

    `edgeId` is deliberately NOT in the message — the broker attaches its cert-attested id (a client
    can't relay under another edge's id). It IS bound into the signature (`canonical({edgeId,records})`),
    so the cloud rejects a mismatch on verify. Returns `(batch_id, line)`: the caller keeps `batch_id` to
    match the broker's `audit_ack` before advancing its ack cursor.

    @param records  a NON-EMPTY list sharing one bootEpoch, seq-ascending (from `AuditLog.pending()`).
    """
    batch_id = f"{records[0]['bootEpoch']}:{records[0]['seq']}-{records[-1]['seq']}"  # deterministic per window (idempotent)
    signature = sign_audit_batch(signing_key_b64, edge_id, records)
    line = json.dumps(
        {"t": "audit", "batchId": batch_id, "records": records, "signature": signature},
        separators=(",", ":"), ensure_ascii=False,
    ) + "\n"
    return batch_id, line


def parse_audit_ack(line):
    """Parse a broker `audit_ack` reply → {"batchId":str|None, "status":str}, or None if unusable.

    Fail-secure: an unknown/absent status (not one of accepted|deferred|rejected) → None, which the caller
    treats as `deferred` (never advances the ack cursor). The caller additionally requires the batchId to
    match the batch it sent before honoring an `accepted`.
    """
    try:
        m = json.loads(line)
    except (ValueError, TypeError):
        return None
    if not isinstance(m, dict) or m.get("t") != "audit_ack":
        return None
    status = m.get("status")
    if status not in ("accepted", "deferred", "rejected"):
        return None
    return {"batchId": m.get("batchId") if isinstance(m.get("batchId"), str) else None, "status": status}


def build_scan_msg(*, door_id, code, request_id, nonce):
    """One newline-terminated scan line for the broker. code is PII — never log this string."""
    return json.dumps(
        {"t": "scan", "doorId": door_id, "cred": code, "requestId": request_id, "nonce": nonce},
        separators=(",", ":"), ensure_ascii=False,
    ) + "\n"


def parse_result(line):
    """Parse a broker `result` reply → {"granted":bool, "reason":str}, or None if it's not a usable
    result (caller treats None as 'no answer' → offline fallback). Deny-by-default on a malformed grant.
    """
    try:
        m = json.loads(line)
    except (ValueError, TypeError):
        return None
    if not isinstance(m, dict) or m.get("t") != "result":
        return None
    # STRICT boolean: a truthy-but-non-boolean granted (e.g. "yes"/1/[1]) must NOT become a grant —
    # deny-by-default on a malformed shape (mirrors the broker's typeof-boolean check). Also surface
    # requestId/nonce so the S4b-3 uplink adapter can correlate the reply to the scan it sent.
    return {
        "granted": m.get("granted") is True,
        "reason": m.get("reason") if isinstance(m.get("reason"), str) else None,
        "requestId": m.get("requestId"),
        "nonce": m.get("nonce"),
    }
