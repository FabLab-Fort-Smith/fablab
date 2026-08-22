"""OTA manifest crypto for the Pico: canonical JSON + Ed25519 verify + SHA-256 blob check.

Byte-for-byte compatible with the server signer (vps/lib/otaManifest.js): canonical() reproduces
`JSON.stringify(sortKeys(obj))` for a flat manifest (sorted keys, no spaces, JSON string escaping,
non-ASCII passed through raw). Manifest string fields are ASCII by convention.

No `machine`/`network` imports → CPython-importable, so this is cross-tested against Node.
"""

import binascii
import hashlib

import ed25519


def _escape_str(s):
    """JSON-escape a string like JS JSON.stringify (escape " \\ and control chars; others raw)."""
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
    """Deterministic JSON of a flat manifest dict (sorted keys), matching the server's canonical()."""
    keys = sorted(manifest.keys())
    parts = []
    for k in keys:
        parts.append(_escape_str(k) + ":" + _encode_value(manifest[k]))
    return "{" + ",".join(parts) + "}"


def _b64(s):
    return binascii.a2b_base64(s)


def sha256_hex(data):
    """Lowercase hex SHA-256 of bytes (for blob integrity)."""
    return binascii.hexlify(hashlib.sha256(data).digest()).decode()


def verify_manifest(manifest, sig_b64, verify_key_b64):
    """True iff the Ed25519 `sig_b64` over canonical(manifest) is valid under `verify_key_b64`.

    `verify_key_b64` is the spki-DER base64 public key (the same value vaulted as DOOR_FW_VERIFY_KEY);
    the raw 32-byte key is its last 32 bytes. Never raises — malformed input → False (fail closed).
    """
    try:
        pub = _b64(verify_key_b64)[-32:]
        sig = _b64(sig_b64)
        msg = canonical(manifest).encode("utf-8")
        return ed25519.verify(pub, msg, sig)
    except Exception:
        return False


def verify_blob(expected_sha256_hex, data):
    """True iff SHA-256(data) matches the manifest's sha256 (integrity of the downloaded blob)."""
    try:
        return sha256_hex(data) == str(expected_sha256_hex).lower()
    except Exception:
        return False
