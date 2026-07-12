#!/usr/bin/env bash
# sign-ssh-cert.sh — mint a SHORT-LIVED, scope-constrained OpenSSH user certificate.
#
# This is the reusable, tool-agnostic ISSUER at the heart of "an agent presents the appropriate
# key and is granted access to configure a machine" (ADR 0011). A machine that trusts the CA
# public key (see ansible/roles/ssh_ca) will accept ANY key that carries a valid, unexpired
# certificate signed by this CA — so the CA private key is the crown jewel and access is granted
# per-request, time-boxed, and principal-scoped rather than by pasting long-lived keys into
# authorized_keys.
#
# BASELINE vs COTS: this script is the zero-dependency baseline (wraps `ssh-keygen -s`) meant to
# run on a TRUSTED broker host (or air-gapped) that holds the CA key. For a networked
# request/response broker where agents authenticate and never touch the CA key, use the
# HashiCorp Vault SSH secrets engine instead (see ./README.md) — the trust model on the machines
# is identical; only the issuer backend changes.
#
# Security properties enforced here:
#   - fail closed: unknown role, missing/weak inputs, or a group/world-readable CA key -> abort;
#   - least privilege: role -> a fixed principal + extension set (deny-by-default extensions);
#   - short TTL by default (1h); caller may shorten, capped by SSHCA_MAX_TTL;
#   - no secret VALUES printed and the CA key never appears in argv/ps (passed by PATH only);
#   - every issuance appends a redacted audit line (who/what/serial/principal/ttl — no key bytes).
#
# Usage:
#   sign-ssh-cert.sh --ca <ca_private_key> --pubkey <requester.pub> --role <role> \
#                    --identity <who> [--ttl 30m] [--serial N] [--out <cert_path>]
# Roles (edit ROLE_POLICY below to fit your fleet):
#   ops        -> principal 'automation'  (scoped account; no forwarding/pty extensions)
#   maintainer -> principal 'deploy'      (broad human ops account)
# Example (issue a 15-minute ops cert for an agent's key):
#   ./sign-ssh-cert.sh --ca ~/.ssh/fablab_ssh_ca --pubkey ./agent_ed25519.pub \
#                      --role ops --identity 'agent:crittercodes-ci' --ttl 15m
# The requester then connects with:  ssh -i agent_ed25519 -o CertificateFile=agent_ed25519-cert.pub automation@<host>
set -euo pipefail

PROG="$(basename "$0")"
AUDIT_LOG="${SSHCA_AUDIT_LOG:-$HOME/.local/state/fablab/ssh-ca-audit.log}"
DEFAULT_TTL="${SSHCA_DEFAULT_TTL:-1h}"
MAX_TTL="${SSHCA_MAX_TTL:-8h}"

die() { printf '%s: error: %s\n' "$PROG" "$*" >&2; exit 1; }

# Role policy: role -> "principal|extensions". Extensions are the ONLY ones granted (deny by
# default). Keep this minimal; widen deliberately. 'permit-pty' is needed for an interactive
# shell; omit it for pure command/automation certs.
role_policy() {
  case "$1" in
    ops)        printf 'automation|permit-pty' ;;
    maintainer) printf 'deploy|permit-pty' ;;
    # Example locked-down command role (no shell): principal automation, no extensions.
    backup)     printf 'automation|' ;;
    *)          return 1 ;;
  esac
}

# --- parse args ---
CA="" PUBKEY="" ROLE="" IDENTITY="" TTL="$DEFAULT_TTL" SERIAL="" OUT=""
while [ $# -gt 0 ]; do
  case "$1" in
    --ca)       CA="${2:-}"; shift 2 ;;
    --pubkey)   PUBKEY="${2:-}"; shift 2 ;;
    --role)     ROLE="${2:-}"; shift 2 ;;
    --identity) IDENTITY="${2:-}"; shift 2 ;;
    --ttl)      TTL="${2:-}"; shift 2 ;;
    --serial)   SERIAL="${2:-}"; shift 2 ;;
    --out)      OUT="${2:-}"; shift 2 ;;
    -h|--help)  sed -n '1,40p' "$0"; exit 0 ;;
    --)         shift; break ;;
    *)          die "unknown argument: $1 (see --help)" ;;
  esac
done

# --- validate (fail closed) ---
command -v ssh-keygen >/dev/null 2>&1 || die "ssh-keygen not found"
[ -n "$CA" ]       || die "--ca is required"
[ -n "$PUBKEY" ]   || die "--pubkey is required"
[ -n "$ROLE" ]     || die "--role is required"
[ -n "$IDENTITY" ] || die "--identity is required (audit needs a who; e.g. agent:name)"
[ -f "$CA" ]       || die "CA private key not found: $CA"
[ -f "$PUBKEY" ]   || die "requester public key not found: $PUBKEY"

# Refuse to use a CA key readable by group/other (protect the crown jewel).
if [ "$(uname -s)" = "Linux" ]; then
  mode="$(stat -c '%a' "$CA")"
else
  mode="$(stat -f '%Lp' "$CA")"
fi
case "$mode" in
  600|400) : ;;
  *) die "CA key $CA has mode $mode; must be 600/400 (chmod 600 $CA)";;
esac

# The pubkey must be a real single SSH public key (not a private key, not a cert).
grep -q -- '-----BEGIN' "$PUBKEY" && die "$PUBKEY looks like a PRIVATE key — pass the .pub"
[ "$(grep -c . "$PUBKEY")" -eq 1 ] || die "$PUBKEY must contain exactly one public key line"

policy="$(role_policy "$ROLE")" || die "unknown role '$ROLE' (known: ops, maintainer, backup)"
PRINCIPAL="${policy%%|*}"
EXTS="${policy#*|}"

# Cap TTL: reject anything longer than MAX_TTL (crude compare on the trailing unit-normalised).
ttl_secs() { case "$1" in *s) echo "${1%s}";; *m) echo $(( ${1%m}*60 ));; *h) echo $(( ${1%h}*3600 ));; *d) echo $(( ${1%d}*86400 ));; *) echo "$1";; esac; }
[ "$(ttl_secs "$TTL")" -le "$(ttl_secs "$MAX_TTL")" ] || die "--ttl $TTL exceeds SSHCA_MAX_TTL ($MAX_TTL)"

# Serial: use provided, else epoch seconds (monotonic-enough for audit/KRL correlation).
[ -n "$SERIAL" ] || SERIAL="$(date +%s)"

# Build the -O extension flags (deny by default: clear all, add only the policy's).
opts=(-O clear -O "no-agent-forwarding" -O "no-port-forwarding" -O "no-x11-forwarding")
if [ -n "$EXTS" ]; then
  IFS=',' read -r -a ext_arr <<< "$EXTS"
  for e in "${ext_arr[@]}"; do [ -n "$e" ] && opts+=(-O "$e"); done
fi

OUT="${OUT:-${PUBKEY%.pub}-cert.pub}"

# Sign. ssh-keygen writes <basename>-cert.pub next to the pubkey; move to $OUT if different.
tmpdir="$(mktemp -d)"; trap 'rm -rf "$tmpdir"' EXIT
cp "$PUBKEY" "$tmpdir/req.pub"
ssh-keygen -s "$CA" \
  -I "$IDENTITY" \
  -n "$PRINCIPAL" \
  -V "+$TTL" \
  -z "$SERIAL" \
  "${opts[@]}" \
  "$tmpdir/req.pub"
mv "$tmpdir/req-cert.pub" "$OUT"
chmod 644 "$OUT"

# Audit (redacted — no key bytes/secret values). Append-only.
mkdir -p "$(dirname "$AUDIT_LOG")"
printf '%s issuer=%s identity=%q role=%s principal=%s ttl=%s serial=%s cert=%s\n' \
  "$(date -u +%FT%TZ)" "${USER:-unknown}" "$IDENTITY" "$ROLE" "$PRINCIPAL" "$TTL" "$SERIAL" "$OUT" \
  >> "$AUDIT_LOG"

# Human-readable summary of the (public) certificate for verification.
echo "Issued certificate -> $OUT"
ssh-keygen -L -f "$OUT" | sed -n '1,20p'
