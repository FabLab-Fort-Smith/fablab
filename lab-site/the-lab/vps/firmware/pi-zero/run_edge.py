"""Edge node entry point (S4b-3) — wire the tested cores + hardware/transport adapters into a runnable
door and drive the fail-secure supervisor loop.

This is the imperative shell (door-controller-wifi.md §7 "edge node"): it loads `config.json` (fail-loud),
resolves the mTLS + key material by file path, constructs the S4a/S4b-a/S4b-2 cores
(`EnvelopeStore`/`AuditLog`/`TimeSource`/`EdgeRuntime`) plus the concrete adapters (`make_reader`,
`make_relay`, `BrokerUplink`, `make_ui`, `make_now_provider`), generates a per-boot `bootEpoch`, and runs
the supervisor loop (`supervisor.plan_tick`): poll the NFC reader → `handle_scan` (broker-first, rung-3
offline fallback, never fail open), reconnect the uplink with capped backoff, and flush store-and-forward
audit on a timer. Graceful SIGTERM shutdown de-energizes the strike and closes the socket; systemd
watchdog (`sd_notify WATCHDOG=1`) is fed each loop.

No access decision, crypto, or framing lives here — those are the tested cores. This shell only does I/O
and scheduling. The scanned card `code` is Restricted/PII: it flows reader → `handle_scan` and no further;
it is never logged, stored, or printed. Run on a real Pi (bench) with `nfc.driver=pn532`,
`relay.driver=gpio`; on a dev box the mock/console drivers let it import and self-test.
"""

import base64
import json
import os
import signal
import socket
import sys
import threading
import time

from edge.audit import AuditLog
from edge.clock import TimeSource
from edge.crypto import verify_envelope
from edge.rtc import make_now_provider
from edge.runtime import EdgeRuntime, new_boot_epoch
from edge.store import EnvelopeStore
from edge.supervisor import next_backoff_ms, plan_tick
from edge.uplink_client import BrokerUplink
from edge.relay import make_relay
from nfc import make_reader
from ui import make_ui


class ConfigError(Exception):
    """Raised when `config.json` is missing a required key or a referenced file — fail-loud at startup
    (topic-config-environments: validate config at boot, refuse to run misconfigured)."""


def _mono_ms():
    """Monotonic clock in ms — used for durations (backoff, flush cadence), never for security windows."""
    return int(time.monotonic() * 1000)


def log(event, fields=None):
    """Structured stdout log line (systemd/journald captures stdout). Callers MUST NOT pass the scanned
    code or any secret — this is an operational event stream, redacted by construction."""
    rec = {"ts": int(time.time() * 1000), "svc": "dooraccess-edge", "event": event}
    if fields:
        rec.update(fields)
    print(json.dumps(rec, separators=(",", ":"), ensure_ascii=False), flush=True)


# --- systemd integration (no dependency: sd_notify is a datagram to $NOTIFY_SOCKET) -----------------
def sd_notify(state):
    """Minimal `sd_notify(3)` — send a state datagram to systemd if $NOTIFY_SOCKET is set (Type=notify /
    WatchdogSec). A no-op off systemd. Never raises."""
    addr = os.environ.get("NOTIFY_SOCKET")
    if not addr:
        return
    if addr.startswith("@"):  # abstract namespace socket
        addr = "\0" + addr[1:]
    try:
        sock = socket.socket(socket.AF_UNIX, socket.SOCK_DGRAM)
        try:
            sock.sendto(state.encode("utf-8"), addr)
        finally:
            sock.close()
    except OSError:
        pass  # notifying systemd is best-effort; failure must never crash the door


# --- OTA poll hook (STUB — OTA is a separate slice, ota-updates.md) ---------------------------------
def ota_poll(cfg):
    """OTA update poll hook — INTENTIONAL NO-OP (S4b-3 scope excludes OTA).

    TODO(OTA): implement the signed A/B, confirm-or-rollback poll here per docs/architecture/ota-updates.md
    (poll the cloud for a signed image, stage to the inactive slot, verify, reboot into it, run the e2e
    self-test, commit or auto-revert). Kept as a called stub so the supervisor loop already has the seam.
    """
    return None


# --- config + composition --------------------------------------------------------------------------
def load_config(path):
    """Load + validate `config.json`. Raises `ConfigError` (fail-loud) on any missing required key or a
    referenced file that does not exist. Returns the parsed dict."""
    try:
        with open(path, encoding="utf-8") as f:
            cfg = json.load(f)
    except FileNotFoundError as e:
        raise ConfigError("config not found: %s" % path) from e
    except ValueError as e:
        raise ConfigError("config is not valid JSON: %s" % e) from e
    if not isinstance(cfg, dict):
        raise ConfigError("config must be a JSON object")

    for key in ("door_id", "edge_id", "broker", "paths"):
        if key not in cfg:
            raise ConfigError("config missing required key: %s" % key)
    broker = cfg["broker"]
    for key in ("host", "port"):
        if key not in broker:
            raise ConfigError("config.broker missing required key: %s" % key)
    paths = cfg["paths"]
    for key in ("cert", "key", "ca", "edge_index_key", "envelope_store", "audit_log", "clock_floor"):
        if key not in paths:
            raise ConfigError("config.paths missing required key: %s" % key)
    # A verify key is required to trust rung-3 envelopes — inline b64 OR a file path.
    if "verify_key_b64" not in cfg and "verify_key" not in paths:
        raise ConfigError("config needs verify_key_b64 (inline) or paths.verify_key (file)")
    # Referenced input files must exist now (mTLS material + keys) — fail loud, not at first scan.
    for key in ("cert", "key", "ca", "edge_index_key"):
        p = paths[key]
        if not os.path.exists(p):
            raise ConfigError("config.paths.%s references a missing file: %s" % (key, p))
    if "verify_key" in paths and not os.path.exists(paths["verify_key"]):
        raise ConfigError("config.paths.verify_key references a missing file: %s" % paths["verify_key"])
    return cfg


def _read_text(path):
    with open(path, encoding="utf-8") as f:
        return f.read().strip()


def _load_verify_key_b64(cfg):
    """The public allowlist verify key (base64 SPKI DER). Inline `verify_key_b64` wins, else the file."""
    if cfg.get("verify_key_b64"):
        return cfg["verify_key_b64"].strip()
    return _read_text(cfg["paths"]["verify_key"])


def _load_edge_index_key(path):
    """The edge's own index key: the provisioning bundle writes base64(32B) (door-ca.sh `edge.index.key`).
    Returns raw bytes for `cred_hash`."""
    return base64.b64decode(_read_text(path))


def _load_audit_key(paths, log_fn):
    """The edge's audit-signing key (base64 PKCS#8 DER), optional. Absent → audit flush is a safe no-op
    (records are retained until an audit key is provisioned; EdgeRuntime.flush_audit handles this)."""
    p = paths.get("audit_key")
    if p and os.path.exists(p):
        return _read_text(p)
    log_fn("audit.key-unprovisioned", {"path": p})
    return None


def compose(cfg, *, reader=None, relay=None, uplink=None, ui=None, now_provider=None,
            boot_epoch=None, log_fn=log):
    """Build the runtime + adapters from `cfg`. Any of reader/relay/uplink/ui/now_provider may be injected
    (tests pass fakes); otherwise the real adapter is constructed from config. Returns a dict of the wired
    components so the loop (and tests) can drive them. Exercises the real key/path loading + EdgeRuntime
    construction regardless of which adapters are injected."""
    paths = cfg["paths"]
    door_id = cfg["door_id"]
    edge_id = cfg["edge_id"]
    boot_epoch = boot_epoch or new_boot_epoch()

    store = EnvelopeStore(paths["envelope_store"])
    audit = AuditLog(paths["audit_log"], boot_epoch)
    clock = TimeSource(paths["clock_floor"])
    verify_key_b64 = _load_verify_key_b64(cfg)
    edge_index_key = _load_edge_index_key(paths["edge_index_key"])
    audit_signing_key = _load_audit_key(paths, log_fn)

    if now_provider is None:
        now_provider = make_now_provider(cfg, log=log_fn)
    if reader is None:
        reader = make_reader(cfg)
    if relay is None:
        relay = make_relay(cfg)
    if ui is None:
        ui = make_ui(cfg)
    if uplink is None:
        broker = cfg["broker"]
        uplink = BrokerUplink(
            host=broker["host"], port=broker["port"],
            cert_path=paths["cert"], key_path=paths["key"], ca_path=paths["ca"],
            connect_timeout_s=broker.get("connect_timeout_ms", 5000) / 1000.0,
            read_timeout_s=broker.get("read_timeout_ms", 3000) / 1000.0,
            log=log_fn,
        )

    runtime = EdgeRuntime(
        door_id=door_id, verify_key_b64=verify_key_b64, edge_index_key=edge_index_key,
        store=store, audit=audit, clock=clock, uplink=uplink, relay=relay,
        now_provider=now_provider, edge_id=edge_id, audit_signing_key=audit_signing_key, log=log_fn,
    )
    return {
        "runtime": runtime, "reader": reader, "relay": relay, "uplink": uplink, "ui": ui,
        "audit": audit, "store": store, "clock": clock, "boot_epoch": boot_epoch,
    }


def _import_envelopes(store, cfg, log_fn):
    """Optionally seed the rung-3 cache from files under `paths.import_envelopes` (a provisioning drop dir).
    The store verifies each envelope's signature + anti-rollback on `put` — an unsigned/stale drop is
    rejected, so this is safe. Best-effort: a bad file is skipped, never fatal."""
    d = cfg.get("paths", {}).get("import_envelopes")
    if not d or not os.path.isdir(d):
        return
    verify_key_b64 = _load_verify_key_b64(cfg)
    for name in sorted(os.listdir(d)):
        if not name.endswith(".json"):
            continue
        try:
            with open(os.path.join(d, name), encoding="utf-8") as f:
                signed = json.load(f)
            res = store.put(signed, verify=lambda s: verify_envelope(s, verify_key_b64))
            log_fn("envelope.import", {"file": name, "stored": res.get("stored"), "reason": res.get("reason")})
        except (OSError, ValueError) as e:
            log_fn("envelope.import-error", {"file": name, "reason": e.__class__.__name__})


# --- the supervisor loop ---------------------------------------------------------------------------
def run_loop(components, cfg, stop_event, *, log_fn=log, watchdog=sd_notify, poll_once=False):
    """Drive the fail-secure supervisor loop until `stop_event` is set.

    Each tick: feed the systemd watchdog; ask `plan_tick` whether to reconnect / flush (reconnect is paced
    by `next_backoff_ms` via a next-attempt deadline so a down broker isn't hammered, while NFC polling
    stays at the fixed `poll_interval_ms` cadence so **rung-3 offline decisions keep working during an
    outage**); poll the NFC reader and, on a card, run `handle_scan` + drive the UI. `poll_once=True` runs
    a single tick (tests)."""
    runtime = components["runtime"]
    reader = components["reader"]
    uplink = components["uplink"]
    ui = components["ui"]
    audit = components["audit"]

    poll_ms = int(cfg.get("poll_interval_ms", 200))
    flush_interval_ms = int(cfg.get("flush_interval_ms", 60000))
    debounce_ms = int(cfg.get("debounce_s", 3) * 1000)
    ota_interval_ms = int(cfg.get("ota_poll_interval_ms", 3600000))

    consecutive_failures = 0
    next_reconnect_at = 0
    last_flush_ms = None
    last_ota_ms = None
    last_code = None
    last_code_ms = -10 ** 12
    was_connected = None

    ui.idle()
    while not stop_event.is_set():
        watchdog("WATCHDOG=1")
        now = _mono_ms()

        plan = plan_tick(
            now_ms=now, connected=uplink.connected, consecutive_failures=consecutive_failures,
            last_flush_ms=last_flush_ms, flush_interval_ms=flush_interval_ms,
            has_pending=bool(audit.pending()), min_sleep_ms=poll_ms,
        )

        if plan["reconnect"] and now >= next_reconnect_at:
            if uplink.connect():
                consecutive_failures = 0
            else:
                consecutive_failures += 1
                next_reconnect_at = now + next_backoff_ms(consecutive_failures)

        # Reflect link state on the UI (edge in shape only when the transition changes — avoid churn).
        if uplink.connected != was_connected:
            (ui.idle if uplink.connected else lambda: ui.offline(connecting=True))()
            was_connected = uplink.connected

        if plan["flush"]:
            res = runtime.flush_audit()
            last_flush_ms = _mono_ms()
            log_fn("audit.flush", {"flushed": res.get("flushed"), "status": res.get("status")})

        # OTA poll (no-op stub) on its own slow cadence.
        if last_ota_ms is None or (now - last_ota_ms) >= ota_interval_ms:
            ota_poll(cfg)
            last_ota_ms = now

        # NFC poll — ALWAYS, so the door decides even while the broker is unreachable (rung 3).
        try:
            code = reader.read_uid()
        except Exception as e:  # noqa: BLE001 — a reader glitch must not crash the door; skip this tick
            log_fn("nfc.read-error", {"reason": e.__class__.__name__})
            code = None
        if code is not None:
            # Debounce a card left on the reader (same code within the window → ignore).
            if code == last_code and (now - last_code_ms) < debounce_ms:
                pass
            else:
                last_code, last_code_ms = code, now
                decision = runtime.handle_scan(code)  # decision carries NO code; safe to act on/log
                if decision["granted"]:
                    ui.authorized(mode=decision.get("mode"))
                    log_fn("scan.grant", {"mode": decision.get("mode")})  # no code, no reason detail
                else:
                    ui.denied(reason=decision.get("reason"))
                    log_fn("scan.deny", {"mode": decision.get("mode"), "reason": decision.get("reason")})

        if poll_once:
            return
        stop_event.wait(min(plan["sleep_ms"], poll_ms) / 1000.0)


def _install_signal_handlers(stop_event):
    def _handle(signum, _frame):
        log("signal.received", {"signal": signum})
        stop_event.set()
    signal.signal(signal.SIGTERM, _handle)
    signal.signal(signal.SIGINT, _handle)


def main(argv=None):
    """Process entry — load config, compose, run the loop, and tear down fail-secure. @returns exit code."""
    argv = list(sys.argv[1:] if argv is None else argv)
    config_path = argv[0] if argv else os.environ.get("EDGE_CONFIG", "config.json")

    try:
        cfg = load_config(config_path)
    except ConfigError as e:
        print("dooraccess-edge: FATAL config error: %s" % e, file=sys.stderr, flush=True)
        return 2  # fail-loud: refuse to run misconfigured

    stop_event = threading.Event()
    _install_signal_handlers(stop_event)

    components = compose(cfg)
    log("boot", {"doorId": cfg["door_id"], "edgeId": cfg["edge_id"], "bootEpoch": components["boot_epoch"]})
    _import_envelopes(components["store"], cfg, log)

    sd_notify("READY=1")
    try:
        run_loop(components, cfg, stop_event)
    finally:
        sd_notify("STOPPING=1")
        # Fail-secure teardown: de-energize the strike, then close the socket. Order matters — lock first.
        try:
            components["relay"].close()
        except Exception as e:  # noqa: BLE001
            log("relay.close-error", {"reason": e.__class__.__name__})
        try:
            components["uplink"].close()
        except Exception as e:  # noqa: BLE001
            log("uplink.close-error", {"reason": e.__class__.__name__})
        log("shutdown", {})
    return 0


if __name__ == "__main__":  # pragma: no cover — thin process wrapper
    raise SystemExit(main())
