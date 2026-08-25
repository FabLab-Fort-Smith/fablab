"""Edge envelope store (S4b) — the rung-3 cache with atomic anti-rollback.

Persists one signed per-door envelope; the stored FILE is the version of record (no separate high-water
file to drift — mirrors the SEC-reviewed broker fix, brokerStore F-1). A push is accepted only if it
VERIFIES and its `version` strictly exceeds the stored one, and the verify+compare+write happen under a
per-door lock (F-1/F-2: a stale/forged/rolled-back envelope can never advance the stored version). Writes
are atomic (temp + os.replace). `decide_offline` reads `high_water()` for its own anti-rollback check.

Fail-secure: an unreadable/corrupt stored file reads as "no envelope" (deny), a path-unsafe doorId is
rejected, and any I/O error on put is a rejection (never a silent accept).
"""

import json
import os
import re
import threading

_SAFE_DOOR = re.compile(r"^[A-Za-z0-9._-]{1,64}$")  # path-safe; same charset as issued ids


class EnvelopeStore:
    def __init__(self, directory):
        self._dir = directory
        self._locks = {}
        self._locks_guard = threading.Lock()
        os.makedirs(directory, exist_ok=True)

    def _lock_for(self, door_id):
        with self._locks_guard:
            lk = self._locks.get(door_id)
            if lk is None:
                lk = threading.Lock()
                self._locks[door_id] = lk
            return lk

    def _path(self, door_id):
        if not isinstance(door_id, str) or not _SAFE_DOOR.match(door_id):
            raise ValueError("unsafe doorId")
        return os.path.join(self._dir, door_id + ".json")

    def get(self, door_id):
        """Return the stored signed envelope for door_id, or None (missing/corrupt → None = deny)."""
        try:
            with open(self._path(door_id), encoding="utf-8") as f:
                return json.load(f)
        except (FileNotFoundError, ValueError, OSError):
            return None

    def high_water(self, door_id):
        """Highest stored envelope version for door_id, or -1 if none/corrupt."""
        env = self.get(door_id)
        try:
            v = (env or {}).get("payload", {}).get("version")
            return v if isinstance(v, int) and not isinstance(v, bool) else -1
        except AttributeError:
            return -1

    def put(self, signed, *, verify):
        """Verify + store a pushed envelope iff its version strictly exceeds the stored one.

        `verify(signed) -> bool` runs INSIDE the per-door lock (atomic with compare + write). Returns
        {"stored": bool, "reason"?: str, "version"?: int}. Never raises on a normal rejection.
        """
        try:
            payload = (signed or {}).get("payload") or {}
            door_id = payload.get("doorId")
            path = self._path(door_id)  # raises on unsafe/missing doorId → caught → reject
            version = payload.get("version")
            if not isinstance(version, int) or isinstance(version, bool):
                return {"stored": False, "reason": "bad-version"}
        except (ValueError, AttributeError):
            return {"stored": False, "reason": "bad-envelope"}

        with self._lock_for(door_id):
            if not verify(signed):  # verify under the lock — an unverified push can't advance the hwm
                return {"stored": False, "reason": "bad-signature"}
            if version <= self.high_water(door_id):
                return {"stored": False, "reason": "stale"}  # anti-rollback (F5)
            try:
                tmp = path + ".tmp"
                with open(tmp, "w", encoding="utf-8") as f:
                    json.dump(signed, f, separators=(",", ":"), ensure_ascii=False)
                    f.flush()
                    os.fsync(f.fileno())
                os.replace(tmp, path)  # atomic
            except OSError as e:
                return {"stored": False, "reason": "io-error:" + (getattr(e, "strerror", None) or "err")}
            return {"stored": True, "version": version}
