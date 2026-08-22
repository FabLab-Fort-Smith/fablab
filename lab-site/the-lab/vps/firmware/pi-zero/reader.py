"""Door unit — Pi Zero application (NFC reader + UI).

Reads a card, forwards the code to the Pico over UART, and renders the result the Pico reports.
It decides nothing about access and never talks to the VPS directly (see ../protocol.md). The
card code is Restricted/PII — it is forwarded but never logged or displayed.

Run: `python3 reader.py [config.json]`  (config path defaults to ./config.json).
"""

import json
import sys
import time

from nfc import make_reader
from ui import make_ui
from link import PicoLink

DEFAULT_CONFIG = "config.json"


def load_config(path):
    """Read the JSON config. Fail loud if missing/invalid — no silent defaults for hardware wiring."""
    with open(path) as f:
        return json.load(f)


def _drain_pico(link, ui):
    """Consume pending Pico lines, drive the UI, and report link health.
    Returns (showed_result, online) where `online` is None (no status seen this drain), True, or
    False — used to heartbeat the OTA health file (proof the door path works)."""
    showed_result = False
    online = None
    while True:
        msg = link.read_line()
        if not msg:
            break
        t = msg.get("t")
        if t == "result":
            if msg.get("granted"):
                ui.authorized(msg.get("mode"))
            else:
                ui.denied(msg.get("reason"))
            showed_result = True
            online = True  # a full scan round-trip proves the Pico link is alive
        elif t == "status":
            if msg.get("online"):
                ui.idle()
                online = True
            else:
                ui.offline(connecting=(msg.get("mode") == "connecting"))
                online = False
    return showed_result, online


def _touch(path):
    """Update a health file's mtime (fresh = door path proven). Best-effort."""
    try:
        import os
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w") as f:
            f.write("ok")
    except Exception:
        pass


def run(config_path=DEFAULT_CONFIG):
    """Main loop: poll the reader, forward scans, render Pico results. Recovers from transient errors."""
    cfg = load_config(config_path)
    reader = make_reader(cfg)
    ui = make_ui(cfg)
    debounce_s = cfg.get("debounce_s", 3)

    link = PicoLink(
        cfg.get("uart_port", "/dev/serial0"),
        cfg.get("uart_baud", 115200),
    ).open()
    ui.idle()

    # OTA (optional): heartbeat a health file while the Pico link is online (the confirm self-test
    # reads it), and poll for updates periodically.
    try:
        import ota
    except Exception:
        ota = None
    health_file = cfg.get("health_file", "/run/door/health")
    ota_poll_s = int(cfg.get("ota_poll_min", 0) or 0) * 60
    last_ota = time.monotonic()

    last_code = None
    last_time = 0.0
    try:
        while True:
            # 1) Surface anything the Pico sent (results, link status) + track link health.
            _shown, online = _drain_pico(link, ui)
            if online:
                _touch(health_file)  # door path proven → confirm self-test will pass

            # 2) Poll the NFC reader.
            uid = None
            try:
                uid = reader.read_uid()
            except Exception as e:
                print("[nfc] read error:", e)

            now = time.monotonic()
            if uid and not (uid == last_code and (now - last_time) < debounce_s):
                last_code, last_time = uid, now
                # Forward to the Pico; the result comes back asynchronously and is rendered in _drain_pico.
                # NOTE: never log `uid` — it is the raw card code (PII).
                link.scan(uid)

            # 3) Periodic OTA check (applies + reboots if an eligible signed update exists).
            if ota and ota_poll_s and (now - last_ota) > ota_poll_s:
                last_ota = now
                try:
                    ota.check_and_apply(cfg)
                except Exception as e:
                    print("[ota] poll error:", e)

            time.sleep(0.05)
    except KeyboardInterrupt:
        pass
    finally:
        link.close()


if __name__ == "__main__":
    run(sys.argv[1] if len(sys.argv) > 1 else DEFAULT_CONFIG)
