"""Pi Zero W edge offline-decision core (S4a) — the rung-3 security heart.

Pure, hardware-free, cross-language byte-parity with the cloud/broker (door-controller-wifi.md §2/§3).
The runtime (NFC/GPIO/mTLS client/supervisor/RTC/store-and-forward audit) is S4b and wires these.
"""

from .audit import AuditLog
from .canonical import canonical_bytes
from .clock import TimeSource
from .crypto import (cred_hash, derive_index_key, generate_audit_keypair, sign_audit_batch,
                     verify_envelope)
from .decide import REASON, decide_offline
from .protocol import build_audit_msg, build_scan_msg, parse_audit_ack, parse_result
from .runtime import EdgeRuntime, new_boot_epoch
from .store import EnvelopeStore
from .windows import in_window

__all__ = [
    "canonical_bytes",
    "verify_envelope",
    "cred_hash",
    "derive_index_key",
    "sign_audit_batch",
    "generate_audit_keypair",
    "in_window",
    "decide_offline",
    "REASON",
    "EnvelopeStore",
    "AuditLog",
    "TimeSource",
    "EdgeRuntime",
    "new_boot_epoch",
    "build_scan_msg",
    "build_audit_msg",
    "parse_audit_ack",
    "parse_result",
]
