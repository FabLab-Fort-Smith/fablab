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

import math
import uuid

from .decide import decide_offline
from .protocol import build_audit_msg, parse_audit_ack


def new_boot_epoch():
    """A globally-unique per-boot id (S4b-2 obligation): the cloud dedups audit on (edgeId,bootEpoch,seq),
    so a reflash must not reuse a value. uuid4 is CSPRNG-backed (os.urandom)."""
    return uuid.uuid4().hex


class EdgeRuntime:
    def __init__(self, *, door_id, verify_key_b64, edge_index_key, store, audit, clock, uplink, relay,
                 now_provider, edge_id=None, audit_signing_key=None, log=lambda *a, **k: None):
        """`uplink.authorize(door_id, code) -> {"granted","reason"} | None` (None = broker unreachable).
        `relay.pulse()` energizes the strike. `now_provider() -> (system_ms, rtc_ok)`. `clock` is a
        TimeSource; `store`/`audit` are the S4b-a cores.

        `edge_id` (this edge's id = its mTLS cert CN) + `audit_signing_key` (its provisioned Ed25519
        audit private key, PKCS#8 DER b64) enable `flush_audit`; `uplink.send_audit(line) -> ack_line|None`
        pushes a signed batch to the broker. All three are optional so a decision-only runtime still
        builds; `flush_audit` is a safe no-op (deferred) if the audit key isn't provisioned."""
        self.door_id = door_id
        self.verify_key_b64 = verify_key_b64
        self.edge_index_key = edge_index_key
        self.store = store
        self.audit = audit
        self.clock = clock
        self.uplink = uplink
        self.relay = relay
        self.now_provider = now_provider
        self.edge_id = edge_id
        self.audit_signing_key = audit_signing_key
        self.log = log

    def flush_audit(self):
        """Push pending store-and-forward audit up to the broker (→ cloud), advancing the ack cursor ONLY
        on an explicit cloud `accepted` whose batchId matches what we sent. Idempotent (the cloud dedups
        by (edgeId,bootEpoch,seq)) and safe to call on a timer. Fail-secure — unreachable / deferred /
        rejected / mismatch / unprovisioned → keep the records (NEVER drop unuploaded audit). Records
        carry no PII (event = {doorId,granted,reason,mode}); the scanned code is never in them.
        @returns {"flushed": int, "status": "empty"|"accepted"|"deferred"|"rejected"}
        """
        # Atomic snapshot (base cursor + records) so a concurrent flush can't race the cursor (SEC #175 F1).
        base, records = self.audit.snapshot_pending()
        if not records:
            return {"flushed": 0, "status": "empty"}
        if not self.edge_id or not self.audit_signing_key:
            self.log("audit.flush-unprovisioned", {})
            return {"flushed": 0, "status": "deferred"}  # keep until an audit key is provisioned
        try:
            batch_id, line = build_audit_msg(edge_id=self.edge_id, signing_key_b64=self.audit_signing_key, records=records)
            raw = self.uplink.send_audit(line)  # broker's audit_ack line, or None if unreachable
        except Exception as e:  # noqa: BLE001 — any sign/transport error = keep + retry (never a false ack)
            self.log("audit.flush-error", {"reason": str(e)})
            return {"flushed": 0, "status": "deferred"}
        ack = parse_audit_ack(raw) if raw is not None else None
        if ack and ack["status"] == "accepted" and ack["batchId"] == batch_id:
            n = len(records)
            # Compare-and-set the cursor against the snapshot base (F1). A persist failure here is NOT an
            # integrity problem — the cloud already has these records and re-sends dedup at the anchor —
            # so log + still report accepted rather than crashing the caller (SEC #175 F2).
            try:
                self.audit.ack(n, base=base)  # advance only if the cursor is unmoved since the snapshot
            except Exception as e:  # noqa: BLE001 — cursor-persist failure; cloud has them, re-send dedups
                self.log("audit.ack-persist-error", {"reason": str(e)})
            return {"flushed": n, "status": "accepted"}
        if ack and ack["status"] == "rejected":
            # bad-signature / unregistered-edge — retrying the identical batch won't help. KEEP the records
            # (forensics) but don't hot-loop; the supervisor paces retries and an operator must re-check
            # the edge's registration. Alert via the log (edgeId only, no PII).
            self.log("audit.flush-rejected", {"edgeId": self.edge_id})
            return {"flushed": 0, "status": "rejected"}
        return {"flushed": 0, "status": "deferred"}  # keep + retry (unreachable / deferred / stale ack)

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
            # STRICT boolean (F1): a truthy-non-bool granted must not be laundered into a grant.
            decision = {"granted": res.get("granted") is True, "reason": res.get("reason"), "mode": "online"}
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
            # F2: guard a non-finite clock (int(inf) raises) so the audit record isn't dropped; the
            # timestamp is informational (not a security decision), so 0 on a pathological clock is fine.
            ts = int(system_ms) if isinstance(system_ms, (int, float)) and not isinstance(system_ms, bool) and math.isfinite(system_ms) else 0
            self.audit.append(
                {"doorId": self.door_id, "granted": decision["granted"], "reason": decision["reason"], "mode": decision["mode"]},
                ts_ms=ts,
            )
        except Exception as e:  # noqa: BLE001 — never let an audit-write failure block the decision return
            self.log("audit.error", {"doorId": self.door_id, "reason": str(e)})
        return decision
