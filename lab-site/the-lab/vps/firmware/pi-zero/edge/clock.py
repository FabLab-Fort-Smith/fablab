"""Trusted-clock / monotonic floor for the edge (S4b / F4).

The Pi Zero has no reliable on-board RTC; a backwards or unset clock must not re-open an expired window
or re-enable a revoked/rolled-back envelope. This maintains a persisted **monotonic last-known-good
floor** that only ratchets forward. `trusted_now` yields the pair `decide_offline` needs — a finite
integer `now_ms` and a `time_synced` flag:

  - no trustworthy RTC (`rtc_ok=False`), or a non-finite/non-int reading → NOT synced (deny).
  - a reading BELOW the floor (clock went backwards) → NOT synced (deny); the floor is NOT lowered.
  - otherwise → synced, and the floor ratchets up to the reading (persisted).

First boot (no stored floor) trusts the battery-RTC reading and seeds the floor.
"""

import math
import os


class TimeSource:
    def __init__(self, floor_path):
        self._path = floor_path
        self._floor = self._load()

    def _load(self):
        try:
            with open(self._path, encoding="utf-8") as f:
                return int(f.read().strip())
        except (FileNotFoundError, ValueError, OSError):
            return None  # no floor yet (first boot)

    def _persist(self, ms):
        tmp = self._path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            f.write(str(ms))
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, self._path)

    @property
    def floor(self):
        return self._floor

    def trusted_now(self, system_ms, *, rtc_ok=True):
        """Return (now_ms, time_synced) for decide_offline. Ratchets the floor forward on a good read."""
        if not rtc_ok:
            return system_ms, False  # no trustworthy time source → deny
        if isinstance(system_ms, bool) or not isinstance(system_ms, (int, float)) or not math.isfinite(system_ms):
            return system_ms, False  # unusable reading → deny (S4a also hard-rejects this)
        system_ms = int(system_ms)
        if self._floor is not None and system_ms < self._floor:
            return system_ms, False  # clock went backwards → untrusted; do NOT lower the floor
        # good read: ratchet the floor up and trust it
        if self._floor is None or system_ms > self._floor:
            self._floor = system_ms
            self._persist(system_ms)
        return system_ms, True
