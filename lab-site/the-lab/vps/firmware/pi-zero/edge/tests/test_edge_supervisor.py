"""S4b-3 supervisor scheduling policy (non-hardware): reconnect backoff + audit-flush cadence. Pure,
deterministic, clock-injected — no sockets, no reader, no sleep."""

from edge import due_for_flush, next_backoff_ms, plan_tick


# ---- next_backoff_ms ----
def test_backoff_doubles_and_caps():
    assert next_backoff_ms(0, base_ms=1000, cap_ms=30000) == 1000       # no failures → base
    assert next_backoff_ms(1, base_ms=1000, cap_ms=30000) == 1000       # 1st retry → base
    assert next_backoff_ms(2, base_ms=1000, cap_ms=30000) == 2000
    assert next_backoff_ms(3, base_ms=1000, cap_ms=30000) == 4000
    assert next_backoff_ms(6, base_ms=1000, cap_ms=30000) == 30000      # 32000 → capped
    assert next_backoff_ms(1000, base_ms=1000, cap_ms=30000) == 30000   # long outage → still capped (no overflow)


def test_backoff_handles_bad_input():
    assert next_backoff_ms(-5) == 1000
    assert next_backoff_ms(None) == 1000


# ---- due_for_flush ----
def test_due_for_flush():
    assert due_for_flush(1000, None, 60000) is True                     # never flushed → due
    assert due_for_flush(60000, 0, 60000) is True                       # exactly the interval → due
    assert due_for_flush(59999, 0, 60000) is False                      # not yet
    assert due_for_flush(120000, 60000, 60000) is True
    assert due_for_flush(float("inf"), 0, 60000) is True                # inf elapsed → due (finite check passes for inf? it's a float)
    assert due_for_flush(None, 0, 60000) is False                       # bad clock → not due (fail-safe)
    assert due_for_flush(True, 0, 60000) is False                       # bool is not a real clock


# ---- plan_tick ----
def test_plan_disconnected_reconnects_with_backoff_never_flushes():
    p = plan_tick(now_ms=5000, connected=False, consecutive_failures=3, last_flush_ms=0,
                  flush_interval_ms=60000, has_pending=True)
    assert p == {"reconnect": True, "flush": False, "sleep_ms": 4000}   # backoff(3), no flush while down


def test_plan_connected_flushes_when_pending_and_due():
    p = plan_tick(now_ms=60000, connected=True, last_flush_ms=0, flush_interval_ms=60000, has_pending=True)
    assert p["reconnect"] is False and p["flush"] is True


def test_plan_connected_no_flush_when_nothing_pending():
    p = plan_tick(now_ms=999999, connected=True, last_flush_ms=0, flush_interval_ms=60000, has_pending=False)
    assert p["flush"] is False and p["reconnect"] is False


def test_plan_connected_no_flush_before_interval_and_sleeps_until_due():
    p = plan_tick(now_ms=20000, connected=True, last_flush_ms=0, flush_interval_ms=60000, has_pending=True, min_sleep_ms=250)
    assert p["flush"] is False                                          # 20s < 60s
    assert p["sleep_ms"] == 40000                                      # ~time until due


def test_plan_sleep_floored_to_min():
    p = plan_tick(now_ms=59900, connected=True, last_flush_ms=0, flush_interval_ms=60000, has_pending=False, min_sleep_ms=250)
    assert p["sleep_ms"] == 250                                        # ~100ms remaining → clamped up, never busy-spin


def test_plan_first_run_no_last_flush_flushes_if_pending():
    p = plan_tick(now_ms=1000, connected=True, last_flush_ms=None, flush_interval_ms=60000, has_pending=True)
    assert p["flush"] is True and p["sleep_ms"] == 60000               # never flushed → due now; then a full interval
