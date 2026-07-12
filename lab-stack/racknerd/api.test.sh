#!/usr/bin/env bash
# Regression tests for racknerd/api.sh — hermetic (no network): the API call is stubbed via
# RACKNERD_FIXTURE (a canned response body) and creds via RACKNERD_ENV_FILE. Verifies response
# parsing, success/failure handling, missing-creds gating, and the --yes gate on power actions.
set -u
here="$(cd "$(dirname "$0")" && pwd)"
api="$here/api.sh"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT

pass=0; fail=0
ok()  { printf '  ok   - %s\n' "$1"; pass=$((pass + 1)); }
bad() { printf '  FAIL - %s\n' "$1" >&2; fail=$((fail + 1)); }

# A realistic success response (concatenated XML-ish tags, multiple IPs).
cat > "$T/ok.xml" <<'XML'
<status>success</status><statusmsg></statusmsg><hostname>fablab-prod</hostname><ipaddr>203.0.113.10,10.0.0.5</ipaddr><vmstat>online</vmstat><hdd>85899,4345498,4244,51</hdd><mem>2097152,512000,1585152,24</mem><bw>1000000,25000,975000,2</bw>
XML
# An API error response.
cat > "$T/err.xml" <<'XML'
<status>error</status><statusmsg>Invalid key or hash</statusmsg>
XML

# empty env file (no creds) + dummy creds file for the fixture-backed calls
: > "$T/empty.env"
printf 'RACKNERD_API_KEY=dummy\nRACKNERD_API_HASH=dummy\n' > "$T/creds.env"

echo "racknerd/api.sh regression tests"

# 1. ip: parses the FIRST ipaddr, ignores the private one
out="$(RACKNERD_ENV_FILE="$T/creds.env" RACKNERD_FIXTURE="$T/ok.xml" bash "$api" ip 2>/dev/null)"
if [ "$out" = "203.0.113.10" ]; then ok "ip = first ipaddr (203.0.113.10)"; else bad "ip parse (got '$out')"; fi

# 2. status: reads vmstat
out="$(RACKNERD_ENV_FILE="$T/creds.env" RACKNERD_FIXTURE="$T/ok.xml" bash "$api" status 2>/dev/null)"
if [ "$out" = "online" ]; then ok "status = online (vmstat)"; else bad "status parse (got '$out')"; fi

# 3. info: includes hostname + ip lines
out="$(RACKNERD_ENV_FILE="$T/creds.env" RACKNERD_FIXTURE="$T/ok.xml" bash "$api" info 2>/dev/null)"
if printf '%s' "$out" | grep -q 'fablab-prod' && printf '%s' "$out" | grep -q '203.0.113.10'; then
  ok "info shows hostname+ip"; else bad "info output"; fi

# 4. API-error response -> non-zero exit, message surfaced, no IP printed
rc=0; out="$(RACKNERD_ENV_FILE="$T/creds.env" RACKNERD_FIXTURE="$T/err.xml" bash "$api" ip 2>&1)" || rc=$?
if [ "$rc" -ne 0 ] && printf '%s' "$out" | grep -qi 'invalid key or hash'; then
  ok "API error surfaced + non-zero"; else bad "API error handling (rc=$rc, out='$out')"; fi

# 5. missing creds (no env, empty file, no fixture) -> clear error, non-zero
rc=0; out="$(env -u RACKNERD_API_KEY -u RACKNERD_API_HASH RACKNERD_ENV_FILE="$T/empty.env" bash "$api" ip 2>&1)" || rc=$?
if [ "$rc" -ne 0 ] && printf '%s' "$out" | grep -qi 'not set'; then
  ok "missing creds -> gated error"; else bad "missing-creds gate (rc=$rc)"; fi

# 6. power action WITHOUT --yes -> refused, non-zero (fixture present, so only the gate stops it)
rc=0; out="$(RACKNERD_ENV_FILE="$T/creds.env" RACKNERD_FIXTURE="$T/ok.xml" bash "$api" reboot 2>&1)" || rc=$?
if [ "$rc" -ne 0 ] && printf '%s' "$out" | grep -qi 'GATED'; then
  ok "reboot without --yes refused"; else bad "reboot gate (rc=$rc, out='$out')"; fi

# 7. power action WITH --yes -> proceeds (fixture success)
out="$(RACKNERD_ENV_FILE="$T/creds.env" RACKNERD_FIXTURE="$T/ok.xml" bash "$api" reboot --yes 2>/dev/null)"
if [ "$out" = "reboot: ok" ]; then ok "reboot --yes proceeds"; else bad "reboot --yes (got '$out')"; fi

# 8. unknown command -> non-zero
rc=0; RACKNERD_ENV_FILE="$T/creds.env" bash "$api" bogus >/dev/null 2>&1 || rc=$?
if [ "$rc" -ne 0 ]; then ok "unknown command rejected"; else bad "unknown command not rejected"; fi

echo "-------- $pass passed, $fail failed --------"
[ "$fail" -eq 0 ]
