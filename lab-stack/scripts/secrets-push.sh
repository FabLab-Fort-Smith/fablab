#!/usr/bin/env bash
# Push a secret INTO the shared Vaultwarden vault — the write-side counterpart to
# secrets-pull.sh, so custody of a generated secret is automated instead of a manual
# copy/paste (custody P0 — docs/runbooks/shared-custody.md). Reachable over the ZeroTier
# overlay (the zerotier role). Uses the Bitwarden CLI (`bw`); override with BW_CLI for tests.
#
# WHY FILES, NOT ARGUMENTS: every secret value is read from a FILE, never passed on the
# command line — argv is world-readable via /proc and lands in shell history. Values are
# never printed; the script reports names, sizes and digests only.
#
# IDEMPOTENT: an item with the same name in the collection is UPDATED (fields upserted,
# attachments replaced), not duplicated. Safe to re-run.
#
# Config (from ../.env or the environment; none are secret):
#   VAULT_URL         the ZeroTier-reachable Vaultwarden URL (e.g. https://10.121.16.224:8000) [required]
#   VAULT_EMAIL       vault login email (needed only if `bw` isn't already authenticated)
#   VAULT_COLLECTION  collection to write into (default: "Default collection/Infrastructure")
#   VAULT_CACERT      path to the server's TLS cert to trust (avoids TOFU cert fetch)          [optional]
# Auth: reuses $BW_SESSION if set; else unlocks, reading the master password from
#   $BW_PASSWORD_FILE (mode 0600) or prompting on a TTY. The password is never echoed and
#   never written by this script.
#
# Usage:
#   bash scripts/secrets-push.sh --item "FabLab backup age identity" \
#        [--note-file FILE] [--field NAME=@FILE]... [--attach FILE]... [--dry-run]
#
# Example (vault an age private key + record its public recipient):
#   bash scripts/secrets-push.sh --item "FabLab backup age identity" \
#        --attach /path/fablab-backup.agekey --field AGE_PUBLIC_RECIPIENT=@/path/recipient.pub
set -euo pipefail
IFS=$'\n\t'
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/.."   # -> lab-stack/
# shellcheck disable=SC1091  # _lib.sh is a sibling script, linted separately
. scripts/_lib.sh

ENVF="../.env"
BW="${BW_CLI:-bw}"

info() { printf '  %s\n' "$*"; }
die()  { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

ITEM=""; NOTE_FILE=""; DRY=0
FIELDS=(); ATTACHMENTS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --item)      ITEM="${2:-}"; shift 2 ;;
    --note-file) NOTE_FILE="${2:-}"; shift 2 ;;
    --field)     FIELDS+=("${2:-}"); shift 2 ;;
    --attach)    ATTACHMENTS+=("${2:-}"); shift 2 ;;
    --dry-run)   DRY=1; shift ;;
    *) die "unknown argument: $1 (see the header for usage)" ;;
  esac
done
[ -n "$ITEM" ] || die "--item <name> is required"

VAULT_URL="${VAULT_URL:-$(env_get "$ENVF" VAULT_URL)}"
VAULT_EMAIL="${VAULT_EMAIL:-$(env_get "$ENVF" VAULT_EMAIL)}"
VAULT_COLLECTION="${VAULT_COLLECTION:-$(env_get "$ENVF" VAULT_COLLECTION)}"
[ -n "$VAULT_COLLECTION" ] || VAULT_COLLECTION="Default collection/Infrastructure"
[ -n "$VAULT_URL" ] || die "VAULT_URL not set — add it to $ENVF or the environment."
command -v "$BW" >/dev/null 2>&1 || die "bw (Bitwarden CLI) not found — install with: npm i -g @bitwarden/cli"

# --- validate the inputs BEFORE touching the vault (fail closed, no partial writes) ---
for f in "${ATTACHMENTS[@]:-}"; do
  [ -n "$f" ] || continue
  [ -f "$f" ] || die "attachment not found: $f"
  [ -s "$f" ] || die "attachment is empty: $f (refusing to vault an empty secret)"
done
for spec in "${FIELDS[@]:-}"; do
  [ -n "$spec" ] || continue
  case "$spec" in
    *=@*) src="${spec#*=@}"; [ -f "$src" ] || die "field source file not found: $src" ;;
    *) die "field must be NAME=@FILE (values are read from files, never argv): $spec" ;;
  esac
done

# --dry-run is deliberately OFFLINE: it validates arguments and reports what WOULD be
# written without authenticating or reaching the vault at all.
if [ "$DRY" = 1 ]; then
  info "DRY RUN — would create-or-update item: $ITEM"
  for spec in "${FIELDS[@]:-}"; do [ -n "$spec" ] && info "  field:      ${spec%%=*} (from ${spec#*=@})"; done
  for f in "${ATTACHMENTS[@]:-}"; do [ -n "$f" ] && info "  attachment: $(basename "$f") ($(wc -c <"$f") bytes)"; done
  exit 0
fi

# --- trust the server's TLS cert (bw is node → NODE_EXTRA_CA_CERTS) ---
# Same TOFU handling as secrets-pull.sh: the vault serves a self-signed cert, so without this
# every bw call fails with a TLS error that looks like a config problem.
if [ -n "${VAULT_CACERT:-}" ] && [ -f "${VAULT_CACERT}" ]; then
  export NODE_EXTRA_CA_CERTS="$VAULT_CACERT"
else
  # NOT gated on BW_SESSION: the pinned cert is needed for EVERY network call, so skipping
  # it when a session is supplied made sync/list fail silently and look like "collection not found".
  hp="${VAULT_URL#*://}"; hp="${hp%%/*}"
  cf="$(mktemp)"; trap 'rm -f "$cf"' EXIT
  { echo | openssl s_client -connect "$hp" 2>/dev/null | openssl x509 >"$cf"; } 2>/dev/null || true
  if [ -s "$cf" ]; then
    export NODE_EXTRA_CA_CERTS="$cf"
    info "pinned the server's TLS cert for this run (TOFU — set VAULT_CACERT to a trusted cert to avoid)"
  fi
fi

# --- authenticate (reuse a session; else unlock with a password read from a FILE) ---
if [ -z "${BW_SESSION:-}" ]; then
  cur_srv="$("$BW" status 2>/dev/null | sed -n 's/.*"serverUrl":"\([^"]*\)".*/\1/p')"
  if [ "$cur_srv" != "$VAULT_URL" ]; then
    # bw rejects a server change while logged in — only touch it when it actually differs.
    "$BW" config server "$VAULT_URL" >/dev/null 2>&1 || die "could not point bw at $VAULT_URL (log out first?)"
  fi
  st="$("$BW" status 2>/dev/null | sed -n 's/.*"status":"\([a-z]*\)".*/\1/p')"
  if [ "$st" = "unauthenticated" ]; then
    [ -n "$VAULT_EMAIL" ] || die "VAULT_EMAIL not set (needed to log in)"
    if [ -n "${BW_PASSWORD_FILE:-}" ]; then
      BW_PASSWORD="$(cat "$BW_PASSWORD_FILE")" "$BW" login "$VAULT_EMAIL" --passwordenv BW_PASSWORD >/dev/null \
        || die "bw login failed"
    else
      "$BW" login "$VAULT_EMAIL" >/dev/null || die "bw login failed"
    fi
  fi
  if [ -n "${BW_PASSWORD_FILE:-}" ]; then
    [ -f "$BW_PASSWORD_FILE" ] || die "BW_PASSWORD_FILE does not exist: $BW_PASSWORD_FILE"
    BW_SESSION="$(BW_PASSWORD="$(cat "$BW_PASSWORD_FILE")" "$BW" unlock --passwordenv BW_PASSWORD --raw)" \
      || die "bw unlock failed (wrong master password?)"
  else
    BW_SESSION="$("$BW" unlock --raw)" || die "bw unlock failed"
  fi
  export BW_SESSION
fi
"$BW" sync >/dev/null 2>&1 || info "warning: bw sync failed — working from the local cache"

# --- resolve the target collection (and its organization) ---
COLL_JSON="$("$BW" list collections --search "${VAULT_COLLECTION##*/}" 2>/dev/null || echo '[]')"
# A python heredoc (not -c) so quoting does not have to survive two levels of shell escaping.
# NOTE: `python3 -` reads its PROGRAM from stdin, so JSON cannot also be piped in — the heredoc
# wins and stdin is empty. Pass the payload through the environment instead.
COLL_LINE="$(COLL_JSON="$COLL_JSON" VAULT_COLLECTION="$VAULT_COLLECTION" python3 - <<'PYC'
import json, os
want = os.environ["VAULT_COLLECTION"]
raw = (os.environ.get("COLL_JSON") or "").strip()
items = json.loads(raw) if raw else []
# match the full configured name, or its last path segment (vault names are flat)
hit = next((c for c in items if c.get("name") == want or c.get("name") == want.split("/")[-1]),
           items[0] if len(items) == 1 else None)
print((hit["id"] + " " + (hit.get("organizationId") or "")) if hit else "")
PYC
)"
COLL_ID="${COLL_LINE%% *}"; ORG_ID="${COLL_LINE##* }"
[ "$ORG_ID" = "$COLL_ID" ] && ORG_ID=""
[ -n "${COLL_ID:-}" ] || die "collection not found: $VAULT_COLLECTION (check VAULT_COLLECTION)"
info "collection: $VAULT_COLLECTION"

# --- find an existing item with this exact name (idempotent upsert) ---
ITEMS_JSON="$("$BW" list items --search "$ITEM" 2>/dev/null || true)"
ITEM_ID="$(ITEMS_JSON="$ITEMS_JSON" ITEM_NAME="$ITEM" python3 - <<'PYI'
import json, os
want = os.environ["ITEM_NAME"]
raw = (os.environ.get("ITEMS_JSON") or "").strip()
items = json.loads(raw) if raw else []   # empty output = no match, not an error
print(next((i["id"] for i in items if i.get("name") == want), ""))
PYI
)"


# --- build the item JSON (secure note; hidden custom fields; values read from files) ---
ITEM_JSON="$(python3 - "$ITEM" "$COLL_ID" "$ORG_ID" "${NOTE_FILE}" "${FIELDS[@]:-}" <<'PY'
import json, sys, pathlib
name, coll, org, note_file, *field_specs = sys.argv[1:]
fields = []
for spec in field_specs:
    if not spec:
        continue
    fname, src = spec.split("=@", 1)
    # type 1 = hidden field, so the value is masked in the web vault UI
    fields.append({"name": fname, "value": pathlib.Path(src).read_text().strip(), "type": 1})
item = {
    "type": 2,  # secure note
    "name": name,
    "notes": pathlib.Path(note_file).read_text() if note_file else None,
    "secureNote": {"type": 0},
    "collectionIds": [coll],
    "fields": fields,
}
if org:
    item["organizationId"] = org
print(json.dumps(item))
PY
)"

if [ -n "$ITEM_ID" ]; then
  # Merge onto the live item so unrelated existing fields/notes are not dropped.
  MERGED="$("$BW" get item "$ITEM_ID" | python3 -c '
import json, sys
cur = json.load(sys.stdin)
new = json.loads(sys.argv[1])
by_name = {f["name"]: f for f in (cur.get("fields") or [])}
for f in new.get("fields") or []:
    by_name[f["name"]] = f
cur["fields"] = list(by_name.values())
if new.get("notes"):
    cur["notes"] = new["notes"]
print(json.dumps(cur))
' "$ITEM_JSON")"
  printf '%s' "$MERGED" | "$BW" encode | "$BW" edit item "$ITEM_ID" >/dev/null \
    || die "failed to update item: $ITEM"
  info "updated item: $ITEM"
else
  ITEM_ID="$(printf '%s' "$ITEM_JSON" | "$BW" encode | "$BW" create item | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')" \
    || die "failed to create item: $ITEM"
  info "created item: $ITEM"
fi

# --- attachments: replace any same-named attachment, then upload ---
for f in "${ATTACHMENTS[@]:-}"; do
  [ -n "$f" ] || continue
  base="$(basename "$f")"
  old="$("$BW" get item "$ITEM_ID" | python3 -c '
import json, sys
print(next((a["id"] for a in (json.load(sys.stdin).get("attachments") or []) if a["fileName"] == sys.argv[1]), ""))
' "$base")"
  [ -n "$old" ] && "$BW" delete attachment "$old" --itemid "$ITEM_ID" >/dev/null 2>&1 && info "replaced existing attachment: $base"
  "$BW" create attachment --file "$f" --itemid "$ITEM_ID" >/dev/null || die "attachment upload failed: $base"
  info "attached: $base ($(wc -c <"$f") bytes)"
done

# --- VERIFY by reading back: a write nobody checked is not custody ---
"$BW" sync >/dev/null 2>&1 || true
rc=0
for spec in "${FIELDS[@]:-}"; do
  [ -n "$spec" ] || continue
  fname="${spec%%=@*}"; src="${spec#*=@}"
  # Compare the CANONICAL stored value on both sides: the field is stored as the source file's
  # content .strip()ed (see the item-build step), so hash that same normalization here. Hashing
  # the raw file (and re-adding a "\n" to the read-back) falsely failed whenever the source file
  # did not end in a trailing newline — the value was stored correctly but verify reported a
  # mismatch. Normalize identically instead of assuming a trailing newline.
  want="$(SRC="$src" python3 -c 'import os,hashlib,pathlib;print(hashlib.sha256(pathlib.Path(os.environ["SRC"]).read_text().strip().encode()).hexdigest())')"
  got="$("$BW" get item "$ITEM_ID" | python3 -c '
import json, sys, hashlib
v = next((f.get("value") for f in (json.load(sys.stdin).get("fields") or []) if f["name"] == sys.argv[1]), None)
print(hashlib.sha256(v.encode()).hexdigest() if v is not None else "MISSING")
' "$fname")"
  if [ "$want" = "$got" ]; then info "verified field: $fname"; else info "VERIFY FAILED for field: $fname"; rc=1; fi
done
for f in "${ATTACHMENTS[@]:-}"; do
  [ -n "$f" ] || continue
  base="$(basename "$f")"; tmp="$(mktemp)"
  if "$BW" get attachment "$base" --itemid "$ITEM_ID" --output "$tmp" >/dev/null 2>&1 \
     && cmp -s "$f" "$tmp"; then
    info "verified attachment: $base (byte-identical round-trip)"
  else
    info "VERIFY FAILED for attachment: $base"; rc=1
  fi
  shred -u "$tmp" 2>/dev/null || rm -f "$tmp"
done
[ "$rc" = 0 ] || die "vault write could NOT be verified — treat the secret as NOT stored"

info "done — item is in the vault and verified by read-back"
info "the local plaintext copy is still on disk: shred it once you are satisfied"
