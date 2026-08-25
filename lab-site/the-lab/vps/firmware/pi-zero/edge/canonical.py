"""Canonical JSON — a byte-faithful port of the cloud/broker `canonical()`.

The offline signature is verified over the canonical bytes of the envelope payload, so the edge MUST
reproduce exactly what the signer produced (door-controller-wifi.md §2 F3). The JS contract is
`JSON.stringify(sortKeys(value))`: object keys sorted recursively, arrays in order, no whitespace, and
non-ASCII emitted raw (JS does not \\u-escape). We match that with `sort_keys`-equivalent recursion +
`separators=(",", ":")` + `ensure_ascii=False`.

Caveat (documented, safe): JS reorders *integer-like* keys numerically ahead of string keys; a naive
string sort would diverge. The door envelope schema has NO integer-like keys, so this never triggers;
and if one ever appeared, the canonical bytes would differ and signature verification would simply
FAIL (deny) — fail-secure, never a false grant. So we keep the simple recursive string sort.
"""

import json


def _sort(v):
    if isinstance(v, list):
        return [_sort(x) for x in v]
    if isinstance(v, dict):
        return {k: _sort(v[k]) for k in sorted(v.keys())}
    return v


def canonical_bytes(value) -> bytes:
    """Return the canonical UTF-8 bytes for `value`, byte-identical to the JS signer."""
    return json.dumps(_sort(value), separators=(",", ":"), ensure_ascii=False).encode("utf-8")
