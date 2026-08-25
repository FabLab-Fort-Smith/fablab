"""Rung-3 offline decision — the edge's local grant/deny over a cached per-door envelope.

Deny-by-default, fail-secure: any missing/invalid input, bad signature, wrong door, stale/expired
envelope, unsynced clock, or internal error → DENY (never a false grant). Mirrors the broker's
`decideAgainstEnvelope` (verify → doorId-bind → expiry → credHash match → window) and ADDS the two
rung-3-specific controls from the design:
  - anti-rollback (F5): the envelope version must strictly exceed the edge's stored high-water, so a
    valid-but-old envelope can't be replayed within its TTL.
  - clock floor (F4): the Pi Zero has no trustworthy RTC on its own; the caller passes `time_synced`
    (RTC/monotonic-floor check done in the runtime). An unsynced clock → deny (a backwards clock must
    not re-enable an expired/revoked window).
"""

from .crypto import cred_hash, verify_envelope
from .windows import _parse_iso_ms, in_window


class REASON:
    BAD_SIGNATURE = "bad-signature"
    DOOR_MISMATCH = "door-mismatch"
    STALE = "stale"            # anti-rollback: version <= high-water (replay of an old envelope)
    EXPIRED = "expired"
    CLOCK_UNSYNCED = "clock-unsynced"
    UNKNOWN_CREDENTIAL = "unknown-credential"
    NO_WINDOW = "no-window"
    ERROR = "error"
    GRANTED = "granted"


def _deny(reason):
    return {"granted": False, "reason": reason}


def decide_offline(signed, *, code, door_id, now_ms, verify_key_b64, edge_index_key,
                   hwm_version=-1, time_synced=True, tz=None):
    """Decide a scan locally. Returns {"granted": bool, "reason": str, "version"?: int}.

    :param signed: the cached envelope {"payload":..., "sig":...} for this door
    :param code: the scanned credential (Restricted/PII — never logged by the caller)
    :param door_id: this edge's door (server-provisioned); the envelope must be bound to it
    :param now_ms: current time, epoch ms (from the runtime's trusted clock)
    :param verify_key_b64: DOOR_ALLOWLIST_VERIFY_KEY (spki DER base64)
    :param edge_index_key: this edge's 32-byte edgeIndexKey (provisioned)
    :param hwm_version: highest envelope version already accepted for this door (anti-rollback)
    :param time_synced: False if the clock isn't trustworthy (RTC unset / floor violated) → deny
    """
    try:
        if not time_synced:
            return _deny(REASON.CLOCK_UNSYNCED)  # F4: never decide on an untrusted clock
        if not verify_envelope(signed, verify_key_b64):
            return _deny(REASON.BAD_SIGNATURE)
        p = signed.get("payload") or {}
        if p.get("doorId") != door_id:
            return _deny(REASON.DOOR_MISMATCH)  # F2 binding
        version = p.get("version")
        if not isinstance(version, int) or isinstance(version, bool) or version <= hwm_version:
            return _deny(REASON.STALE)  # F5 anti-rollback (also rejects missing/non-int version)
        exp = _parse_iso_ms(p.get("expiresAt"))
        if exp is None or now_ms >= exp:
            return _deny(REASON.EXPIRED)  # missing/NaN expiry → expired (fail-secure)
        target = cred_hash(edge_index_key, code)
        entry = next((e for e in (p.get("entries") or []) if e.get("credHash") == target), None)
        if entry is None:
            return _deny(REASON.UNKNOWN_CREDENTIAL)
        windows = entry.get("windows") or []
        if not windows:
            return {"granted": True, "reason": REASON.GRANTED, "version": version}
        zone = tz or p.get("tz") or "UTC"
        if any(in_window(now_ms, zone, w) for w in windows):
            return {"granted": True, "reason": REASON.GRANTED, "version": version}
        return _deny(REASON.NO_WINDOW)
    except Exception:  # noqa: BLE001 — any internal error must deny, never crash the door
        return _deny(REASON.ERROR)
