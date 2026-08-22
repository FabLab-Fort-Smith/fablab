"""OTA manifest crypto for the Pi Zero (CPython/Linux): canonical JSON + Ed25519 verify + SHA-256.

Unlike the Pico (no native crypto → pure-Python), the Zero is full Linux, so it uses the vetted
`cryptography` library for Ed25519 (master rule: don't hand-roll crypto where a reviewed lib
exists). canonical() reproduces the server signer's `JSON.stringify(sortKeys(obj))` byte-for-byte
(vps/lib/otaManifest.js) so signatures verify across languages.
"""

import binascii
import hashlib

from cryptography.hazmat.primitives.serialization import load_der_public_key
from cryptography.exceptions import InvalidSignature


def _escape_str(s):
    """JSON-escape like JS JSON.stringify (escape " \\ and control chars; others raw)."""
    out = ['"']
    for ch in s:
        o = ord(ch)
        if ch == '"':
            out.append('\\"')
        elif ch == "\\":
            out.append("\\\\")
        elif ch == "\n":
            out.append("\\n")
        elif ch == "\r":
            out.append("\\r")
        elif ch == "\t":
            out.append("\\t")
        elif ch == "\b":
            out.append("\\b")
        elif ch == "\f":
            out.append("\\f")
        elif o < 0x20:
            out.append("\\u%04x" % o)
        else:
            out.append(ch)
    out.append('"')
    return "".join(out)


def _encode_value(v):
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, int):
        return str(v)
    if isinstance(v, str):
        return _escape_str(v)
    raise ValueError("unsupported manifest value type")


def canonical(manifest):
    """Deterministic JSON of a flat manifest (sorted keys), matching the server's canonical()."""
    parts = [_escape_str(k) + ":" + _encode_value(manifest[k]) for k in sorted(manifest.keys())]
    return "{" + ",".join(parts) + "}"


def sha256_hex(data):
    """Lowercase hex SHA-256 of bytes (blob integrity)."""
    return hashlib.sha256(data).hexdigest()


def verify_manifest(manifest, sig_b64, verify_key_b64):
    """True iff the Ed25519 `sig_b64` over canonical(manifest) is valid under `verify_key_b64`
    (spki-DER base64 public key = the vaulted DOOR_FW_VERIFY_KEY). Never raises → False on any error.
    """
    try:
        pub = load_der_public_key(binascii.a2b_base64(verify_key_b64))
        sig = binascii.a2b_base64(sig_b64)
        msg = canonical(manifest).encode("utf-8")
        pub.verify(sig, msg)  # raises InvalidSignature on mismatch
        return True
    except (InvalidSignature, Exception):
        return False


def verify_blob(expected_sha256_hex, data):
    """True iff SHA-256(data) == the manifest's sha256 (downloaded-blob integrity)."""
    try:
        return sha256_hex(data) == str(expected_sha256_hex).lower()
    except Exception:
        return False
