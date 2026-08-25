"""S4b-2: client protocol framing + EdgeRuntime.handle_scan composition (fakes for uplink/relay;
real store/audit/clock/crypto). Proves online-authoritative, offline-only-on-unreachable, fail-secure,
and no-PII."""

import base64
import json

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import (Encoding, NoEncryption, PrivateFormat,
                                                          PublicFormat, load_der_public_key)

from edge import (AuditLog, EdgeRuntime, EnvelopeStore, TimeSource, build_audit_msg, build_scan_msg,
                  canonical_bytes, cred_hash, new_boot_epoch, parse_audit_ack, parse_result)

# ---- protocol --------------------------------------------------------------------------------
def test_build_scan_msg_shape():
    line = build_scan_msg(door_id="front", code="CODE", request_id="r1", nonce="n1")
    assert line.endswith("\n")
    m = json.loads(line)
    assert m == {"t": "scan", "doorId": "front", "cred": "CODE", "requestId": "r1", "nonce": "n1"}


def test_parse_result_ok_and_denied_and_garbage():
    ok = parse_result('{"t":"result","granted":true,"reason":"granted","requestId":"r1","nonce":"n1"}')
    assert ok == {"granted": True, "reason": "granted", "requestId": "r1", "nonce": "n1"}
    assert parse_result('{"t":"result","granted":false,"reason":"revoked"}')["granted"] is False
    assert parse_result('{"t":"pong"}') is None          # not a result
    assert parse_result("not json") is None
    assert parse_result('{"t":"result"}')["granted"] is False  # missing granted → deny-by-default


def test_parse_result_strict_boolean_grant(tmp_path=None):
    # F1: a truthy-but-non-boolean granted must NOT be a grant.
    for bad in ('{"t":"result","granted":"yes"}', '{"t":"result","granted":1}', '{"t":"result","granted":[1]}'):
        assert parse_result(bad)["granted"] is False
    # a non-string reason is dropped to None (not echoed)
    assert parse_result('{"t":"result","granted":true,"reason":42}')["reason"] is None


def test_boot_epoch_unique():
    assert new_boot_epoch() != new_boot_epoch() and len(new_boot_epoch()) == 32


# ---- composition -----------------------------------------------------------------------------
_SK = Ed25519PrivateKey.generate()
VK = base64.b64encode(_SK.public_key().public_bytes(Encoding.DER, PublicFormat.SubjectPublicKeyInfo)).decode()
EDGE_KEY = b"\x11" * 32


def _granting_envelope(door="front", code="CODEONE", version=1):
    payload = {"doorId": door, "version": version, "expiresAt": "2027-01-01T00:00:00.000Z",
               "tz": "UTC", "entryCount": 1,
               "entries": [{"credHash": cred_hash(EDGE_KEY, code), "windows": []}]}  # 24/7
    return {"payload": payload, "sig": base64.b64encode(_SK.sign(canonical_bytes(payload))).decode()}


class FakeUplink:
    def __init__(self, behavior):
        self.behavior = behavior  # dict result, None (unreachable), or an Exception to raise
        self.calls = 0

    def authorize(self, door_id, code):
        self.calls += 1
        if isinstance(self.behavior, Exception):
            raise self.behavior
        return self.behavior


class FakeRelay:
    def __init__(self, fail=False):
        self.pulses = 0
        self.fail = fail

    def pulse(self):
        if self.fail:
            raise RuntimeError("gpio")
        self.pulses += 1


def _runtime(tmp_path, uplink, relay=None, *, system_ms=1000, rtc_ok=True, seed_envelope=True):
    store = EnvelopeStore(str(tmp_path / "env"))
    if seed_envelope:
        assert store.put(_granting_envelope(), verify=lambda s: True)["stored"]
    clock = TimeSource(str(tmp_path / "floor"))
    audit = AuditLog(str(tmp_path / "audit.jsonl"), boot_epoch="b")
    logs = []
    rt = EdgeRuntime(
        door_id="front", verify_key_b64=VK, edge_index_key=EDGE_KEY,
        store=store, audit=audit, clock=clock, uplink=uplink, relay=relay or FakeRelay(),
        now_provider=lambda: (system_ms, rtc_ok), log=lambda e, f=None: logs.append((e, f)),
    )
    return rt, audit, logs


def test_online_grant_pulses_and_audits_online(tmp_path):
    relay = FakeRelay()
    rt, audit, _ = _runtime(tmp_path, FakeUplink({"granted": True, "reason": "granted"}), relay)
    d = rt.handle_scan("CODEONE")
    assert d == {"granted": True, "reason": "granted", "mode": "online"}
    assert relay.pulses == 1
    assert audit.pending()[-1]["event"] == {"doorId": "front", "granted": True, "reason": "granted", "mode": "online"}


def test_online_deny_is_authoritative_no_offline_retry(tmp_path):
    # the stored envelope WOULD grant offline, but an online DENY must stand — no pulse, no offline retry.
    relay = FakeRelay()
    up = FakeUplink({"granted": False, "reason": "revoked"})
    rt, audit, _ = _runtime(tmp_path, up, relay)
    d = rt.handle_scan("CODEONE")
    assert d == {"granted": False, "reason": "revoked", "mode": "online"}
    assert relay.pulses == 0 and up.calls == 1
    assert audit.pending()[-1]["event"]["mode"] == "online"


def test_offline_fallback_on_unreachable_grants_from_store(tmp_path):
    relay = FakeRelay()
    rt, _, _ = _runtime(tmp_path, FakeUplink(None), relay)   # broker unreachable
    d = rt.handle_scan("CODEONE")
    assert d["granted"] is True and d["mode"] == "offline" and relay.pulses == 1


def test_offline_fallback_on_uplink_exception(tmp_path):
    relay = FakeRelay()
    rt, _, _ = _runtime(tmp_path, FakeUplink(TimeoutError("net")), relay)
    d = rt.handle_scan("CODEONE")
    assert d["granted"] is True and d["mode"] == "offline" and relay.pulses == 1


def test_offline_wrong_code_denies(tmp_path):
    relay = FakeRelay()
    rt, _, _ = _runtime(tmp_path, FakeUplink(None), relay)
    d = rt.handle_scan("NOT-THE-CODE")
    assert d["granted"] is False and d["mode"] == "offline" and relay.pulses == 0


def test_offline_no_envelope_denies(tmp_path):
    relay = FakeRelay()
    rt, _, _ = _runtime(tmp_path, FakeUplink(None), relay, seed_envelope=False)
    d = rt.handle_scan("CODEONE")
    assert d == {"granted": False, "reason": "no-envelope", "mode": "offline"} and relay.pulses == 0


def test_offline_unsynced_clock_denies(tmp_path):
    relay = FakeRelay()
    rt, _, _ = _runtime(tmp_path, FakeUplink(None), relay, rtc_ok=False)  # no trustworthy clock
    d = rt.handle_scan("CODEONE")
    assert d["granted"] is False and relay.pulses == 0


def test_relay_failure_on_grant_is_logged_not_crashing(tmp_path):
    relay = FakeRelay(fail=True)
    rt, audit, logs = _runtime(tmp_path, FakeUplink({"granted": True, "reason": "granted"}), relay)
    d = rt.handle_scan("CODEONE")            # authz granted, actuation failed
    assert d["granted"] is True             # authz result stands
    assert any(e == "relay.error" for e, _ in logs)


def test_online_malformed_truthy_grant_denies(tmp_path):
    # F1: the runtime online branch must not grant on a truthy-non-boolean broker reply.
    for i, bad in enumerate(({"granted": "yes", "reason": "x"}, {"granted": 1, "reason": "x"}, {"granted": [1]})):
        relay = FakeRelay()
        rt, _, _ = _runtime(tmp_path / f"c{i}", FakeUplink(bad), relay)  # own dir per case
        d = rt.handle_scan("CODEONE")
        assert d["granted"] is False and d["mode"] == "online" and relay.pulses == 0


def test_nonfinite_audit_clock_does_not_drop_record(tmp_path):
    # F2: an inf clock must not raise (int(inf)) and drop the audit record.
    rt, audit, logs = _runtime(tmp_path, FakeUplink({"granted": True, "reason": "granted"}),
                               system_ms=float("inf"))
    d = rt.handle_scan("CODEONE")
    assert d["granted"] is True
    assert audit.pending()[-1]["ts"] == 0                 # recorded with a safe fallback ts
    assert not any(e == "audit.error" for e, _ in logs)   # not dropped


def test_code_never_audited_or_logged(tmp_path):
    rt, audit, logs = _runtime(tmp_path, FakeUplink({"granted": True, "reason": "granted"}))
    rt.handle_scan("SUPER-SECRET-CODE")
    blob = json.dumps(audit.pending()) + json.dumps(logs)
    assert "SUPER-SECRET-CODE" not in blob


# ---- audit flush protocol (S6-b-c2): build_audit_msg + parse_audit_ack ------------------------
_AUDIT_SK = Ed25519PrivateKey.generate()
AUDIT_PRIV_B64 = base64.b64encode(_AUDIT_SK.private_bytes(Encoding.DER, PrivateFormat.PKCS8, NoEncryption())).decode()
AUDIT_PUB_B64 = base64.b64encode(_AUDIT_SK.public_key().public_bytes(Encoding.DER, PublicFormat.SubjectPublicKeyInfo)).decode()
_EV = {"doorId": "front", "granted": True, "reason": "granted", "mode": "offline"}
RECS = [{"prev": "", "bootEpoch": "b", "seq": 0, "ts": 1000, "event": _EV, "hash": "H0"},
        {"prev": "H0", "bootEpoch": "b", "seq": 1, "ts": 1001, "event": _EV, "hash": "H1"}]


def test_build_audit_msg_shape_signature_and_no_edgeid():
    batch_id, line = build_audit_msg(edge_id="front-01", signing_key_b64=AUDIT_PRIV_B64, records=RECS)
    assert line.endswith("\n")
    m = json.loads(line)
    assert m["t"] == "audit" and "edgeId" not in m       # the broker attaches the cert-attested edgeId
    assert m["batchId"] == batch_id == "b:0-1"            # deterministic per (bootEpoch, seq-range)
    assert m["records"] == RECS
    # the signature verifies over canonical({edgeId, records}) — byte-parity with the cloud verify
    load_der_public_key(base64.b64decode(AUDIT_PUB_B64)).verify(
        base64.b64decode(m["signature"]), canonical_bytes({"edgeId": "front-01", "records": RECS}))


def test_build_audit_msg_binds_edgeid():
    _, a = build_audit_msg(edge_id="edge-a", signing_key_b64=AUDIT_PRIV_B64, records=RECS)
    _, b = build_audit_msg(edge_id="edge-b", signing_key_b64=AUDIT_PRIV_B64, records=RECS)
    assert json.loads(a)["signature"] != json.loads(b)["signature"]  # edgeId is inside the signed bytes


def test_parse_audit_ack_and_fail_secure_on_unknown_status():
    assert parse_audit_ack('{"t":"audit_ack","batchId":"b:0-1","status":"accepted"}') == {"batchId": "b:0-1", "status": "accepted"}
    assert parse_audit_ack('{"t":"audit_ack","status":"deferred"}') == {"batchId": None, "status": "deferred"}
    assert parse_audit_ack('{"t":"audit_ack","batchId":"x","status":"granted"}') is None   # unknown status → None (→ deferred)
    assert parse_audit_ack('{"t":"pong"}') is None
    assert parse_audit_ack("not json") is None


# ---- EdgeRuntime.flush_audit -----------------------------------------------------------------
class FakeAuditUplink:
    """Echoes the sent batchId in the ack (like the broker) with a configurable status; or returns None
    (unreachable) / a bad line / raises."""
    def __init__(self, status="accepted", *, raise_exc=None, ack_line=..., wrong_batch=False):
        self.status = status
        self.raise_exc = raise_exc
        self.ack_line = ack_line
        self.wrong_batch = wrong_batch
        self.sent = []

    def authorize(self, door_id, code):
        return None

    def send_audit(self, line):
        self.sent.append(line)
        if self.raise_exc:
            raise self.raise_exc
        if self.ack_line is not ...:
            return self.ack_line                 # None (unreachable) or a raw override
        bid = json.loads(line)["batchId"]
        if self.wrong_batch:
            bid = "MISMATCH"
        return json.dumps({"t": "audit_ack", "batchId": bid, "status": self.status})


def _flush_runtime(tmp_path, uplink, *, edge_id="front-01", key=AUDIT_PRIV_B64, n=2):
    store = EnvelopeStore(str(tmp_path / "env"))
    clock = TimeSource(str(tmp_path / "floor"))
    audit = AuditLog(str(tmp_path / "audit.jsonl"), boot_epoch="b")
    for i in range(n):
        audit.append({"doorId": "front", "granted": True, "reason": "granted", "mode": "offline"}, ts_ms=1000 + i)
    logs = []
    rt = EdgeRuntime(
        door_id="front", verify_key_b64=VK, edge_index_key=EDGE_KEY, store=store, audit=audit,
        clock=clock, uplink=uplink, relay=FakeRelay(), now_provider=lambda: (1000, True),
        edge_id=edge_id, audit_signing_key=key, log=lambda e, f=None: logs.append((e, f)),
    )
    return rt, audit, logs


def test_flush_accepted_advances_the_cursor(tmp_path):
    up = FakeAuditUplink("accepted")
    rt, audit, _ = _flush_runtime(tmp_path, up)
    assert len(audit.pending()) == 2
    assert rt.flush_audit() == {"flushed": 2, "status": "accepted"}
    assert audit.pending() == []                 # cursor advanced — durably recorded at the cloud anchor
    assert len(up.sent) == 1 and "front-01" not in up.sent[0]  # edgeId not in the msg (broker adds it)


def test_flush_deferred_and_rejected_keep_the_records(tmp_path):
    for status, expect_log in (("deferred", None), ("rejected", "audit.flush-rejected")):
        d = tmp_path / status
        rt, audit, logs = _flush_runtime(d, FakeAuditUplink(status))
        assert rt.flush_audit() == {"flushed": 0, "status": status}
        assert len(audit.pending()) == 2         # NEVER dropped
        if expect_log:
            assert any(e == expect_log for e, _ in logs)


def test_flush_unreachable_or_error_or_stale_ack_defers(tmp_path):
    # unreachable (send_audit → None), transport raise, garbage ack, and a mismatched batchId all → deferred
    for i, up in enumerate([
        FakeAuditUplink(ack_line=None),
        FakeAuditUplink(raise_exc=RuntimeError("socket")),
        FakeAuditUplink(ack_line="not-json"),
        FakeAuditUplink("accepted", wrong_batch=True),   # accepted but wrong batchId → do NOT advance
    ]):
        rt, audit, _ = _flush_runtime(tmp_path / f"u{i}", up)
        assert rt.flush_audit()["status"] == "deferred"
        assert len(audit.pending()) == 2


def test_flush_empty_is_a_noop(tmp_path):
    rt, _, _ = _flush_runtime(tmp_path, FakeAuditUplink("accepted"), n=0)
    assert rt.flush_audit() == {"flushed": 0, "status": "empty"}


def test_flush_unprovisioned_defers_and_never_sends(tmp_path):
    up = FakeAuditUplink("accepted")
    rt, audit, logs = _flush_runtime(tmp_path, up, key=None)  # no audit signing key
    assert rt.flush_audit() == {"flushed": 0, "status": "deferred"}
    assert up.sent == [] and len(audit.pending()) == 2
    assert any(e == "audit.flush-unprovisioned" for e, _ in logs)


def test_flush_never_leaks_the_scanned_code(tmp_path):
    up = FakeAuditUplink("accepted")
    rt, _, logs = _flush_runtime(tmp_path, up)
    rt.flush_audit()
    assert "SECRET" not in (json.dumps(up.sent) + json.dumps(logs))  # records carry no code anyway


def test_audit_ack_compare_and_set_is_a_noop_on_a_stale_base(tmp_path):
    # SEC #175 F1: ack(count, base) advances ONLY if the cursor still equals base — so a second
    # concurrent flush (stale base) can't ack records it didn't send.
    audit = AuditLog(str(tmp_path / "a.jsonl"), boot_epoch="b")
    for i in range(3):
        audit.append({"doorId": "front", "granted": True, "reason": "granted", "mode": "offline"}, ts_ms=i)
    base, recs = audit.snapshot_pending()
    assert base == 0 and len(recs) == 3
    assert audit.ack(2, base=0) == 2                 # first flush advances 0→2
    assert audit.ack(2, base=0) == 2                 # second flush, STALE base 0 → no-op (cursor stays 2)
    assert len(audit.pending()) == 1                 # the 3rd record is still pending, not dropped


def test_flush_accepted_survives_a_cursor_persist_failure(tmp_path):
    # SEC #175 F2: an ack() persist error must not crash the flush — the cloud already has the records.
    up = FakeAuditUplink("accepted")
    rt, audit, logs = _flush_runtime(tmp_path, up)

    def boom(*a, **k):
        raise OSError("disk full")
    audit.ack = boom
    assert rt.flush_audit() == {"flushed": 2, "status": "accepted"}   # reported accepted, did not raise
    assert any(e == "audit.ack-persist-error" for e, _ in logs)
