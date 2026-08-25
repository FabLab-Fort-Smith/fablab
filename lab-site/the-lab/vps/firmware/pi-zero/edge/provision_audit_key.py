"""Provision an edge's audit-signing keypair (genesis / reflash — #151, S6-b-a2).

Run ON the edge device once at provisioning:

    python -m edge.provision_audit_key --out /var/lib/dooraccess/audit_key.b64 --edge-id front-01

Generates a fresh Ed25519 audit keypair, writes the PRIVATE key (PKCS#8 DER, base64) to `--out` with
0600 perms (the device holds it, like `edgeIndexKey`), and prints the PUBLIC key (SPKI DER, base64) to
stdout. An admin then REGISTERS that public key for this edge id on the cloud
(`Service.adminRegisterEdgeKey`), which is the audited genesis/reflash trust binding — the cloud will
only accept audit batches an edge signs with the matching private key.

Refuses to overwrite an existing key file unless `--force` (a reflash is a deliberate act): re-keying
silently would orphan the currently-registered public key and drop that edge's audit as bad-signature.
The private key is NEVER printed or logged; only the public key is emitted.
"""

import argparse
import os
import sys

from .crypto import generate_audit_keypair


def main(argv=None) -> int:
    """CLI entry — see module docstring. @returns process exit code."""
    ap = argparse.ArgumentParser(description="Provision an edge audit-signing keypair.")
    ap.add_argument("--out", required=True, help="path to write the PRIVATE key (0600); must not exist unless --force")
    ap.add_argument("--edge-id", required=True, help="this edge's id (for the operator's record; not written to the key file)")
    ap.add_argument("--force", action="store_true", help="overwrite an existing key file (deliberate reflash)")
    args = ap.parse_args(argv)

    if os.path.exists(args.out) and not args.force:
        print(f"refusing to overwrite existing key at {args.out} (use --force for a deliberate reflash)", file=sys.stderr)
        return 2

    priv_b64, pub_b64 = generate_audit_keypair()

    # Write the private key with least privilege: create 0600, never world/group readable, and refuse to
    # follow a symlink at the target (O_NOFOLLOW) so a pre-planted link can't redirect the key write.
    fd = os.open(args.out, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW, 0o600)
    try:
        os.write(fd, (priv_b64 + "\n").encode("ascii"))
    finally:
        os.close(fd)
    os.chmod(args.out, 0o600)  # tighten even if the file pre-existed with looser perms

    # Emit ONLY the public key + the edge id, for the admin to register on the cloud.
    print(f"edgeId={args.edge_id}")
    print(f"pubSpki={pub_b64}")
    print(f"(private key written to {args.out}, mode 0600 — never share it)", file=sys.stderr)
    return 0


if __name__ == "__main__":  # pragma: no cover — thin CLI wrapper
    raise SystemExit(main())
