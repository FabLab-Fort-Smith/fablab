"""Door unit — Pi Pico W firmware (MicroPython).

Role (see ../protocol.md and docs/architecture/door-access-controller.md):
  - Hold the single WSS connection to the VPS socket-server.
  - Bridge the local UART to the Pi Zero (NFC reader + UI): card scans in, results out.
  - Own the door relay, FAIL-SECURE: de-energized = locked; pulse only on an authorized result.

The Pico decides nothing about access — it forwards the card code to the VPS and acts on the
decision. Secrets (WiFi, device secret) live in config.json (git-ignored), never in this file.
"""

import json
import time

import network
from machine import Pin, UART

import wsclient

CONFIG_PATH = "config.json"


def load_config():
    """Read config.json. Fail loud (raise) if it is missing/invalid — no insecure defaults."""
    with open(CONFIG_PATH) as f:
        cfg = json.load(f)
    required = ("wifi_ssid", "wifi_password", "ws_url", "device_id", "device_secret")
    missing = [k for k in required if not cfg.get(k)]
    if missing:
        raise ValueError("config.json missing required keys: %s" % ", ".join(missing))
    return cfg


class Relay:
    """Fail-secure door relay. Locked (de-energized) at rest; `pulse()` unlocks briefly."""

    def __init__(self, pin_num, active_high=True, unlock_ms=3000):
        self._active = 1 if active_high else 0
        self._idle = 0 if active_high else 1
        self._unlock_ms = unlock_ms
        self._pin = Pin(pin_num, Pin.OUT)
        self.lock()

    def lock(self):
        """Force the relay to the locked (de-energized) state."""
        self._pin.value(self._idle)

    def pulse(self):
        """Energize the strike for unlock_ms, then always return to locked."""
        self._pin.value(self._active)
        time.sleep_ms(self._unlock_ms)
        self._pin.value(self._idle)


class ZeroLink:
    """Newline-delimited JSON link to the Pi Zero over UART."""

    def __init__(self, cfg):
        self._uart = UART(
            cfg.get("uart_id", 0),
            baudrate=cfg.get("uart_baud", 115200),
            tx=Pin(cfg.get("uart_tx", 0)),
            rx=Pin(cfg.get("uart_rx", 1)),
        )
        self._buf = b""

    def read_line(self):
        """Return one parsed JSON object from the Zero, or None if no complete line is ready."""
        if self._uart.any():
            self._buf += self._uart.read(self._uart.any())
        nl = self._buf.find(b"\n")
        if nl < 0:
            return None
        line, self._buf = self._buf[:nl], self._buf[nl + 1:]
        try:
            return json.loads(line)
        except Exception:
            return None  # ignore malformed lines (forward-compatible)

    def send(self, obj):
        """Write one JSON object + newline to the Zero (best-effort)."""
        try:
            self._uart.write((json.dumps(obj) + "\n").encode())
        except Exception:
            pass

    def result(self, granted, reason=None, mode=None):
        """Tell the Zero the outcome of a scan → it drives the UI."""
        self.send({"t": "result", "granted": bool(granted), "reason": reason, "mode": mode})

    def status(self, online, mode=None):
        """Tell the Zero the link state (online / offline / reconnecting)."""
        self.send({"t": "status", "online": bool(online), "mode": mode})


def wifi_connect(cfg):
    """Bring up STA WiFi, blocking until associated. Retries indefinitely (door must recover)."""
    wlan = network.WLAN(network.STA_IF)
    wlan.active(True)
    if not wlan.isconnected():
        wlan.connect(cfg["wifi_ssid"], cfg["wifi_password"])
        while not wlan.isconnected():
            print("[wifi] connecting...")
            time.sleep(1)
    print("[wifi] connected:", wlan.ifconfig()[0])
    return wlan


def ws_authenticate(ws, cfg):
    """Send the auth frame and wait for {status:'authenticated'}. Raise WSError on rejection."""
    ws.send(json.dumps({"type": "auth", "deviceId": cfg["device_id"], "secret": cfg["device_secret"]}))
    deadline = time.ticks_add(time.ticks_ms(), 10000)
    while time.ticks_diff(deadline, time.ticks_ms()) > 0:
        msg = ws.recv(timeout=2)
        if not msg:
            continue
        try:
            data = json.loads(msg)
        except Exception:
            continue
        if data.get("status") == "authenticated":
            return
        if data.get("status") == "error":
            raise wsclient.WSError("auth rejected by server")
    raise wsclient.WSError("auth timed out")


def _act_on_command(data, relay, zero):
    """Handle a server-push command (Flow B). Returns True if it was a command frame."""
    cmd = data.get("command")
    if cmd == "UNLOCK":
        print("[relay] UNLOCK (app-tap)")
        relay.pulse()
        return True
    if cmd == "TOGGLE_LIGHT":
        # Light control is optional/hardware-specific; no-op unless wired. Left as a hook.
        print("[relay] TOGGLE_LIGHT (no-op)")
        return True
    return False


def handle_scan(ws, zero, relay, cred, cfg, req_id):
    """Send a scan to the VPS, await its scan_result (bounded), fire the relay on grant.

    Fail-secure: on timeout or transport error the door stays LOCKED and the Zero shows a denial.
    UNLOCK pushes arriving during the wait are still honored.
    """
    ws.send(json.dumps({
        "type": "scan",
        "cred": cred,
        "doorId": cfg.get("door_id", cfg["device_id"]),
        "tz": cfg.get("timezone"),
        "requestId": req_id,
    }))
    deadline = time.ticks_add(time.ticks_ms(), int(cfg.get("scan_timeout_s", 6) * 1000))
    while time.ticks_diff(deadline, time.ticks_ms()) > 0:
        msg = ws.recv(timeout=1)
        if not msg:
            continue
        try:
            data = json.loads(msg)
        except Exception:
            continue
        if _act_on_command(data, relay, zero):
            continue
        if data.get("type") == "scan_result" and data.get("requestId") == req_id:
            granted = bool(data.get("granted"))
            if granted:
                relay.pulse()
            zero.result(granted, data.get("reason"), data.get("mode"))
            return
    # No decision in time → stay locked, tell the Zero.
    zero.result(False, "TIMEOUT", None)


def run():
    """Top-level supervisor loop: keep WiFi + WS up, bridge scans, recover from any failure."""
    cfg = load_config()
    relay = Relay(cfg.get("relay_pin", 15), cfg.get("relay_active_high", True), cfg.get("unlock_ms", 3000))
    zero = ZeroLink(cfg)
    wifi_connect(cfg)

    backoff = 1
    req_counter = 0
    while True:
        ws = None
        try:
            zero.status(False, "connecting")
            ws = wsclient.WebSocket(cfg["ws_url"])
            ws_authenticate(ws, cfg)
            print("[ws] authenticated")
            zero.status(True)
            backoff = 1  # reset after a clean connect
            last_ping = time.ticks_ms()
            hb_ms = int(cfg.get("heartbeat_s", 20) * 1000)

            while True:
                # 1) Card scan from the Zero?
                line = zero.read_line()
                if line and line.get("t") == "scan" and line.get("cred"):
                    req_counter += 1
                    handle_scan(ws, zero, relay, str(line["cred"]), cfg, req_counter)

                # 2) Server push (UNLOCK / TOGGLE_LIGHT) or pong.
                msg = ws.recv(timeout=0.2)
                if msg:
                    try:
                        _act_on_command(json.loads(msg), relay, zero)
                    except Exception:
                        pass

                # 3) Heartbeat.
                if time.ticks_diff(time.ticks_ms(), last_ping) > hb_ms:
                    ws.send(json.dumps({"type": "ping"}))
                    last_ping = time.ticks_ms()

        except wsclient.WSError as e:
            print("[ws] error:", e)
        except OSError as e:
            print("[net] error:", e)
        finally:
            relay.lock()  # never leave the door unlocked across a reconnect
            if ws:
                ws.close()
            zero.status(False, "offline")

        # Reconnect with capped exponential backoff; make sure WiFi is still up.
        print("[ws] reconnecting in %ds" % backoff)
        time.sleep(backoff)
        backoff = min(backoff * 2, 30)
        try:
            wifi_connect(cfg)
        except Exception as e:
            print("[wifi] reconnect error:", e)


if __name__ == "__main__":
    run()
