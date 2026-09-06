#!/usr/bin/env bash
# Regression tests for prod-backup-keysetup.sh — offline, no network, no real vault/ssh.
# secrets-push.sh, prod-backup-preflight.sh and ssh-keygen are all mocked via the script's env
# injection points (SECRETS_PUSH / PREFLIGHT / SSH_KEYGEN). Proves: an existing private key is
# REUSED never overwritten; a missing keypair is created; the private key is vaulted as an
# ATTACHMENT and the public key as a FIELD; the BACKUP_PULL_PUBKEY hand-off line is printed with
# the real public key; --dry-run mutates nothing and forwards --dry-run to the vault push and skips
# the pre-flight; --no-preflight suppresses the pre-flight; and vault failure is fatal.
set -euo pipefail
IFS=$'\n\t'

here="$(cd "$(dirname "$0")" && pwd)"
SUT="$here/prod-backup-keysetup.sh"
pass=0; fail=0
ok()  { printf '  ok   - %s\n' "$1"; pass=$((pass+1)); }
bad() { printf '  FAIL - %s\n' "$1" >&2; fail=$((fail+1)); }
# assert "desc" CMD...  — CMD is one command (no &&/|| chains, so shellcheck stays clean).
assert() { local d="$1"; shift; if "$@"; then ok "$d"; else bad "$d"; fi; }

make_env() {
  # Fresh sandbox per case. Returns paths via globals T/KEY/CALLS/PFMARK.
  T="$(mktemp -d)"; KEY="$T/backup_pull"; CALLS="$T/push.calls"; PFMARK="$T/preflight.ran"

  # Mock ssh-keygen: create keypair, derive pub (-y), print fingerprint (-lf).
  cat > "$T/ssh-keygen" <<'KG'
#!/usr/bin/env bash
f=""; mode="gen"
while [ $# -gt 0 ]; do case "$1" in
  -f) f="$2"; shift 2 ;; -y) mode="pub"; shift ;; -lf) mode="fp"; f="$2"; shift 2 ;;
  *) shift ;; esac; done
case "$mode" in
  gen) printf 'PRIVKEYBYTES\n' > "$f"; printf 'ssh-ed25519 AAAATESTKEY backup-pull@test\n' > "$f.pub" ;;
  pub) printf 'ssh-ed25519 AAAATESTKEY backup-pull@test\n' ;;
  fp)  printf '256 SHA256:deadbeeftestfingerprint %s (ED25519)\n' "$f" ;;
esac
KG
  chmod +x "$T/ssh-keygen"

  # Mock secrets-push: assert file-backed inputs exist + non-empty (mirrors the real fail-closed
  # contract), log the argv, honour FORGE_PUSH_FAIL to simulate a vault failure.
  cat > "$T/secrets-push.sh" <<'SP'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$PUSH_CALLS"
attach=""; field_src=""; prev=""
for a in "$@"; do
  [ "$prev" = "--attach" ] && attach="$a"
  case "$a" in *=@*) field_src="${a#*=@}" ;; esac
  prev="$a"
done
[ -s "$attach" ] || { echo "push: empty/missing attachment" >&2; exit 3; }
[ -s "$field_src" ] || { echo "push: empty/missing field src" >&2; exit 3; }
[ "${FORGE_PUSH_FAIL:-0}" = 1 ] && { echo "push: simulated failure" >&2; exit 1; }
exit 0
SP
  chmod +x "$T/secrets-push.sh"

  cat > "$T/preflight.sh" <<PF
#!/usr/bin/env bash
touch "$PFMARK"
PF
  chmod +x "$T/preflight.sh"
}

run() {
  # run <extra-args...> ; captures combined output in $OUT, exit in $RC.
  set +e
  OUT="$(PULL_KEY="$KEY" SSH_KEYGEN="$T/ssh-keygen" SECRETS_PUSH="$T/secrets-push.sh" \
        PREFLIGHT="$T/preflight.sh" PUSH_CALLS="$CALLS" bash "$SUT" "$@" 2>&1)"
  RC=$?
  set -e
}

# --- 1) fresh keypair: created, vaulted (attach priv + field pub), pre-flight ran ---------------
make_env
run
assert "fresh run exits 0"                 test "$RC" = 0
assert "private key created"               test -f "$KEY"
assert "public key created"                test -f "$KEY.pub"
assert "private key vaulted as attachment" grep -q -- "--attach $KEY" "$CALLS"
assert "public key vaulted as field"       grep -q -- "PUBLIC_KEY=@$KEY.pub" "$CALLS"
assert "hand-off line printed with pubkey" grep -q "BACKUP_PULL_PUBKEY='ssh-ed25519 AAAATESTKEY" <<<"$OUT"
assert "pre-flight ran by default"         test -f "$PFMARK"
assert "private key mode 600"              test "$(stat -c '%a' "$KEY")" = 600
rm -rf "$T"

# --- 2) existing key is REUSED, never overwritten -----------------------------------------------
make_env
printf 'ORIGINAL-PRIVATE\n' > "$KEY"; printf 'ssh-ed25519 AAAAEXISTING held@old\n' > "$KEY.pub"
run --no-preflight
assert "reuse run exits 0"                 test "$RC" = 0
assert "private key NOT overwritten"       test "$(cat "$KEY")" = "ORIGINAL-PRIVATE"
assert "reports reuse"                     grep -q "reusing" <<<"$OUT"
assert "hand-off uses existing pubkey"     grep -q "AAAAEXISTING" <<<"$OUT"
assert "--no-preflight suppressed pre-flight" test ! -f "$PFMARK"
rm -rf "$T"

# --- 3a) --dry-run with NO key: mutates nothing, describes intent, no push call, no pre-flight ---
make_env
run --dry-run
assert "dry-run(no key) exits 0"           test "$RC" = 0
assert "dry-run created no key"            test ! -f "$KEY"
assert "dry-run(no key) did NOT call push" test ! -f "$CALLS"
assert "dry-run describes the vault intent" grep -q "would vault" <<<"$OUT"
assert "dry-run skipped pre-flight"        test ! -f "$PFMARK"
rm -rf "$T"

# --- 3b) --dry-run with an EXISTING key: forwards --dry-run to the vault push (real validation) --
make_env
printf 'ORIGINAL-PRIVATE\n' > "$KEY"; printf 'ssh-ed25519 AAAAEXISTING held@old\n' > "$KEY.pub"
run --dry-run
assert "dry-run(key) exits 0"              test "$RC" = 0
assert "dry-run forwarded to vault push"   grep -q -- "--dry-run" "$CALLS"
assert "dry-run did not touch existing key" test "$(cat "$KEY")" = "ORIGINAL-PRIVATE"
rm -rf "$T"

# --- 4) vault failure is fatal ------------------------------------------------------------------
make_env
set +e
OUT="$(PULL_KEY="$KEY" SSH_KEYGEN="$T/ssh-keygen" SECRETS_PUSH="$T/secrets-push.sh" \
      PREFLIGHT="$T/preflight.sh" PUSH_CALLS="$CALLS" FORGE_PUSH_FAIL=1 bash "$SUT" --no-preflight 2>&1)"
RC=$?; set -e
assert "vault failure is fatal (rc=$RC)"   test "$RC" != 0
assert "vault failure is loud"             grep -q "NOT safely stored" <<<"$OUT"
rm -rf "$T"

printf '\n%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
