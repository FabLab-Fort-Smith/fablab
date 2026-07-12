#!/usr/bin/env bash
# Regression tests for sign-ssh-cert.sh — no network/VPS. Verifies role->principal+extensions,
# TTL cap, and fail-closed behavior, with throwaway keys and a temp audit log.
set -u
here="$(cd "$(dirname "$0")" && pwd)"
signer="$here/sign-ssh-cert.sh"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
export SSHCA_AUDIT_LOG="$T/audit.log"

pass=0; fail=0
ok()  { printf '  ok   - %s\n' "$1"; pass=$((pass + 1)); }
bad() { printf '  FAIL - %s\n' "$1" >&2; fail=$((fail + 1)); }
# rejected DESC CMD... : the signer must exit non-zero AND write no cert at $out
out=""
rejected() {
  local desc="$1"; shift
  local rc=0
  "$@" >/dev/null 2>&1 || rc=$?
  if [ "$rc" -ne 0 ] && [ ! -f "$out" ]; then ok "$desc"; else bad "$desc (rc=$rc, cert_exists=$( [ -f "$out" ] && echo yes || echo no ))"; fi
}

ssh-keygen -q -t ed25519 -f "$T/ca" -N "" -C test-ca; chmod 600 "$T/ca"
ssh-keygen -q -t ed25519 -f "$T/agent" -N "" -C agent

echo "sign-ssh-cert.sh regression tests"

# 1. ops -> principal automation, permit-pty, forwarding denied, short TTL
bash "$signer" --ca "$T/ca" --pubkey "$T/agent.pub" --role ops --identity 'agent:test' --ttl 15m --out "$T/ops.pub" >/dev/null 2>&1
info="$(ssh-keygen -L -f "$T/ops.pub" 2>/dev/null || true)"
if printf '%s' "$info" | grep -q 'automation'; then ok "ops principal=automation"; else bad "ops principal=automation"; fi
if printf '%s' "$info" | grep -q 'permit-pty'; then ok "ops has permit-pty"; else bad "ops has permit-pty"; fi
if printf '%s' "$info" | grep -qi 'port-forwarding'; then bad "ops denies port-forwarding"; else ok "ops denies port-forwarding"; fi

# 2. maintainer -> principal deploy
bash "$signer" --ca "$T/ca" --pubkey "$T/agent.pub" --role maintainer --identity 'human:me' --ttl 1h --out "$T/m.pub" >/dev/null 2>&1
if ssh-keygen -L -f "$T/m.pub" 2>/dev/null | grep -q 'deploy'; then ok "maintainer principal=deploy"; else bad "maintainer principal=deploy"; fi

# 3-6. fail-closed cases (each must exit non-zero and leave no cert)
out="$T/x.pub"; rejected "unknown role rejected"      bash "$signer" --ca "$T/ca"     --pubkey "$T/agent.pub" --role bogus --identity x --out "$out"
cp "$T/ca" "$T/ca-bad"; chmod 644 "$T/ca-bad"
out="$T/y.pub"; rejected "insecure CA key rejected"   bash "$signer" --ca "$T/ca-bad" --pubkey "$T/agent.pub" --role ops   --identity x --out "$out"
out="$T/z.pub"; rejected "TTL over cap rejected"      bash "$signer" --ca "$T/ca"     --pubkey "$T/agent.pub" --role ops   --identity x --ttl 100h --out "$out"
out="$T/w.pub"; rejected "private key as pubkey rejected" bash "$signer" --ca "$T/ca" --pubkey "$T/agent"     --role ops   --identity x --out "$out"

echo "-------- $pass passed, $fail failed --------"
[ "$fail" -eq 0 ]
