#!/usr/bin/env bash
# Regression tests for secrets-push.sh — offline, no network, no real vault (bw is mocked via
# BW_CLI). Proves: secrets must come from FILES (a bare NAME=value is rejected); a missing or
# EMPTY secret file is refused before the vault is touched; --dry-run contacts nothing; a new
# item is created then a re-run UPDATES instead of duplicating (idempotent upsert); attachments
# are replaced rather than piling up; a write whose read-back does not match FAILS LOUDLY; and
# secret VALUES are never printed.
set -euo pipefail
IFS=$'\n\t'

here="$(cd "$(dirname "$0")" && pwd)"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
pass=0; fail=0
ok()  { printf '  ok   - %s\n' "$1"; pass=$((pass+1)); }
bad() { printf '  FAIL - %s\n' "$1" >&2; fail=$((fail+1)); }

mkdir -p "$T/lab-stack/scripts"
cp "$here/secrets-push.sh" "$here/_lib.sh" "$T/lab-stack/scripts/"
printf 'VAULT_URL=https://vault.invalid:8000\nVAULT_EMAIL=t@example.org\n' > "$T/.env"

# --- mock bw: a tiny in-memory vault backed by files under $STATE ---------------------------
cat > "$T/bw" <<'MOCK'
#!/usr/bin/env bash
# $STATE/item.json holds the single item; $STATE/att.<name> holds attachment bytes.
# $STATE/calls logs every invocation so a test can assert "nothing was contacted".
printf '%s\n' "$*" >> "$STATE/calls"
case "$1" in
  status)  printf '{"serverUrl":"https://vault.invalid:8000","status":"unlocked"}' ;;
  config|sync|login) exit 0 ;;
  unlock)  printf 'FAKESESSION' ;;
  encode)  cat ;;                       # passthrough: stored JSON stays readable
  list)
    case "$2" in
      collections) printf '%s' '[{"id":"C1","organizationId":"O1","name":"Default collection/Infrastructure"}]' ;;
      items) [ -f "$STATE/item.json" ] && printf '[%s]' "$(cat "$STATE/item.json")" || printf '' ;;
    esac ;;
  get)
    case "$2" in
      item) cat "$STATE/item.json" ;;
      attachment)
        out=""; for a in "$@"; do [ "$prev" = "--output" ] && out="$a"; prev="$a"; done
        if [ "${FORGE_BAD_READBACK:-0}" = 1 ]; then printf 'tampered' > "$out"
        else cp "$STATE/att.$3" "$out"; fi ;;
    esac ;;
  create)
    case "$2" in
      item) python3 -c '
import json,sys,os
d=json.load(sys.stdin); d["id"]="I1"; d.setdefault("attachments",[])
open(os.environ["STATE"]+"/item.json","w").write(json.dumps(d)); print(json.dumps(d))' ;;
      attachment)
        f=""; for a in "$@"; do [ "$prev" = "--file" ] && f="$a"; prev="$a"; done
        cp "$f" "$STATE/att.$(basename "$f")"
        python3 -c '
import json,os,sys
p=os.environ["STATE"]+"/item.json"; d=json.load(open(p))
d.setdefault("attachments",[]).append({"id":"A"+str(len(d["attachments"])+1),"fileName":sys.argv[1]})
open(p,"w").write(json.dumps(d))' "$(basename "$f")" ;;
    esac ;;
  edit) python3 -c '
import json,sys,os
d=json.load(sys.stdin); open(os.environ["STATE"]+"/item.json","w").write(json.dumps(d))' ;;
  delete)  # delete attachment <id> --itemid <id>
    python3 -c '
import json,os,sys
p=os.environ["STATE"]+"/item.json"; d=json.load(open(p))
d["attachments"]=[a for a in d.get("attachments",[]) if a["id"]!=sys.argv[1]]
open(p,"w").write(json.dumps(d))' "$3" ;;
esac
MOCK
chmod +x "$T/bw"

run() { ( cd "$T/lab-stack" && BW_CLI="$T/bw" BW_SESSION=FAKESESSION STATE="$STATE" \
          bash scripts/secrets-push.sh "$@" ) 2>&1; }
fresh_state() { STATE="$T/state"; rm -rf "$STATE"; mkdir -p "$STATE"; : > "$STATE/calls"; }

printf 'secrets-push.sh regression tests\n'
# The `$` in this fixture is DELIBERATE: it proves a value containing shell metacharacters
# survives round-trip and is never expanded or echoed. Single quotes are the point.
# shellcheck disable=SC2016
SECRET='s3cr3t-value-$do-not-print'
printf '%s' "$SECRET" > "$T/key.bin"
printf 'age1examplepublicrecipient\n' > "$T/pub.txt"
: > "$T/empty.bin"

# --- 1. secrets must come from files -------------------------------------------------------
fresh_state
out="$(run --item X --field FOO=barevalue --dry-run || true)"
case "$out" in *"must be NAME=@FILE"*) ok "a bare NAME=value field is rejected" ;;
  *) bad "bare field not rejected: $out" ;; esac

# --- 2/3. missing + empty secret files are refused ------------------------------------------
out="$(run --item X --attach "$T/nope.bin" --dry-run || true)"
case "$out" in *"attachment not found"*) ok "missing attachment file is refused" ;;
  *) bad "missing file not refused: $out" ;; esac
out="$(run --item X --attach "$T/empty.bin" --dry-run || true)"
case "$out" in *"is empty"*) ok "EMPTY secret file is refused (would vault nothing)" ;;
  *) bad "empty file not refused: $out" ;; esac

# --- 4. --dry-run must not contact the vault at all -----------------------------------------
fresh_state
run --item "Thing" --attach "$T/key.bin" --dry-run >/dev/null || true
if [ ! -s "$STATE/calls" ]; then ok "--dry-run contacts the vault zero times"
else bad "--dry-run invoked bw: $(tr '\n' ';' <"$STATE/calls")"; fi

# --- 5. create path: item + attachment + verified read-back ---------------------------------
fresh_state
out="$(run --item "Thing" --attach "$T/key.bin" --field AGE_PUBLIC_RECIPIENT=@"$T/pub.txt")"
case "$out" in *"created item"*) ok "creates the item when absent" ;; *) bad "no create: $out" ;; esac
case "$out" in *"verified attachment"*) ok "verifies the attachment by byte comparison" ;; *) bad "attachment unverified: $out" ;; esac
case "$out" in *"verified field"*) ok "verifies the field by digest" ;; *) bad "field unverified: $out" ;; esac
case "$out" in *"$SECRET"*) bad "SECRET VALUE WAS PRINTED" ;; *) ok "secret value never appears in output" ;; esac

# --- 6. idempotent upsert: re-run updates, one item, one attachment -------------------------
out="$(run --item "Thing" --attach "$T/key.bin" --field AGE_PUBLIC_RECIPIENT=@"$T/pub.txt")"
case "$out" in *"updated item"*) ok "re-run UPDATES instead of creating a duplicate" ;; *) bad "no update path: $out" ;; esac
n="$(python3 -c 'import json,sys;print(len(json.load(open(sys.argv[1])).get("attachments",[])))' "$STATE/item.json")"
if [ "$n" = 1 ]; then ok "attachment is replaced, not accumulated (count=1)"
else bad "attachments accumulated (count=$n)"; fi

# --- 7. a read-back mismatch must fail loudly ----------------------------------------------
fresh_state
out="$( ( cd "$T/lab-stack" && BW_CLI="$T/bw" BW_SESSION=FAKESESSION STATE="$STATE" \
        FORGE_BAD_READBACK=1 bash scripts/secrets-push.sh --item "Thing" --attach "$T/key.bin" ) 2>&1 || true )"
case "$out" in *"could NOT be verified"*) ok "a tampered/failed read-back aborts with a loud error" ;;
  *) bad "verification failure not detected: $out" ;; esac

printf -- '-------- %d passed, %d failed --------\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
