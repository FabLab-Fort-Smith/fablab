"""Ed25519 signature VERIFY (RFC 8032), pure Python — verify-only (no signing on device).

Iterative (no recursion → safe on MicroPython's small stack) and uses the bundled pure SHA-512, so
it works on any MicroPython build. Slow (~seconds on RP2040) but OTA verification is infrequent.
CPython-compatible so it is cross-tested against the Node signer (vps/lib/otaManifest.js).

Public domain reference algorithm (Bernstein / RFC 8032).
"""

from _sha512 import sha512

_q = 2 ** 255 - 19
_L = 2 ** 252 + 27742317777372353535851937790883648493
_d = (-121665 * pow(121666, _q - 2, _q)) % _q
_I = pow(2, (_q - 1) // 4, _q)


def _xrecover(y):
    xx = (y * y - 1) * pow(_d * y * y + 1, _q - 2, _q) % _q
    x = pow(xx, (_q + 3) // 8, _q)
    if (x * x - xx) % _q != 0:
        x = (x * _I) % _q
    if x % 2 != 0:
        x = _q - x
    return x


_By = 4 * pow(5, _q - 2, _q) % _q
_Bx = _xrecover(_By)
_B = (_Bx % _q, _By % _q)


def _add(P, Q):
    x1, y1 = P
    x2, y2 = Q
    dxy = _d * x1 * x2 * y1 * y2
    x3 = (x1 * y2 + x2 * y1) * pow(1 + dxy, _q - 2, _q) % _q
    y3 = (y1 * y2 + x1 * x2) * pow(1 - dxy, _q - 2, _q) % _q
    return (x3 % _q, y3 % _q)


def _scalarmult(P, e):
    Q = (0, 1)  # neutral element
    while e > 0:
        if e & 1:
            Q = _add(Q, P)
        P = _add(P, P)
        e >>= 1
    return Q


def _isoncurve(P):
    x, y = P
    return (-x * x + y * y - 1 - _d * x * x * y * y) % _q == 0


def _decodepoint(s):
    y = int.from_bytes(s, "little") & ((1 << 255) - 1)  # low 255 bits
    x = _xrecover(y)
    if (x & 1) != (s[31] >> 7):  # restore x sign from the top bit
        x = _q - x
    P = (x, y)
    if not _isoncurve(P):
        raise ValueError("point not on curve")
    return P


def verify(public_key, message, signature):
    """True iff `signature` (64 bytes) is a valid Ed25519 sig of `message` under `public_key`
    (32 raw bytes). Never raises — any malformed input → False (fail closed)."""
    try:
        if len(signature) != 64 or len(public_key) != 32:
            return False
        R = _decodepoint(signature[:32])
        A = _decodepoint(public_key)
        S = int.from_bytes(signature[32:], "little")
        if S >= _L:  # RFC 8032: S must be in [0, L)
            return False
        h = int.from_bytes(sha512(signature[:32] + public_key + message), "little") % _L
        # Valid iff [S]B == R + [h]A
        return _scalarmult(_B, S) == _add(R, _scalarmult(A, h))
    except Exception:
        return False
