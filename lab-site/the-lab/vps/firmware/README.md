# Door unit firmware

Firmware for a FabLab door unit, paired with the **Door Access Controller** addon
(`src/plugins/door-access-controller/`) and the VPS `vps/socket-server.js`.

## Topology

```
[Pi Zero: NFC reader + UI]  --UART (JSON lines)-->  [Pi Pico W: relay + WS client]  --WSS-->  [vps/socket-server]  --> app core / signed offline allowlist
```

- **Pico W** (`pico/`, MicroPython) — holds the single WSS connection, owns the **fail-secure**
  door relay, bridges the UART to the Zero. Decides nothing.
- **Pi Zero** (`pi-zero/`, CPython) — reads the NFC card, drives the UI, forwards every scan to
  the Pico. Never talks to the VPS. Decides nothing.
- All access decisions are made on the **VPS**: online via the app core (`internal/check-access`),
  or, when the core is unreachable, via the socket-server's signed **offline allowlist**.

Wire protocol (both links): **`protocol.md`** — keep it in lockstep with `../socket-server.js`.

## Layout

| Path | What |
|------|------|
| `protocol.md` | The two link contracts (WS + UART). Source of truth. |
| `pico/main.py` | Pico W supervisor loop (WiFi, WS auth, UART bridge, relay, heartbeat, reconnect). |
| `pico/wsclient.py` | Minimal RFC 6455 WSS client (MicroPython has none built in). |
| `pico/config.example.json` | Template → copy to `config.json` on the device (git-ignored). |
| `pi-zero/reader.py` | Zero app: poll NFC → forward scan → render result. |
| `pi-zero/nfc.py` | NFC driver abstraction (PN532 + mock). |
| `pi-zero/ui.py` | UI abstraction (console + GPIO LED/buzzer). |
| `pi-zero/link.py` | UART link to the Pico. |
| `pi-zero/{config.example.json,requirements.txt}` | Config template + Python deps. |

## Flash & provision the Pico W

1. Install MicroPython for **Pico W** (the WiFi build) — flash the UF2 from micropython.org.
2. Copy the code + your config with `mpremote`:
   ```
   cd pico
   cp config.example.json config.json   # then edit: WiFi, ws_url, device_id, device_secret
   mpremote connect /dev/ttyACM0 fs cp wsclient.py main.py config.json :
   mpremote connect /dev/ttyACM0 reset
   ```
3. `main.py` runs on boot. Watch logs: `mpremote connect /dev/ttyACM0 repl`.

**`device_secret` must match this device's entry in the socket-server `DEVICE_SECRETS`** map
(one secret per device — CLAUDE §12). Provision that secret in the vault, never in git.

## Set up the Pi Zero

1. Enable the serial port (UART), disable the serial login shell: `sudo raspi-config` →
   *Interface Options* → *Serial Port* → login shell **No**, hardware serial **Yes**. Enable I2C
   too if using a PN532 over I2C.
2. Wire Zero ⇄ Pico UART **cross-over**: Zero TX → Pico RX, Zero RX → Pico TX, common GND.
   Match the pins/baud in both `config.json`s (Pico defaults GP0/GP1; Zero `/dev/serial0`).
3. Install deps and run:
   ```
   cd pi-zero
   cp config.example.json config.json    # choose nfc.driver / ui.driver + pins
   pip install -r requirements.txt
   python3 reader.py
   ```
   Install as a `systemd` service for auto-start (restart on failure).

## Security notes (CLAUDE §5/§9/§12)

- **Fail-secure relay:** de-energized = locked. It pulses **only** on a `scan_result{granted:true}`
  or an app-tap `UNLOCK`. On timeout / disconnect / reconnect the door stays locked. Egress is a
  separate mechanical override (hardware).
- **WSS only** (TLS). The Pico authenticates with a per-device secret; the socket-server compares
  it constant-time. A `scan` before auth is denied server-side.
- **No secrets in git:** `config.json` is git-ignored on both boards; only `config.example.json`
  (placeholders) is committed. The Zero holds **no** VPS secret at all.
- **Card code is PII:** it flows Zero → Pico → VPS untouched and is **never logged** on either
  board or in the socket-server scan audit line (which logs device+door+outcome only).

## Test without hardware

- **Pi Zero:** set `nfc.driver: "mock"` with `"codes": ["AABBCCDD"]` and `ui.driver: "console"`,
  then `python3 reader.py` — it forwards the mock scans over UART (or wire a null-modem to a host).
- **Server side** (the `scan` WS handler + `authorizeScan`) is covered by the Node test suite in
  `../../test/` and exercised by the addon E2E; run `npm test` from `lab-site/the-lab`.
- The Pico/Zero code is a thin I/O shell around the protocol — all *decision* logic lives on the
  VPS and is unit/E2E-tested there. Keep firmware changes limited to I/O and protocol framing.

## How it ties to the addon

On a scan the Pico sends `{type:'scan', cred, doorId}` over the existing WSS. The socket-server's
new `scan` handler runs `authorizeScan()` — **online-first** (app core → the addon's authoritative
decision once its `authoritative` flag is flipped) with an **offline fallback** to the signed
allowlist — and returns `{type:'scan_result', granted, reason, mode}`. See the rollout in
`docs/architecture/door-access-controller.md` (§ rollout); firmware is stable across the cutover.
