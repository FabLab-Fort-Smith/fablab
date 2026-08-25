"""Hash-chained store-and-forward audit buffer (S4b / F6).

Offline decisions aren't centrally audited until the edge reconnects, so the edge records them locally
in a tamper-evident hash chain and forwards them to the cloud anchor (S6) on recovery. Each record links
to the previous by hash, carries a per-boot monotonic `seq` and the `bootEpoch`, so the cloud dedups on
`(edgeId, bootEpoch, seq)` and detects gaps/reordering; a reflash starts a fresh `bootEpoch` (seq resets)
while the on-disk chain stays linked for local tamper-evidence.

Records carry NO PII: an event is `{doorId, granted, reason, mode}` — never the scanned code. The clock
is injected (`ts_ms` per append) so the library is deterministic/testable and never reads the wall clock.
"""

import hashlib
import json
import os
import threading

from ._fsutil import fsync_dir
from .canonical import canonical_bytes

GENESIS = ""  # prev-hash of the very first record in a file
# The only fields an offline-decision audit event may carry — NEVER the scanned code (PII). The library
# projects to these on append (L3), so the no-PII guarantee is structural, not caller-dependent.
ALLOWED_EVENT_KEYS = ("doorId", "granted", "reason", "mode")


def _hash(prev, boot_epoch, seq, ts_ms, event):
    material = canonical_bytes({"prev": prev, "bootEpoch": boot_epoch, "seq": seq, "ts": ts_ms, "event": event})
    return hashlib.sha256(material).hexdigest()


class AuditLog:
    """Append-only hash-chained audit buffer persisted as JSONL, with a store-and-forward ack cursor."""

    def __init__(self, path, boot_epoch):
        self._path = path
        self._boot = boot_epoch
        self._lock = threading.Lock()
        self._records = []
        self._last_hash = GENESIS
        self._seq = 0  # per-boot
        self._corrupt = False  # a mid-file unparseable record → verify_chain() must fail (tamper/damage)
        if os.path.exists(path):
            with open(path, encoding="utf-8") as f:
                lines = [ln.strip() for ln in f if ln.strip()]
            for i, line in enumerate(lines):
                try:
                    rec = json.loads(line)
                    if not isinstance(rec, dict):
                        raise ValueError("record is not an object")
                except (ValueError, TypeError):
                    # A power cut mid-append can leave a torn FINAL line — tolerate it (drop). A parse
                    # failure anywhere earlier is corruption/tamper — flag it so verify_chain() fails (M2).
                    if i == len(lines) - 1:
                        break
                    self._corrupt = True
                    continue
                self._records.append(rec)
            if self._records:
                self._last_hash = self._records[-1].get("hash", GENESIS)
                same_boot = [r.get("seq") for r in self._records
                             if r.get("bootEpoch") == boot_epoch and isinstance(r.get("seq"), int)
                             and not isinstance(r.get("seq"), bool)]
                self._seq = (max(same_boot) + 1) if same_boot else 0
        self._acked = self._load_ack()

    def _ack_path(self):
        return self._path + ".ack"

    def _load_ack(self):
        try:
            with open(self._ack_path(), encoding="utf-8") as f:
                return int(f.read().strip() or 0)
        except (FileNotFoundError, ValueError, OSError):
            return 0

    def append(self, event, *, ts_ms):
        """Append an audit event (no PII). Returns the stored record. Chains + fsyncs."""
        ev = {k: event[k] for k in ALLOWED_EVENT_KEYS if isinstance(event, dict) and k in event}  # L3: no PII
        with self._lock:
            seq = self._seq
            h = _hash(self._last_hash, self._boot, seq, ts_ms, ev)
            rec = {"bootEpoch": self._boot, "seq": seq, "ts": ts_ms, "event": ev,
                   "prev": self._last_hash, "hash": h}
            with open(self._path, "a", encoding="utf-8") as f:
                f.write(json.dumps(rec, separators=(",", ":"), ensure_ascii=False) + "\n")
                f.flush()
                os.fsync(f.fileno())
            self._records.append(rec)
            self._last_hash = h
            self._seq = seq + 1
            return rec

    def verify_chain(self):
        """Recompute the whole chain — True iff every link + hash is intact (tamper-evident).

        Returns False (never raises) on a malformed/missing field, and on any mid-file parse corruption
        detected at load (M2).
        """
        if self._corrupt:
            return False
        prev = GENESIS
        for r in self._records:
            try:
                if r.get("prev") != prev:
                    return False
                if _hash(prev, r["bootEpoch"], r["seq"], r["ts"], r["event"]) != r.get("hash"):
                    return False
                prev = r["hash"]
            except (KeyError, TypeError):
                return False
        return True

    def pending(self):
        """Records not yet acked as uploaded to the cloud (store-and-forward queue)."""
        return list(self._records[self._acked:])

    def ack(self, count):
        """Mark the first `count` still-pending records as uploaded (persist the cursor)."""
        with self._lock:
            self._acked = min(self._acked + max(0, int(count)), len(self._records))
            tmp = self._ack_path() + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                f.write(str(self._acked))
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp, self._ack_path())
            fsync_dir(os.path.dirname(self._ack_path()) or ".")  # M1: durable rename
            return self._acked
