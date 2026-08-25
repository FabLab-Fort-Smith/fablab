"""S4b edge runtime cores: EnvelopeStore (atomic anti-rollback), AuditLog (hash-chain + store-and-
forward), TimeSource (monotonic clock floor). Filesystem-backed, no hardware."""

import base64
import json
import os

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

from edge import AuditLog, EnvelopeStore, TimeSource, canonical_bytes, verify_envelope

# ---- a local signer so store tests exercise the real verify path -----------------------------
_SK = Ed25519PrivateKey.generate()
VK = base64.b64encode(_SK.public_key().public_bytes(Encoding.DER, PublicFormat.SubjectPublicKeyInfo)).decode()


def _signed(door="front", version=1):
    payload = {"doorId": door, "version": version, "expiresAt": "2027-01-01T00:00:00.000Z",
               "tz": "UTC", "entryCount": 0, "entries": []}
    sig = base64.b64encode(_SK.sign(canonical_bytes(payload))).decode()
    return {"payload": payload, "sig": sig}


def _verify(signed):
    return verify_envelope(signed, VK)


# ---- EnvelopeStore ---------------------------------------------------------------------------
def test_store_put_get_and_high_water(tmp_path):
    s = EnvelopeStore(str(tmp_path))
    assert s.get("front") is None and s.high_water("front") == -1
    assert s.put(_signed(version=5), verify=_verify) == {"stored": True, "version": 5}
    assert s.high_water("front") == 5
    assert s.get("front")["payload"]["version"] == 5


def test_store_anti_rollback_rejects_older_or_equal(tmp_path):
    s = EnvelopeStore(str(tmp_path))
    s.put(_signed(version=5), verify=_verify)
    assert s.put(_signed(version=5), verify=_verify)["reason"] == "stale"   # equal
    assert s.put(_signed(version=4), verify=_verify)["reason"] == "stale"   # older
    assert s.put(_signed(version=6), verify=_verify) == {"stored": True, "version": 6}  # newer ok
    assert s.high_water("front") == 6


def test_store_rejects_forged_before_advancing(tmp_path):
    s = EnvelopeStore(str(tmp_path))
    s.put(_signed(version=5), verify=_verify)
    forged = _signed(version=9)
    forged["sig"] = base64.b64encode(b"\x00" * 64).decode()      # bad signature, higher version
    assert s.put(forged, verify=_verify)["reason"] == "bad-signature"
    assert s.high_water("front") == 5                             # NOT advanced by an unverified push


def test_store_rejects_bad_version_and_unsafe_door(tmp_path):
    s = EnvelopeStore(str(tmp_path))
    assert s.put(_signed(version="5"), verify=_verify)["reason"] == "bad-version"
    assert s.put(_signed(version=True), verify=_verify)["reason"] == "bad-version"
    bad = _signed(door="../etc/passwd", version=1)
    assert s.put(bad, verify=_verify)["stored"] is False          # path-unsafe doorId rejected


def test_store_corrupt_file_reads_as_no_envelope(tmp_path):
    s = EnvelopeStore(str(tmp_path))
    s.put(_signed(version=5), verify=_verify)
    with open(os.path.join(str(tmp_path), "front.json"), "w", encoding="utf-8") as f:
        f.write("{ corrupt")
    assert s.get("front") is None and s.high_water("front") == -1  # fail-secure


def test_store_survives_reopen(tmp_path):
    EnvelopeStore(str(tmp_path)).put(_signed(version=8), verify=_verify)
    assert EnvelopeStore(str(tmp_path)).high_water("front") == 8   # file-as-truth persists


# ---- AuditLog --------------------------------------------------------------------------------
def _ev(door="front", granted=True, reason="granted"):
    return {"doorId": door, "granted": granted, "reason": reason, "mode": "offline"}


def test_audit_chain_links_and_verifies(tmp_path):
    a = AuditLog(str(tmp_path / "audit.jsonl"), boot_epoch="boot-1")
    r0 = a.append(_ev(), ts_ms=1000)
    r1 = a.append(_ev(granted=False, reason="no-window"), ts_ms=1001)
    assert r0["prev"] == "" and r1["prev"] == r0["hash"] and r0["seq"] == 0 and r1["seq"] == 1
    assert a.verify_chain() is True


def test_audit_no_pii_in_records(tmp_path):
    a = AuditLog(str(tmp_path / "audit.jsonl"), boot_epoch="b")
    a.append(_ev(), ts_ms=1)
    assert set(a.pending()[0]["event"].keys()) == {"doorId", "granted", "reason", "mode"}


def test_audit_tamper_is_detected(tmp_path):
    p = tmp_path / "audit.jsonl"
    a = AuditLog(str(p), boot_epoch="b")
    a.append(_ev(), ts_ms=1)
    a.append(_ev(door="back"), ts_ms=2)
    # flip a granted flag in the persisted line, reload → chain must fail
    lines = p.read_text().splitlines()
    rec = json.loads(lines[0]); rec["event"]["granted"] = False
    lines[0] = json.dumps(rec, separators=(",", ":"))
    p.write_text("\n".join(lines) + "\n")
    assert AuditLog(str(p), boot_epoch="b").verify_chain() is False


def test_audit_reopen_continues_seq_per_boot_and_chain(tmp_path):
    p = str(tmp_path / "audit.jsonl")
    a = AuditLog(p, boot_epoch="boot-1")
    a.append(_ev(), ts_ms=1); a.append(_ev(), ts_ms=2)
    b = AuditLog(p, boot_epoch="boot-1")           # same boot → seq continues at 2
    assert b.append(_ev(), ts_ms=3)["seq"] == 2
    c = AuditLog(p, boot_epoch="boot-2")           # new boot → seq resets to 0, chain still links
    r = c.append(_ev(), ts_ms=4)
    assert r["seq"] == 0 and r["prev"] != "" and c.verify_chain() is True


def test_audit_store_and_forward_ack_cursor(tmp_path):
    p = str(tmp_path / "audit.jsonl")
    a = AuditLog(p, boot_epoch="b")
    for i in range(3):
        a.append(_ev(), ts_ms=i)
    assert len(a.pending()) == 3
    a.ack(2)
    assert len(a.pending()) == 1
    assert len(AuditLog(p, boot_epoch="b").pending()) == 1   # ack cursor persists across reopen


# ---- TimeSource (clock floor, F4) ------------------------------------------------------------
def test_clock_first_read_trusts_rtc_and_seeds_floor(tmp_path):
    ts = TimeSource(str(tmp_path / "floor"))
    now, synced = ts.trusted_now(1000)
    assert synced is True and now == 1000 and ts.floor == 1000


def test_clock_ratchets_forward(tmp_path):
    ts = TimeSource(str(tmp_path / "floor"))
    ts.trusted_now(1000)
    assert ts.trusted_now(2000) == (2000, True) and ts.floor == 2000


def test_clock_backwards_is_untrusted_and_floor_not_lowered(tmp_path):
    ts = TimeSource(str(tmp_path / "floor"))
    ts.trusted_now(5000)
    now, synced = ts.trusted_now(4000)          # clock jumped back
    assert synced is False and ts.floor == 5000  # floor held


def test_clock_no_rtc_or_bad_reading_is_untrusted(tmp_path):
    ts = TimeSource(str(tmp_path / "floor"))
    assert ts.trusted_now(1000, rtc_ok=False)[1] is False
    for bad in (float("nan"), float("inf"), None, "x", True):
        assert ts.trusted_now(bad)[1] is False


def test_clock_floor_persists_across_reopen(tmp_path):
    p = str(tmp_path / "floor")
    TimeSource(p).trusted_now(7000)
    ts2 = TimeSource(p)
    assert ts2.floor == 7000
    assert ts2.trusted_now(6000)[1] is False    # still rejects a backwards read after reboot
