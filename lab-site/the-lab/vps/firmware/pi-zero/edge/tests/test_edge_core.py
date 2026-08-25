"""S4a edge core: cross-language byte-parity (vs JS goldens) + the decide_offline fail-secure matrix.

The goldens in goldens.json are produced by the real cloud JS (allowlistCrypto/cardCrypto). The parity
tests lock canonical bytes / Ed25519 verify / credHash / index-key derivation to that JS output. The
behavioral tests sign envelopes locally (a throwaway Ed25519 key) to exercise every decide branch.
"""

import base64
import json
import os

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

from edge import (canonical_bytes, cred_hash, decide_offline, derive_index_key,
                  in_window, verify_envelope)
from edge.decide import REASON

G = json.load(open(os.path.join(os.path.dirname(__file__), "goldens.json"), encoding="utf-8"))


# ---- cross-language parity (vs JS) ------------------------------------------------------------
def test_canonical_matches_js_payload():
    assert canonical_bytes(G["payload"]).decode("utf-8") == G["canonical"]


def test_canonical_matches_js_probe_nested_unicode():
    # nested objects, out-of-order + unicode keys/values — the byte-match trap (§2 F3)
    assert canonical_bytes(G["probe"]).decode("utf-8") == G["probe_canonical"]


def test_verify_accepts_the_js_signed_envelope():
    signed = {"payload": G["payload"], "sig": G["sig_b64"]}
    assert verify_envelope(signed, G["verifyKey_spki_b64"]) is True


def test_verify_rejects_tamper_and_wrong_key():
    signed = {"payload": G["payload"], "sig": G["sig_b64"]}
    tampered = {"payload": {**G["payload"], "doorId": "back"}, "sig": G["sig_b64"]}
    assert verify_envelope(tampered, G["verifyKey_spki_b64"]) is False
    # a different (valid) key must not verify
    other = Ed25519PrivateKey.generate().public_key().public_bytes(Encoding.DER, PublicFormat.SubjectPublicKeyInfo)
    assert verify_envelope(signed, base64.b64encode(other).decode()) is False


def test_cred_hash_matches_js():
    key = base64.b64decode(G["edgeIndexKey_b64"])
    assert cred_hash(key, G["code"]) == G["credHash"]


def test_derive_index_key_matches_js_golden():
    assert base64.b64encode(derive_index_key("test-index-master-key", "edge-1")).decode() == G["edgeIndexKey_b64"]


# ---- decide_offline behavioral matrix (locally-signed envelopes) ------------------------------
VK_B64 = None
_SK = None


def _sign(payload):
    global _SK, VK_B64
    if _SK is None:
        _SK = Ed25519PrivateKey.generate()
        VK_B64 = base64.b64encode(
            _SK.public_key().public_bytes(Encoding.DER, PublicFormat.SubjectPublicKeyInfo)
        ).decode()
    sig = _SK.sign(canonical_bytes(payload))
    return {"payload": payload, "sig": base64.b64encode(sig).decode()}


EDGE_KEY = base64.b64decode(G["edgeIndexKey_b64"])
NOW = 1_787_670_000_000  # 2026-08-25T15:00:00Z → 10:00 CDT Tue (inside the window)


def _payload(**over):
    p = {
        "doorId": "front", "version": 7,
        "issuedAt": "2026-08-25T00:00:00.000Z", "expiresAt": "2026-08-26T00:00:00.000Z",
        "tz": "America/Chicago", "entryCount": 1,
        "entries": [{"credHash": cred_hash(EDGE_KEY, "CODEONE"),
                     "windows": [{"start": "08:00", "end": "18:00", "days": [1, 2, 3, 4, 5]}]}],
    }
    p.update(over)
    return p


def _decide(signed, **kw):
    base = dict(code="CODEONE", door_id="front", now_ms=NOW,
                verify_key_b64=VK_B64, edge_index_key=EDGE_KEY, hwm_version=-1)
    base.update(kw)
    return decide_offline(signed, **base)


def test_grant_inside_window():
    r = _decide(_sign(_payload()))
    assert r["granted"] is True and r["reason"] == REASON.GRANTED and r["version"] == 7


def test_grant_when_no_windows():
    p = _payload(entries=[{"credHash": cred_hash(EDGE_KEY, "CODEONE"), "windows": []}])
    assert _decide(_sign(p))["granted"] is True


def test_deny_outside_window_hours():
    # 2026-08-25T02:00:00Z = 2026-08-24 21:00 CDT (Mon) → outside 08:00–18:00
    r = _decide(_sign(_payload()), now_ms=1_787_623_200_000)  # 2026-08-25T02:00Z = Mon 21:00 CDT
    assert r["granted"] is False and r["reason"] == REASON.NO_WINDOW


def test_deny_outside_window_day_weekend():
    # 2026-08-23T15:00:00Z = 10:00 CDT Sunday → day 0 not in [1..5]
    r = _decide(_sign(_payload()), now_ms=1_787_497_200_000)  # 2026-08-23T15:00Z = Sun 10:00 CDT
    assert r["granted"] is False and r["reason"] == REASON.NO_WINDOW


def test_deny_bad_signature():
    s = _sign(_payload())
    s["sig"] = base64.b64encode(b"\x00" * 64).decode()
    assert _decide(s)["reason"] == REASON.BAD_SIGNATURE


def test_deny_door_mismatch():
    assert _decide(_sign(_payload()), door_id="back")["reason"] == REASON.DOOR_MISMATCH


def test_deny_anti_rollback():
    # version 7 not > high-water 7 → stale (replay of an old/current envelope)
    assert _decide(_sign(_payload()), hwm_version=7)["reason"] == REASON.STALE


def test_deny_missing_or_nonint_version():
    assert _decide(_sign(_payload(version="7")))["reason"] == REASON.STALE
    assert _decide(_sign(_payload(version=True)))["reason"] == REASON.STALE


def test_deny_expired():
    assert _decide(_sign(_payload()), now_ms=1_787_788_800_000)["reason"] == REASON.EXPIRED  # 2026-08-27 (after expiry)


def test_deny_missing_expiry():
    p = _payload()
    del p["expiresAt"]
    assert _decide(_sign(p))["reason"] == REASON.EXPIRED


def test_deny_unknown_credential():
    assert _decide(_sign(_payload()), code="NOTACARD")["reason"] == REASON.UNKNOWN_CREDENTIAL


def test_deny_clock_unsynced():
    # even a perfectly valid envelope is denied if the clock isn't trustworthy (F4)
    assert _decide(_sign(_payload()), time_synced=False)["reason"] == REASON.CLOCK_UNSYNCED


def test_deny_on_garbage_never_raises():
    assert decide_offline(None, code="x", door_id="front", now_ms=NOW,
                          verify_key_b64=VK_B64, edge_index_key=EDGE_KEY)["granted"] is False


def test_deny_nonfinite_or_nonnumeric_clock_never_grants():
    # Finding-A: a non-finite/typeless now_ms must NOT skip expiry on a 24/7 (no-window) entry.
    p = _payload(entries=[{"credHash": cred_hash(EDGE_KEY, "CODEONE"), "windows": []}],
                 expiresAt="2000-01-01T00:00:00.000Z")  # long expired
    for bad in (float("nan"), float("inf"), float("-inf"), None, "0", True):
        r = _decide(_sign(p), now_ms=bad)
        assert r["granted"] is False and r["reason"] == REASON.CLOCK_UNSYNCED


def _ms(iso):
    from datetime import datetime, timezone
    return int(datetime.fromisoformat(iso).replace(tzinfo=timezone.utc).timestamp() * 1000)


def test_overnight_window_wrap():
    # 22:00→06:00 window (end<=start = overnight wrap). Far-future expiry so only the window gates.
    p = _payload(expiresAt="2027-01-01T00:00:00.000Z",
                 entries=[{"credHash": cred_hash(EDGE_KEY, "CODEONE"),
                           "windows": [{"start": "22:00", "end": "06:00", "days": [1, 2, 3, 4, 5]}]}])
    s = _sign(p)
    # Mon 23:00 CDT = 2026-08-25T04:00Z → in (day in days, minutes >= 22:00)
    assert _decide(s, now_ms=_ms("2026-08-25T04:00:00"))["granted"] is True
    # Tue 02:00 CDT = 2026-08-25T07:00Z → in (prev day Mon in days, minutes < 06:00)
    assert _decide(s, now_ms=_ms("2026-08-25T07:00:00"))["granted"] is True
    # Sun 12:00 CDT = 2026-08-23T17:00Z → out (day 0 not in days, prev Sat not in days)
    assert _decide(s, now_ms=_ms("2026-08-23T17:00:00"))["reason"] == REASON.NO_WINDOW
