# Door unit — wire protocol

Single source of truth for the two links in a door unit. Keep this in lockstep with
`vps/socket-server.js` (VPS side) and the firmware in `pico/` + `pi-zero/`.

```
[Pi Zero: NFC reader + UI]  --UART (JSON lines)-->  [Pi Pico W: relay + WS client]  --WSS-->  [vps/socket-server]
```

Only the **Pico** holds the WebSocket to the VPS. The **Pi Zero** never talks to the VPS
directly — it reads the card and drives the UI, and relays everything through the Pico over a
local UART. The **relay is on the Pico** and is **fail-secure**: de-energized = locked; it only
pulses on an *authorized* result.

---

## Link 1 — Pico ⇄ VPS socket-server (WSS, RFC 6455 text frames, JSON)

Transport: `wss://<host>` (TLS only — CLAUDE §5). One long-lived connection; reconnect with
backoff. All frames are JSON objects with a `type`.

### Device → server

| `type`  | Fields | Meaning |
|---------|--------|---------|
| `auth`  | `deviceId`, `secret` | Authenticate the device. Sent once on (re)connect, before anything else. `secret` is the device's entry in the server's `DEVICE_SECRETS` (constant-time compared server-side). |
| `ping`  | — | Heartbeat. Server replies `pong`. |
| `scan`  | `cred`, `doorId?`, `tz?`, `requestId?` | A card was read. `cred` = raw card code (**Restricted/PII — never logged**). `doorId` defaults to the device id server-side. `requestId` is echoed back so the Pico can match the reply. |

### Server → device

| shape | Meaning |
|-------|---------|
| `{status:'authenticated'}` | Auth accepted. Only now may the Pico send `scan`. |
| `{status:'error'}` then close | Auth rejected. Reconnect + retry (backoff). |
| `{type:'pong'}` | Heartbeat reply. |
| `{type:'scan_result', requestId, granted, reason?, mode}` | Decision for a `scan`. `granted` boolean; `mode` ∈ `online`\|`offline`; `reason` a policy/deny code. **Pico fires its relay iff `granted===true`.** |
| `{command:'UNLOCK'}` | App-tap unlock (Flow B, pushed via `POST /api/unlock`). Pico pulses the relay. Independent of scans. |
| `{command:'TOGGLE_LIGHT'}` | Optional light toggle (existing). |

**Fail-secure rules (Pico):**
- Relay defaults locked; only a `scan_result{granted:true}` or an `UNLOCK` command pulses it.
- If the `scan_result` never arrives (timeout), stay locked and tell the Zero `DENY (timeout)`.
- A `scan` sent before `authenticated` is answered `granted:false, reason:'UNAUTHENTICATED'`.

---

## Link 2 — Pi Zero ⇄ Pico (UART, newline-delimited JSON)

Config: 115200 8N1 by default (see each board's `config.example.json`). One JSON object per
line (`\n`-terminated). Unknown `t` values are ignored (forward-compatible).

### Pi Zero → Pico

| `t`     | Fields | Meaning |
|---------|--------|---------|
| `scan`  | `cred` | A card UID/code was read. Pico wraps this into a WS `scan`. |
| `ping`  | — | Liveness from the Zero (optional). |

### Pico → Pi Zero

| `t`      | Fields | Meaning |
|----------|--------|---------|
| `result` | `granted`, `reason?`, `mode?` | Outcome of the last scan → Zero updates the UI (`Authorized` / `Unauthorized`) and buzzer/LED. |
| `status` | `online` (bool), `mode?` | Link health → Zero can show "offline mode" / "reconnecting". Emitted on connect/disconnect and on demand. |

**The Zero never decides access.** It shows what the Pico reports. `cred` is Restricted/PII —
the Zero must not log or display it.

---

## Credential note

`cred` flows Zero → Pico → VPS untouched. Neither board evaluates good-standing, windows, or
allowlists — that is entirely the VPS (app core online, or the signed offline allowlist on the
socket-server). This keeps the door boards dumb, secret-light, and independently replaceable
(design doc `docs/architecture/door-access-controller.md`).
