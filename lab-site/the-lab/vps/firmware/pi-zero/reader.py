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
    """Consume any pending lines from the Pico and drive the UI. Returns True if a result was shown."""
    showed_result = False
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
        elif t == "status":
            if msg.get("online"):
                ui.idle()
            else:
                ui.offline(connecting=(msg.get("mode") == "connecting"))
    return showed_result


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

    last_code = None
    last_time = 0.0
    try:
        while True:
            # 1) Surface anything the Pico sent (results, link status).
            _drain_pico(link, ui)

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

            time.sleep(0.05)
    except KeyboardInterrupt:
        pass
    finally:
        link.close()


if __name__ == "__main__":
    run(sys.argv[1] if len(sys.argv) > 1 else DEFAULT_CONFIG)
