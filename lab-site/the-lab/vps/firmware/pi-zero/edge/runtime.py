"""Edge runtime composition (S4b-2) — the scan → decide → actuate → audit flow, wiring the S4a/S4b-a
cores. Functional-shell over injected collaborators (reader/uplink/relay/store/audit/clock) so it is
unit-testable with fakes; the concrete NFC/GPIO/mTLS-socket adapters + supervisor loop + `run_edge`
main + systemd unit are S4b-3 (bench-tested on a real Pi).

The edge ladder (one tier below the broker's rung 1→2): ask the broker over the mTLS uplink first; the
broker itself resolves cloud→broker-cache. Use the broker's ANSWER when it replies — including a DENY
(authoritative; never re-try offline for a second chance). Fall to the local rung-3 offline decision
ONLY when the broker is UNREACHABLE (uplink returns None / raises). NEVER fail open: no grant ⇒ no pulse.
The scanned `code` is Restricted/PII — it is never logged, audited, or returned.
"""

import uuid

from .decide import decide_offline


def new_boot_epoch():
    """A globally-unique per-boot id (S4b-2 obligation): the cloud dedups audit on (edgeId,bootEpoch,seq),
    so a reflash must not reuse a value. uuid4 is CSPRNG-backed (os.urandom)."""
    return uuid.uuid4().hex


class EdgeRuntime:
    def __init__(self, *, door_id, verify_key_b64, edge_index_key, store, audit, clock, uplink, relay,
                 now_provider, log=lambda *a, **k: None):
        """`uplink.authorize(door_id, code) -> {"granted","reason"} | None` (None = broker unreachable).
        `relay.pulse()` energizes the strike. `now_provider() -> (system_ms, rtc_ok)`. `clock` is a
        TimeSource; `store`/`audit` are the S4b-a cores."""
        self.door_id = door_id
        self.verify_key_b64 = verify_key_b64
        self.edge_index_key = edge_index_key
        self.store = store
        self.audit = audit
        self.clock = clock
        self.uplink = uplink
        self.relay = relay
        self.now_provider = now_provider
        self.log = log

    def _decide_offline(self, code):
        system_ms, rtc_ok = self.now_provider()
        now_ms, synced = self.clock.trusted_now(system_ms, rtc_ok=rtc_ok)
        signed = self.store.get(self.door_id)
        if signed is None:
            return {"granted": False, "reason": "no-envelope", "mode": "offline"}
        # Decide against the STORED (latest) envelope. Anti-rollback is enforced at PUT (the store only
        # accepts strictly-newer, verified envelopes — S4b-a), so hwm_version=-1 here: we must not reject
        # the store's own current envelope as "stale" against its own version.
        r = decide_offline(
            signed, code=code, door_id=self.door_id, now_ms=now_ms,
            verify_key_b64=self.verify_key_b64, edge_index_key=self.edge_index_key,
            hwm_version=-1, time_synced=synced,
        )
        return {"granted": bool(r["granted"]), "reason": r["reason"], "mode": "offline"}

    def handle_scan(self, code):
        """Decide + actuate + audit one scan. Returns {granted,reason,mode} — never the code."""
        try:
            res = self.uplink.authorize(self.door_id, code)  # {granted,reason} or None if unreachable
        except Exception:  # noqa: BLE001 — any uplink/transport error = unreachable → offline fallback
            res = None

        if res is not None:
            decision = {"granted": bool(res.get("granted")), "reason": res.get("reason"), "mode": "online"}
        else:
            decision = self._decide_offline(code)  # rung-3, only when the broker is unreachable

        if decision["granted"]:
            try:
                self.relay.pulse()
            except Exception as e:  # noqa: BLE001 — actuation failed; the door didn't open. Log; don't crash.
                self.log("relay.error", {"doorId": self.door_id, "reason": getattr(e, "args", ["err"])[0] if e.args else "err"})
        # Audit the authorization outcome (no PII). AuditLog projects to {doorId,granted,reason,mode}.
        try:
            system_ms, _ = self.now_provider()
            self.audit.append(
                {"doorId": self.door_id, "granted": decision["granted"], "reason": decision["reason"], "mode": decision["mode"]},
                ts_ms=int(system_ms) if isinstance(system_ms, (int, float)) and system_ms == system_ms else 0,
            )
        except Exception as e:  # noqa: BLE001 — never let an audit-write failure block the decision return
            self.log("audit.error", {"doorId": self.door_id, "reason": str(e)})
        return decision
