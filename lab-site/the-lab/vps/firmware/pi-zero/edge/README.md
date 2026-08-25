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

**S4b-3 (next):** the concrete hardware/transport adapters + entry point — NFC reader, strike-relay GPIO,
the mTLS socket `uplink` (using `protocol.py` framing) + supervisor loop (reconnect/backoff, heartbeat,
`WatchdogSec`, OTA poll), `run_edge.py` main (wires real adapters + cores, generates the `bootEpoch`,
pins `cryptography` exact+hash), audit compaction/rotation + append-failure policy, and the systemd unit.
Bench-tested on a real Pi.

## Tests
`edge/tests/test_edge_core.py` (pytest): cross-language parity against **JS golden vectors**
(`goldens.json`, produced by the real cloud JS) for canonical/verify/credHash/derive, plus the full
`decide_offline` grant/deny matrix. Run: `pip install -r edge/tests/requirements-dev.txt && PYTHONPATH=.
python -m pytest edge/tests -q` (from `vps/firmware/pi-zero`). Gated in CI (the `edge-firmware` job).
