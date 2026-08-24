#!/usr/bin/env bash
# Unit test for door-ca.sh (S3a) — real openssl + node, no VPS. Verifies the CA chain, cert CN/EKU,
# key-file perms, no-clobber, and that the derived index keys byte-match the cloud golden vectors.
set -euo pipefail
IFS=$'\n\t'

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CA="$here/door-ca.sh"
pass=0; fail=0
ok()   { pass=$((pass+1)); echo "  ok: $*"; }
bad()  { fail=$((fail+1)); echo "  FAIL: $*" >&2; }
check(){ if eval "$2"; then ok "$1"; else bad "$1"; fi; }

# Fixed master → known (golden) recipient index keys; the on-device (Python) verifier must match these.
export DOOR_CARD_INDEX_KEY="test-index-master-key"
GOLDEN_BROKER="YuoH5IchoZ9t9MussYa4Zt3U6mYUeXXZUxPjzPY9cnc="
GOLDEN_EDGE="jOOqc2R0cpvx8RizC5etY6NKNAKXb/Qry70hHvlB8vU="

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
ca="$work/ca"; bkr="$work/broker"; edg="$work/edge"

echo "init-ca"
bash "$CA" init-ca "$ca" >/dev/null
check "ca.crt + ca.key created"      "[ -f '$ca/ca.crt' ] && [ -f '$ca/ca.key' ]"
check "ca.key is 0600"               "[ \"\$(stat -c %a '$ca/ca.key')\" = 600 ]"
check "re-init refuses (no clobber)" "! bash '$CA' init-ca '$ca' >/dev/null 2>&1"

echo "issue-broker"
bash "$CA" issue-broker broker-1 "IP:10.0.0.2" "$ca" "$bkr" >/dev/null
check "broker.crt verifies against the CA" "openssl verify -CAfile '$ca/ca.crt' '$bkr/broker.crt' >/dev/null 2>&1"
check "broker cert CN = broker-1"          "openssl x509 -in '$bkr/broker.crt' -noout -subject | grep -q 'CN *= *broker-1'"
check "broker cert has serverAuth EKU"     "openssl x509 -in '$bkr/broker.crt' -noout -ext extendedKeyUsage 2>/dev/null | grep -q 'TLS Web Server Authentication'"
check "broker cert has the SAN"            "openssl x509 -in '$bkr/broker.crt' -noout -ext subjectAltName 2>/dev/null | grep -q '10.0.0.2'"
check "broker.key is 0600"                 "[ \"\$(stat -c %a '$bkr/broker.key')\" = 600 ]"
check "broker.index.key is 0600"           "[ \"\$(stat -c %a '$bkr/broker.index.key')\" = 600 ]"
check "broker index key matches golden"    "[ \"\$(cat '$bkr/broker.index.key')\" = '$GOLDEN_BROKER' ]"
check "broker uplink bearer present+0600"  "[ -s '$bkr/broker.uplink.secret' ] && [ \"\$(stat -c %a '$bkr/broker.uplink.secret')\" = 600 ]"
check "re-issue into same dir refuses"     "! bash '$CA' issue-broker broker-1 'IP:10.0.0.2' '$ca' '$bkr' >/dev/null 2>&1"

echo "issue-edge"
bash "$CA" issue-edge edge-1 front broker-1 "$ca" "$edg" >/dev/null
check "edge.crt verifies against the CA" "openssl verify -CAfile '$ca/ca.crt' '$edg/edge.crt' >/dev/null 2>&1"
check "edge cert CN = edge-1"            "openssl x509 -in '$edg/edge.crt' -noout -subject | grep -q 'CN *= *edge-1'"
check "edge cert has clientAuth EKU"     "openssl x509 -in '$edg/edge.crt' -noout -ext extendedKeyUsage 2>/dev/null | grep -q 'TLS Web Client Authentication'"
check "edge.key is 0600"                 "[ \"\$(stat -c %a '$edg/edge.key')\" = 600 ]"
check "edge index key matches golden"    "[ \"\$(cat '$edg/edge.index.key')\" = '$GOLDEN_EDGE' ]"
if command -v jq >/dev/null 2>&1; then
  check "registry maps door front → edge/broker" "[ \"\$(jq -r '.front.edgeDeviceId' '$ca/registry.json')\" = edge-1 ] && [ \"\$(jq -r '.front.brokerId' '$ca/registry.json')\" = broker-1 ]"
fi

echo "index key derivation refuses without the master"
check "derive fails closed when DOOR_CARD_INDEX_KEY unset" "! ( unset DOOR_CARD_INDEX_KEY; node '$here/derive-index-key.mjs' x >/dev/null 2>&1 )"

echo "----"
echo "passed: $pass, failed: $fail"
[ "$fail" -eq 0 ] || exit 1
