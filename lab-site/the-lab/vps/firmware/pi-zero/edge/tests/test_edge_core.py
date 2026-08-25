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
                  generate_audit_keypair, in_window, sign_audit_batch, verify_envelope)
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


# ---- audit-batch signing (S6-b edge auth): byte-parity with the cloud verify (edgeAuditSig.js) --------
def test_sign_audit_batch_matches_js_golden():
    """Deterministic Ed25519 over identical canonical bytes → the exact signature the cloud test verifies."""
    a = G["auditSign"]
    assert sign_audit_batch(a["priv_pkcs8_b64"], a["edgeId"], a["records"]) == a["sig_b64"]


def test_sign_audit_batch_binds_edgeid_and_records():
    a = G["auditSign"]
    base = sign_audit_batch(a["priv_pkcs8_b64"], a["edgeId"], a["records"])
    # a different edgeId or any record change yields a different signature (anti-replay / anti-tamper)
    assert sign_audit_batch(a["priv_pkcs8_b64"], "other", a["records"]) != base
    mutated = json.loads(json.dumps(a["records"]))
    mutated[0]["event"]["granted"] = False
    assert sign_audit_batch(a["priv_pkcs8_b64"], a["edgeId"], mutated) != base


def test_provision_cli_writes_0600_private_and_prints_public(tmp_path, capsys):
    from edge.provision_audit_key import main
    out = tmp_path / "audit_key.b64"
    assert main(["--out", str(out), "--edge-id", "front-01"]) == 0
    assert (out.stat().st_mode & 0o777) == 0o600  # least-privilege private key file
    printed = capsys.readouterr().out
    assert "edgeId=front-01" in printed
    pub_b64 = [l.split("=", 1)[1] for l in printed.splitlines() if l.startswith("pubSpki=")][0]
    # the written private key pairs with the printed public key (a batch it signs verifies)
    from cryptography.hazmat.primitives.serialization import load_der_public_key
    priv_b64 = out.read_text().strip()
    sig = sign_audit_batch(priv_b64, "front-01", G["auditSign"]["records"])
    load_der_public_key(base64.b64decode(pub_b64)).verify(
        base64.b64decode(sig), canonical_bytes({"edgeId": "front-01", "records": G["auditSign"]["records"]}))
    # the private key is NEVER printed
    assert priv_b64 not in printed


def test_provision_cli_refuses_to_overwrite_without_force(tmp_path):
    from edge.provision_audit_key import main
    out = tmp_path / "audit_key.b64"
    assert main(["--out", str(out), "--edge-id", "e"]) == 0
    first = out.read_text()
    assert main(["--out", str(out), "--edge-id", "e"]) == 2  # refuses silent re-key
    assert out.read_text() == first  # untouched
    assert main(["--out", str(out), "--edge-id", "e", "--force"]) == 0  # deliberate reflash allowed
    assert out.read_text() != first  # a new key


def test_generate_audit_keypair_roundtrips_and_is_fresh():
    """A provisioned keypair signs a batch its own public key verifies; each call is distinct."""
    from cryptography.hazmat.primitives.serialization import load_der_public_key
    priv_b64, pub_b64 = generate_audit_keypair()
    recs = G["auditSign"]["records"]
    sig = sign_audit_batch(priv_b64, "front-01", recs)
    # the paired public key verifies the signature over the same canonical bytes
    pub = load_der_public_key(base64.b64decode(pub_b64))
    pub.verify(base64.b64decode(sig), canonical_bytes({"edgeId": "front-01", "records": recs}))  # no raise == ok
    # freshness: two provisions differ (CSPRNG keygen)
    assert generate_audit_keypair()[0] != generate_audit_keypair()[0]


def test_sign_audit_batch_refuses_non_ed25519_key():
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.hazmat.primitives.serialization import (Encoding, NoEncryption,
                                                              PrivateFormat)
    rsa_der = rsa.generate_private_key(public_exponent=65537, key_size=2048).private_bytes(
        Encoding.DER, PrivateFormat.PKCS8, NoEncryption())
    try:
        sign_audit_batch(base64.b64encode(rsa_der).decode(), "e", G["auditSign"]["records"])
        assert False, "expected TypeError"
    except TypeError:
        pass


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
