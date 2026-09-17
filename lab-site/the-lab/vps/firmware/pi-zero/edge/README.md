# Pi Zero W edge — offline-decision core (S4a)

The **rung-3** security heart of the edge node: it decides a scan **locally** from a cached, signed
per-door envelope when the broker/cloud is unreachable (door-controller-wifi.md §2/§3, rung 3). Pure and
hardware-free — the NFC/GPIO/mTLS-client/supervisor/RTC/store-and-forward runtime that wires it is **S4b**.

## Modules
- `canonical.py` — canonical JSON, **byte-identical** to the cloud/broker signer (the F3 cross-language
  contract). Verifying over the wrong bytes = fail-secure deny, never a false grant.
- `crypto.py` — `verify_envelope` (Ed25519 over the canonical payload), `cred_hash`
  (HMAC-SHA256(edgeIndexKey, code) — matches the cloud re-keying), `derive_index_key` (HKDF; parity/
  provisioning only — the edge normally holds its `edgeIndexKey` provisioned, never the master).
- `windows.py` — time-window evaluation, a faithful port of the broker `inWindow` (day 0=Sun, overnight
  wrap, tz-local via `zoneinfo`).
- `decide.py` — `decide_offline(...)`: **deny-by-default, fail-secure**. verify → doorId-bind (F2) →
  anti-rollback `version > high-water` (F5) → expiry/TTL → `edgeIndexKey` credHash match → window. Plus a
  **clock-floor** gate (F4): an unsynced/untrusted clock (`time_synced=False`) denies — a backwards clock
  must not re-open an expired window.

## Security invariants
- The edge holds only its **own** `edgeIndexKey` (leaked ⇒ its door only) + the **public** verify key —
  never the master `DOOR_CARD_INDEX_KEY`, never a signing key.
- Every failure path (bad sig, wrong door, stale/expired, unknown cred, unsynced clock, any exception) →
  **deny**. The scan `code` is Restricted/PII — callers must never log it.

## Runtime cores (S4b-a)
The security-relevant, filesystem-backed pieces the S4b-2 runtime wires (still hardware-free):
- `store.py` — `EnvelopeStore`: the rung-3 cache. `put` verifies + accepts an envelope only if its
  `version` strictly exceeds the stored one, **under a per-door lock, atomic (temp+replace)** — a stale/
  forged/rolled-back push can't advance the high-water (F5; mirrors the broker `setEnvelope` F-1/F-2). The
  stored file is the version of record (no drifting hwm file). `high_water()` feeds `decide_offline`.
- `audit.py` — `AuditLog`: **hash-chained** store-and-forward buffer for offline decisions (F6). Each
  record links by hash + carries per-boot `seq` and `bootEpoch` (cloud dedups on `(edgeId,bootEpoch,seq)`,
  S6). `verify_chain()` is tamper-evident; `pending()`/`ack()` are the forward cursor. **No PII** — events
  are `{doorId,granted,reason,mode}`, never the code. Clock is injected (`ts_ms`).
- `clock.py` — `TimeSource`: a persisted **monotonic floor** (F4). `trusted_now(system_ms, rtc_ok)` →
  `(now_ms, time_synced)` for `decide_offline`; a backwards/unset/non-finite clock is **not synced**
  (deny) and never lowers the floor.

## Composition (S4b-2)
- `runtime.py` `EdgeRuntime.handle_scan(code)` — the scan → decide → actuate → audit flow (functional
  shell over injected `uplink`/`relay`/`store`/`audit`/`clock`). The edge ladder: ask the broker over the
  mTLS uplink first and honor its **answer, including a DENY** (authoritative — no offline second-chance);
  fall to the local rung-3 `decide_offline` **only when the broker is unreachable** (uplink None/raises).
  Never fail open (no grant ⇒ no pulse); the scanned `code` is never logged/audited/returned. Decides
  against the STORED envelope with `hwm_version=-1` (anti-rollback is enforced at PUT, S4b-a).
  `new_boot_epoch()` = a CSPRNG per-boot UUID for the audit chain.
- `protocol.py` — client Link-A framing (`build_scan_msg` with `requestId`+`nonce` for the broker replay
  guard; `parse_result` deny-by-default).

## Adapters + entry point (S4b-3)
The concrete hardware/transport adapters + the runnable entry point that wire the cores above into a door:
- `uplink_client.py` — `BrokerUplink`: the Link-A **mTLS client** (pure stdlib `ssl`+`socket`). Lazy
  connect + reconnect on a single persistent socket; verifies the broker server cert against the **pinned
  internal CA** (`server_hostname=<broker ip>` matches the broker's IP-SAN cert), presents the edge client
  cert, TLS 1.2+. `authorize()` sends a `scan` (`protocol.build_scan_msg`), correlates the `result` by
  `requestId`, and is **deny-by-default** (`parse_result`); **any error/timeout/desync → None** (unreachable
  → runtime rung-3 fallback), never a grant. `send_audit()` returns the raw `audit_ack` line. The scanned
  `code` only ever rides the encrypted frame — never logged/stored.
- `../nfc.py` — reused: `make_reader` (PN532 / mock). `relay.py` — `make_relay`: `GpioRelay` (strike pin,
  **de-energized at rest + on close** = fail-secure; lazy `gpiozero`, fail-loud if the lib is missing) +
  `ConsoleRelay`/`MockRelay` for bench/tests. `../ui.py` — reused for LED/buzzer feedback (wired in
  `run_edge`). `rtc.py` — `make_now_provider` → `(system_ms, rtc_ok)`; conservative, injectable clock-trust
  (NTP-sync marker and/or hardware-RTC node; unknown/absent → untrusted → offline **locks**, F4).
- `../run_edge.py` — the main entry point: fail-loud `config.json` load, `compose()` builds the cores +
  adapters + `EdgeRuntime`, generates a per-boot `bootEpoch`, and `run_loop()` drives the supervisor
  (`supervisor.plan_tick` + `next_backoff_ms`): NFC poll → `handle_scan` (broker-first, rung-3 offline
  fallback, never fail open), capped-backoff reconnect, timed `flush_audit`, an OTA-poll **stub** (no-op,
  OTA is its own slice), graceful SIGTERM teardown (de-energize strike + close socket) and a **systemd
  watchdog** (`sd_notify WATCHDOG=1`, inline — no dependency).
- `../systemd/dooraccess-edge.service` (+ `systemd/README.md`) — `Type=notify`, `WatchdogSec`, restart,
  non-root `dooraccess` user, sandboxing (`ProtectSystem=strict`, `ReadWritePaths=/var/lib/dooraccess`).
- `../requirements.txt` — `cryptography` (+ `cffi`/`pycparser` closure) **exact-pinned with sha256 hashes**
  for `pip install --require-hashes`.

**Bench (hardware) remains:** run one real edge node end-to-end (PN532 + strike relay + a live broker over
mTLS), the RTC HAT, and OTA — bench-tested on a Pi before rollout.

## Tests
pytest, hardware-free + deterministic. Run from `vps/firmware/pi-zero`:
`pip install -r edge/tests/requirements-dev.txt && PYTHONPATH=. python -m pytest edge/tests -q`.
- `test_edge_core.py` — S4a cross-language parity vs **JS golden vectors** (`goldens.json`) +
  `decide_offline` matrix. `test_edge_composition.py`/`test_edge_runtime.py`/`test_edge_supervisor.py` —
  the S4b-a/S4b-2 runtime + scheduling primitives.
- **S4b-3:** `test_edge_uplink.py` — `BrokerUplink` against a throwaway in-process **mTLS server**
  (openssl-minted certs; self-skips if openssl is absent): grant on matching `requestId`, `None` on
  mismatch/malformed/timeout, a rogue (non-CA) server cert rejected → never a grant, and the code never
  logged. `test_edge_relay_rtc.py` — relay factory/fail-secure + the clock-trust policy.
  `test_edge_run_edge.py` — `run_edge` wiring: fail-loud config, online grant → `relay.pulse()` + no-PII
  audit, broker-unreachable → rung-3 offline decision from the store.
