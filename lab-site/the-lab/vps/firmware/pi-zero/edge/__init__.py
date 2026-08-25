"""Pi Zero W edge offline-decision core (S4a) — the rung-3 security heart.

Pure, hardware-free, cross-language byte-parity with the cloud/broker (door-controller-wifi.md §2/§3).
The runtime (NFC/GPIO/mTLS client/supervisor/RTC/store-and-forward audit) is S4b and wires these.
"""

from .canonical import canonical_bytes
from .crypto import cred_hash, derive_index_key, verify_envelope
from .decide import REASON, decide_offline
from .windows import in_window

__all__ = [
    "canonical_bytes",
    "verify_envelope",
    "cred_hash",
    "derive_index_key",
    "in_window",
    "decide_offline",
    "REASON",
]
