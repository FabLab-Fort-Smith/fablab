"""S4b-2: client protocol framing + EdgeRuntime.handle_scan composition (fakes for uplink/relay;
real store/audit/clock/crypto). Proves online-authoritative, offline-only-on-unreachable, fail-secure,
and no-PII."""

import base64
import json

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

from edge import (AuditLog, EdgeRuntime, EnvelopeStore, TimeSource, build_scan_msg,
                  canonical_bytes, cred_hash, new_boot_epoch, parse_result)

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
