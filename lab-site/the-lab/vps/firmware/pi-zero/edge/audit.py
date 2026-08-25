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

from .canonical import canonical_bytes

GENESIS = ""  # prev-hash of the very first record in a file


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
        if os.path.exists(path):
            with open(path, encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line:
                        self._records.append(json.loads(line))
            if self._records:
                self._last_hash = self._records[-1]["hash"]
                same_boot = [r["seq"] for r in self._records if r.get("bootEpoch") == boot_epoch]
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
        with self._lock:
            seq = self._seq
            h = _hash(self._last_hash, self._boot, seq, ts_ms, event)
            rec = {"bootEpoch": self._boot, "seq": seq, "ts": ts_ms, "event": event,
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
        """Recompute the whole chain — True iff every link + hash is intact (tamper-evident)."""
        prev = GENESIS
        for r in self._records:
            if r.get("prev") != prev:
                return False
            if _hash(prev, r["bootEpoch"], r["seq"], r["ts"], r["event"]) != r["hash"]:
                return False
            prev = r["hash"]
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
            return self._acked
