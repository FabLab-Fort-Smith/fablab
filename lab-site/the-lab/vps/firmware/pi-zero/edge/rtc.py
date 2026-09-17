"""Time source for the edge (S4b-3) — the `now_provider` the runtime + TimeSource consume.

`EdgeRuntime` calls ``now_provider() -> (system_ms, rtc_ok)`` on every decision. `system_ms` is the wall
clock in ms; `rtc_ok` says whether that reading is **trustworthy**. `TimeSource.trusted_now` (clock.py, F4)
then denies offline decisions whenever `rtc_ok` is False or the clock went backwards — so a Pi Zero W with
no battery RTC and no NTP fails **locked**, never opening an expired/revoked window (door-controller-wifi.md
§3b F4, the fail-secure invariant §2).

We deliberately do NOT ship an RTC chip driver we can't test on hardware. Instead `rtc_ok` is a
conservative, **injectable** check with a documented default:

  - ``systemd`` — trust only when systemd-timesyncd reports the clock is synchronized (the marker file
    ``/run/systemd/timesync/synchronized`` exists — timesyncd creates it after a successful NTP sync).
  - ``hwrtc``  — trust when a hardware RTC device node is present (e.g. ``/dev/rtc0`` from a DS3231 HAT).
  - ``auto`` (default) — trust if EITHER the NTP-sync marker OR a hardware RTC node is present.
  - ``never`` — always untrusted (rtc_ok=False → offline decisions always LOCK; safest, use if unsure).
  - ``assume`` — always trusted; **bench/dev ONLY** (bypasses the clock-floor gate — never in production).

`rtc_ok` is re-evaluated on every call, so a Pi that gains NTP sync after boot flips from locked→trusting
without a restart. The checks are injectable so the policy is unit-testable without real hardware.
"""

import os
import time

_TIMESYNC_MARKER = "/run/systemd/timesync/synchronized"
_HWRTC_DEV = "/dev/rtc0"


def system_time_ms(clock=time.time):
    """Wall-clock time in integer milliseconds (CLOCK for durations lives in the supervisor)."""
    return int(clock() * 1000)


def systemd_synced(marker=_TIMESYNC_MARKER):
    """True iff systemd-timesyncd has marked the clock NTP-synchronized (marker file present)."""
    return os.path.exists(marker)


def hwrtc_present(dev=_HWRTC_DEV):
    """True iff a hardware RTC device node is present (a battery-backed RTC HAT, F4 §11.6)."""
    return os.path.exists(dev)


def make_now_provider(cfg, *, clock=time.time, synced_check=systemd_synced, rtc_check=hwrtc_present,
                      log=lambda *a, **k: None):
    """Build the ``now_provider() -> (system_ms, rtc_ok)`` callable from the `rtc` config block.

    `synced_check`/`rtc_check`/`clock` are injectable so the trust policy is testable without hardware.
    An unknown mode is treated as ``never`` (fail-secure: unknown config → don't trust the clock).
    """
    rtc_cfg = cfg.get("rtc", {}) if isinstance(cfg, dict) else {}
    mode = rtc_cfg.get("trust", "auto")
    if mode == "assume":
        log("rtc.assume-synced", {"warning": "clock trusted unconditionally — BENCH/DEV ONLY"})

    def now_provider():
        system_ms = system_time_ms(clock)
        if mode == "assume":
            rtc_ok = True
        elif mode == "never":
            rtc_ok = False
        elif mode == "systemd":
            rtc_ok = bool(synced_check())
        elif mode == "hwrtc":
            rtc_ok = bool(rtc_check())
        elif mode == "auto":
            rtc_ok = bool(synced_check()) or bool(rtc_check())
        else:
            rtc_ok = False  # unknown mode → fail-secure (untrusted clock)
        return system_ms, rtc_ok

    return now_provider
