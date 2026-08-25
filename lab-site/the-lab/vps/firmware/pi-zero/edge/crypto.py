"""Edge crypto — Ed25519 envelope verify, re-keyed credHash, and index-key derivation.

Byte-parity with the cloud/broker (door-controller-wifi.md §2):
  - verify: Ed25519 over `canonical_bytes(payload)` with DOOR_ALLOWLIST_VERIFY_KEY (spki DER, base64).
  - cred_hash: HMAC-SHA256(edgeIndexKey, code) hex — matches `credHashFor` / broker `credHash`.
  - derive_index_key: HKDF-SHA256(ikm=sha256(master), salt=empty, info="dooraccess/index/v1|"+id, 32)
    — matches `recipientIndexKey`. The edge normally holds its edgeIndexKey PROVISIONED (never the
    master); derive is here only for provisioning tools / parity tests.

The edge holds its own `edgeIndexKey` + the PUBLIC allowlist verify key — never the allowlist master
or its private signing key (F1; the cloud signs allowlist envelopes, the edge only verifies them).

It ALSO holds one dedicated per-edge Ed25519 AUDIT-signing private key (S6-b edge auth): the edge signs
its own store-and-forward audit batches with it so the cloud can verify authorship + integrity BEFORE
ingest — closing broker-compromise (a relaying broker cannot forge or suppress an edge's audit) and
giving non-repudiation. This key signs ONLY the edge's own audit; it grants no access authority.

Uses `cryptography` (pyca); HMAC/SHA via stdlib.
"""

import base64
import hashlib
import hmac

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives.serialization import load_der_private_key, load_der_public_key

from .canonical import canonical_bytes

_HKDF_INFO_PREFIX = b"dooraccess/index/v1|"


def verify_envelope(signed: dict, verify_key_spki_b64: str) -> bool:
    """Verify a per-door envelope's Ed25519 signature. Never raises — any problem returns False."""
    try:
        if not signed or "payload" not in signed or "sig" not in signed:
            return False
        pk = load_der_public_key(base64.b64decode(verify_key_spki_b64))
        if not isinstance(pk, Ed25519PublicKey):  # reject a non-Ed25519 key rather than mis-verify
            return False
        pk.verify(base64.b64decode(signed["sig"]), canonical_bytes(signed["payload"]))
        return True
    except Exception:  # noqa: BLE001 — any failure (bad sig/key/shape) must deny, never raise
        return False


def sign_audit_batch(private_key_pkcs8_der_b64: str, edge_id: str, records: list) -> str:
    """Sign a store-and-forward audit batch with the edge's dedicated Ed25519 audit key.

    Signs `canonical_bytes({"edgeId": edge_id, "records": records})` — byte-parity with the cloud verify
    (`edgeAuditSig.verifyEdgeBatchSig`), which recomputes the SAME canonical bytes and checks this
    signature against the edge's REGISTERED public key before running the anchor check. Binding `edgeId`
    into the signed bytes stops a captured batch being replayed under another edge's id.

    @param private_key_pkcs8_der_b64  the edge's audit signing key (PKCS#8 DER, base64) — provisioned on
        the device like `edgeIndexKey`, never leaves it.
    @returns the detached signature, base64.
    """
    pk = load_der_private_key(base64.b64decode(private_key_pkcs8_der_b64), password=None)
    if not isinstance(pk, Ed25519PrivateKey):  # refuse to sign with a non-Ed25519 key
        raise TypeError("audit signing key must be Ed25519")
    return base64.b64encode(pk.sign(canonical_bytes({"edgeId": edge_id, "records": records}))).decode("ascii")


def cred_hash(edge_index_key: bytes, code: str) -> str:
    """Re-keyed blind index for a scanned code under this edge's key. @returns hex."""
    return hmac.new(edge_index_key, code.encode("utf-8"), hashlib.sha256).hexdigest()


def derive_index_key(master: str, recipient_id: str) -> bytes:
    """Derive a recipient's 32-byte index key from the master — parity with `recipientIndexKey`."""
    ikm = hashlib.sha256(master.encode("utf-8")).digest()  # keyBytes(): sha256 of the env string
    return HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=b"",  # empty salt == RFC5869 zeros(HashLen); matches node hkdfSync(Buffer.alloc(0))
        info=_HKDF_INFO_PREFIX + recipient_id.encode("utf-8"),
    ).derive(ikm)
