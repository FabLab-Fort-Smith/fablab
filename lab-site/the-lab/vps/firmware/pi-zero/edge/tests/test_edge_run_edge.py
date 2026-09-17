"""S4b-3 run_edge wiring — compose() builds the real cores from config, and run_loop() drives a scan
through the tested EdgeRuntime with injected fakes. Hardware-free, deterministic.

Asserts:
  - config load is fail-loud (missing key / missing referenced file → ConfigError);
  - a scan the broker GRANTS → relay.pulse() fires + an audit record is appended carrying NO PII
    (only {doorId,granted,reason,mode} — never the scanned code);
  - broker UNREACHABLE (uplink.authorize → None) falls to the rung-3 offline path and decides from the
    stored signed envelope (grant → pulse), using the real EnvelopeStore + decide_offline.
"""

import json
import os
import threading

import pytest

import run_edge
from edge.crypto import verify_envelope
from edge.relay import MockRelay
from nfc import MockReader
from ui import ConsoleUI

G = json.load(open(os.path.join(os.path.dirname(__file__), "goldens.json"), encoding="utf-8"))
NOW = 1_787_670_000_000  # 2026-08-25T15:00Z → inside the golden window (matches test_edge_core.NOW)
CODE = G["code"]         # "CODEONE"


class FakeUplink:
    """A fake Link-A uplink: `authorize` returns a preset answer (dict grant/deny, or None=unreachable)."""

    def __init__(self, answer):
        self._answer = answer
        self.connected = answer is not None
        self.audits = []

    def authorize(self, door_id, code):
        return self._answer

    def send_audit(self, line):
        self.audits.append(line)
        return None

    def connect(self):
        self.connected = self._answer is not None
        return self.connected

    def close(self):
        self.connected = False


def _write(path, text):
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)


def _make_cfg(tmp_path, *, door_id="front"):
    """Create the on-disk files load_config/compose need and return a config dict. mTLS cert files are
    stubs (the uplink is injected in these tests, so no real TLS is built); the index/verify keys are the
    real golden values so the offline decision path actually matches."""
    certs = tmp_path / "certs"
    state = tmp_path / "state"
    certs.mkdir()
    state.mkdir()
    for n in ("edge.crt", "edge.key", "ca.crt"):
        _write(str(certs / n), "stub")
    _write(str(certs / "edge.index.key"), G["edgeIndexKey_b64"] + "\n")
    _write(str(certs / "verify.b64"), G["verifyKey_spki_b64"] + "\n")
    return {
        "door_id": door_id,
        "edge_id": "edge-test-01",
        "broker": {"host": "127.0.0.1", "port": 8443},
        "paths": {
            "cert": str(certs / "edge.crt"),
            "key": str(certs / "edge.key"),
            "ca": str(certs / "ca.crt"),
            "edge_index_key": str(certs / "edge.index.key"),
            "verify_key": str(certs / "verify.b64"),
            "envelope_store": str(state / "envelopes"),
            "audit_log": str(state / "audit.jsonl"),
            "clock_floor": str(state / "clock_floor"),
        },
        "poll_interval_ms": 10,
        "flush_interval_ms": 60000,
        "debounce_s": 3,
    }


# --- fail-loud config ------------------------------------------------------------------------------
def test_load_config_missing_key_fails_loud(tmp_path):
    p = tmp_path / "config.json"
    _write(str(p), json.dumps({"door_id": "front"}))  # missing edge_id/broker/paths
    with pytest.raises(run_edge.ConfigError):
        run_edge.load_config(str(p))


def test_load_config_missing_file_fails_loud(tmp_path):
    cfg = _make_cfg(tmp_path)
    cfg["paths"]["cert"] = str(tmp_path / "does-not-exist.crt")
    p = tmp_path / "config.json"
    _write(str(p), json.dumps(cfg))
    with pytest.raises(run_edge.ConfigError):
        run_edge.load_config(str(p))


def test_load_config_ok(tmp_path):
    cfg = _make_cfg(tmp_path)
    p = tmp_path / "config.json"
    _write(str(p), json.dumps(cfg))
    loaded = run_edge.load_config(str(p))
    assert loaded["door_id"] == "front" and loaded["edge_id"] == "edge-test-01"


# --- online grant → pulse + no-PII audit -----------------------------------------------------------
def test_scan_grant_pulses_and_audits_no_pii(tmp_path):
    cfg = _make_cfg(tmp_path)
    relay = MockRelay()
    uplink = FakeUplink({"granted": True, "reason": "granted"})
    comps = run_edge.compose(
        cfg, reader=MockReader([CODE]), relay=relay, uplink=uplink, ui=ConsoleUI(),
        now_provider=lambda: (NOW, True), boot_epoch="testboot",
    )
    stop = threading.Event()
    run_edge.run_loop(comps, cfg, stop, watchdog=lambda *a: None, poll_once=True)

    assert relay.pulses == 1                       # a grant pulsed the strike
    pending = comps["audit"].pending()
    assert len(pending) == 1
    ev = pending[0]["event"]
    assert ev == {"doorId": "front", "granted": True, "reason": "granted", "mode": "online"}
    # the scanned code must never be persisted anywhere in the audit record
    assert CODE not in json.dumps(pending[0])


# --- broker unreachable → rung-3 offline decision from the stored envelope --------------------------
def test_offline_fallback_decides_from_store(tmp_path):
    cfg = _make_cfg(tmp_path)
    relay = MockRelay()
    uplink = FakeUplink(None)  # broker unreachable → offline fallback
    comps = run_edge.compose(
        cfg, reader=MockReader([CODE]), relay=relay, uplink=uplink, ui=ConsoleUI(),
        now_provider=lambda: (NOW, True), boot_epoch="testboot",
    )
    # Seed the rung-3 cache with the REAL golden signed envelope (verified on put).
    signed = {"payload": G["payload"], "sig": G["sig_b64"]}
    res = comps["store"].put(signed, verify=lambda s: verify_envelope(s, G["verifyKey_spki_b64"]))
    assert res["stored"] is True

    stop = threading.Event()
    run_edge.run_loop(comps, cfg, stop, watchdog=lambda *a: None, poll_once=True)

    assert relay.pulses == 1                       # offline grant pulsed the strike
    pending = comps["audit"].pending()
    assert pending and pending[0]["event"]["mode"] == "offline"
    assert pending[0]["event"]["granted"] is True
    assert CODE not in json.dumps(pending[0])


def test_offline_no_envelope_denies(tmp_path):
    cfg = _make_cfg(tmp_path)
    relay = MockRelay()
    comps = run_edge.compose(
        cfg, reader=MockReader([CODE]), relay=relay, uplink=FakeUplink(None), ui=ConsoleUI(),
        now_provider=lambda: (NOW, True), boot_epoch="testboot",
    )
    stop = threading.Event()
    run_edge.run_loop(comps, cfg, stop, watchdog=lambda *a: None, poll_once=True)
    assert relay.pulses == 0                       # no envelope → deny → fail-secure (no pulse)
    pending = comps["audit"].pending()
    assert pending and pending[0]["event"]["granted"] is False


def test_unsynced_clock_offline_denies(tmp_path):
    # An untrusted clock (rtc_ok=False) must LOCK the offline decision even with a valid envelope (F4).
    cfg = _make_cfg(tmp_path)
    relay = MockRelay()
    comps = run_edge.compose(
        cfg, reader=MockReader([CODE]), relay=relay, uplink=FakeUplink(None), ui=ConsoleUI(),
        now_provider=lambda: (NOW, False), boot_epoch="testboot",  # rtc_ok=False
    )
    signed = {"payload": G["payload"], "sig": G["sig_b64"]}
    comps["store"].put(signed, verify=lambda s: verify_envelope(s, G["verifyKey_spki_b64"]))
    stop = threading.Event()
    run_edge.run_loop(comps, cfg, stop, watchdog=lambda *a: None, poll_once=True)
    assert relay.pulses == 0                       # clock untrusted → locked


def test_sd_notify_no_socket_is_noop(monkeypatch):
    monkeypatch.delenv("NOTIFY_SOCKET", raising=False)
    run_edge.sd_notify("READY=1")  # must not raise off systemd


def test_ota_poll_is_noop():
    assert run_edge.ota_poll({}) is None
