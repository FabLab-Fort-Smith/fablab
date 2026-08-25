"""Edge → broker Link-A client protocol framing (S4b-2), pure + testable.

The edge is the mTLS CLIENT: it sends newline-delimited JSON `scan` messages and reads `result`
replies. Each scan carries a `requestId` + `nonce` so the broker's replay guard can dedupe (S2c-1).
The scanned `code` (Restricted/PII) travels only inside the scan message to the broker over mTLS — it
is never logged or persisted. `parse_result` is deny-by-default: any malformed/absent reply → deny.
"""

import json


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
