"""Time-window evaluation — a faithful port of the broker/offlineAccess `inWindow`.

Windows are `{start:"HH:MM", end:"HH:MM", days:[0..6]}` with day 0 = Sunday (matching the JS `dayMap`).
`end > start` is a same-day window; `end <= start` is an overnight window that wraps to the previous
day. Local time is computed in the envelope's tz (IANA name) — the edge must reach the same verdict as
the cloud/broker for the same instant.
"""

from datetime import datetime, timezone
from zoneinfo import ZoneInfo


def _local_parts(now_ms: int, tz: str):
    """(day 0=Sun..6=Sat, minutes-since-midnight) for `now_ms` in tz — matches JS localParts."""
    dt = datetime.fromtimestamp(now_ms / 1000, ZoneInfo(tz))
    day = dt.isoweekday() % 7  # isoweekday: Mon=1..Sun=7 → Sun=0, Mon=1, … Sat=6 (JS dayMap)
    return day, dt.hour * 60 + dt.minute


def _hhmm(s: str) -> int:
    h, m = (int(x) for x in str(s).split(":"))
    return h * 60 + m


def in_window(now_ms: int, tz: str, w: dict) -> bool:
    day, minutes = _local_parts(now_ms, tz)
    start, end = _hhmm(w["start"]), _hhmm(w["end"])
    days = w.get("days", [])
    if end > start:
        return day in days and start <= minutes < end
    prev = (day + 6) % 7  # overnight wrap
    return (day in days and minutes >= start) or (prev in days and minutes < end)


def _parse_iso_ms(s: str):
    """ISO-8601 (incl. trailing Z) → epoch ms, or None if unparseable (→ caller fails secure)."""
    try:
        dt = datetime.fromisoformat(str(s).replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return int(dt.timestamp() * 1000)
    except (ValueError, TypeError):
        return None
