"""Edge supervisor scheduling policy (S4b-3, non-hardware core).

The edge's background loop has two jobs beyond answering scans: keep the broker uplink connected, and
periodically flush store-and-forward audit up to the cloud. WHEN to do each — the reconnect backoff after
a failure, and whether a flush is due — is pure decision logic; it is separated here from the blocking
I/O (NFC reader poll, mTLS socket connect, `time.sleep`) which lives in the hardware/bench shell (`run_edge`).

Everything here is deterministic + clock-injected (times passed in as ms), so it is unit-testable without
a Pi. It NEVER performs I/O and NEVER decides access — it only schedules. Fail-secure is the loop's job
(a missed flush just retries; a down uplink just backs off — neither opens a door).
"""

# Bound the doubling so `2 ** n` can't blow up on a long outage before the cap clamps it.
_MAX_SHIFT = 20


def next_backoff_ms(consecutive_failures, *, base_ms=1000, cap_ms=30000):
    """Exponential reconnect backoff, capped. 0 failures → `base_ms`; each further failure doubles it up
    to `cap_ms`. Deterministic (no random jitter — the caller may add injected jitter if desired).
    @param consecutive_failures  count of back-to-back uplink failures (>=0)
    """
    if not isinstance(consecutive_failures, int) or consecutive_failures <= 0:
        return base_ms
    delay = base_ms * (2 ** min(consecutive_failures - 1, _MAX_SHIFT))
    return min(delay, cap_ms)


def due_for_flush(now_ms, last_flush_ms, interval_ms):
    """True if an audit flush is due: never flushed yet, or `interval_ms` has elapsed since the last one.
    A non-numeric/None `now_ms` is treated as NOT due (fail-safe — don't hammer on a bad clock)."""
    if not isinstance(now_ms, (int, float)) or isinstance(now_ms, bool):
        return False
    if last_flush_ms is None:
        return True
    return (now_ms - last_flush_ms) >= interval_ms


def plan_tick(*, now_ms, connected, consecutive_failures=0, last_flush_ms=None,
              flush_interval_ms=60000, has_pending=False, min_sleep_ms=250):
    """Decide one supervisor tick from the current state. Pure — returns an action plan the shell executes.

    - Disconnected → `reconnect=True`, sleep the reconnect backoff (can't flush while down).
    - Connected → flush iff there is pending audit AND a flush is due; sleep until the next flush is due
      (clamped to `min_sleep_ms` so the loop still polls promptly and never busy-spins).

    @returns {"reconnect": bool, "flush": bool, "sleep_ms": int}
    """
    if not connected:
        return {"reconnect": True, "flush": False, "sleep_ms": next_backoff_ms(consecutive_failures)}

    due = due_for_flush(now_ms, last_flush_ms, flush_interval_ms)
    flush = bool(has_pending) and due
    if last_flush_ms is None or not isinstance(now_ms, (int, float)) or isinstance(now_ms, bool):
        remaining = flush_interval_ms
    else:
        remaining = flush_interval_ms - (now_ms - last_flush_ms)
    sleep_ms = max(min_sleep_ms, int(remaining)) if remaining > min_sleep_ms else min_sleep_ms
    return {"reconnect": False, "flush": flush, "sleep_ms": sleep_ms}
