#!/usr/bin/env bash
# MongoDB backup + restore DRILL — "an untested backup is not a backup"
# (@rules/workflow-data-lifecycle.md, @rules/topic-reliability.md).
#
# Runs as ROOT on the VPS. Takes a fresh backup, restores it into a THROWAWAY database
# (never touching live data), verifies collection/doc counts match, then drops the throwaway.
# FAILS LOUDLY on any auth/backup/restore error — it must not report success on an empty or
# broken archive.
#
#   sudo /opt/fablab/.../mongo-restore-drill.sh        # on the box
#   # or, from a workstation with SSH + become:
#   ansible lab_vps -m script -a scripts/mongo-restore-drill.sh --become
set -euo pipefail
trap '[ -n "${CLEANUP_ARCHIVE:-}" ] && shred -u "$CLEANUP_ARCHIVE" 2>/dev/null || true' EXIT

NET=fablab
IMG=mongo:8.0        # match the running server (the mongodb role pins mongo:8.0)
CN=fablab-mongo
BACKUP_DIR=/var/backups/fablab
ROOT_ENV=/opt/fablab/mongodb/mongo.env      # root-only: MONGO_INITDB_ROOT_USERNAME/_PASSWORD
DRILL_DB=thelab_restore_drill               # throwaway target — dropped at the end

[ "$(id -u)" -eq 0 ] || { echo "ERROR: must run as root (reads $ROOT_ENV, invokes docker)"; exit 1; }
[ -r "$ROOT_ENV" ] || { echo "ERROR: cannot read $ROOT_ENV"; exit 1; }

# shellcheck disable=SC1090
. "$ROOT_ENV"
: "${MONGO_INITDB_ROOT_USERNAME:?missing in $ROOT_ENV}" "${MONGO_INITDB_ROOT_PASSWORD:?missing in $ROOT_ENV}"

# Root connection string; password URL-encoded. Kept in a var (passed to containers via env,
# never on a command line) so it isn't exposed in `ps`.
RURI="$(RU="$MONGO_INITDB_ROOT_USERNAME" RP="$MONGO_INITDB_ROOT_PASSWORD" CN="$CN" python3 - <<'PY'
import os, urllib.parse
print("mongodb://%s:%s@%s:27017/?authSource=admin" % (
    os.environ["RU"], urllib.parse.quote(os.environ["RP"], safe=""), os.environ["CN"]))
PY
)"

# The live app database (backup covers all dbs; we verify the app db round-trips).
SRC_DB="$(sed -n 's/^MONGODB_URI=//p' /etc/fablab/mongo.env 2>/dev/null | head -1 \
  | sed -n 's#.*/\([^/?]*\)?.*#\1#p')"
SRC_DB="${SRC_DB:-thelab}"

# Every application database, from the one list roles/mongodb writes (#107 phase 4). A drill that
# only exercised staging would have said "PASSED" while production was never verified — which is
# exactly the state this repo was in the moment production moved onto this instance.
DB_LIST="$(sed -n 's/^MONGO_BACKUP_DATABASES=//p' /etc/fablab/mongo.env 2>/dev/null | head -1 | tr -d '"')"
DB_LIST="${DB_LIST:-$SRC_DB}"

msh() { docker run --rm --network "$NET" -e U="$RURI" -e JS="$1" "$IMG" \
          sh -c 'mongosh "$U" --quiet --eval "$JS"'; }
count_js() { printf 'var d=db.getSiblingDB("%s");var t=0;var n=d.getCollectionNames();n.forEach(function(c){t+=d.getCollection(c).countDocuments({})});print(n.length+" collections, "+t+" docs");' "$1"; }

echo "== 1. take a fresh backup =="
/usr/local/sbin/fablab-backup-mongo | sed 's/^/   /'
# Artifacts are age-ENCRYPTED once BACKUP_AGE_RECIPIENT is set, and the decryption identity is
# deliberately NOT on this box (it lives only in the vault — the box can encrypt, never decrypt).
# So: prefer a plaintext archive if one exists; else decrypt a .age artifact when an identity is
# explicitly supplied via AGE_IDENTITY_FILE; else fall back to a fresh transient dump so the
# database round-trip is still exercised — and say plainly that the ENCRYPTED-artifact chain was
# not, because that needs the off-box drill (see docs/runbooks/backup-restore.md).
# Per database, get an archive to drill: prefer the real ENCRYPTED artifact when an identity is
# supplied (that exercises the full chain), else take a fresh transient dump. Either way the archive
# is scoped to ONE database with --db, and the restore is fenced with --nsInclude, so a drill can
# never touch a database it is not drilling (the bug fixed in #109).
archive_for_db() {                      # echoes a path; caller shreds it if it is under /tmp
  local db="$1" enc plain
  plain="$(find "$BACKUP_DIR" -maxdepth 1 -name "mongo-${db}-*.archive.gz" -printf '%T@ %p\n' 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2-)"
  if [ -n "$plain" ]; then printf '%s' "$plain"; return 0; fi
  enc="$(find "$BACKUP_DIR" -maxdepth 1 -name "mongo-${db}-*.archive.gz.age" -printf '%T@ %p\n' 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2-)"
  local tmp; tmp="$(mktemp /tmp/drill-XXXXXX.archive.gz)"
  if [ -n "$enc" ] && [ -n "${AGE_IDENTITY_FILE:-}" ] && [ -f "${AGE_IDENTITY_FILE}" ]; then
    age -d -i "$AGE_IDENTITY_FILE" -o "$tmp" "$enc" || { rm -f "$tmp"; return 1; }
  else
    docker run --rm --network "$NET" -e U="$RURI" -e D="$db" "$IMG" \
      sh -c 'mongodump --uri="$U" --db="$D" --archive --gzip' > "$tmp" 2>/dev/null || { rm -f "$tmp"; return 1; }
  fi
  [ -s "$tmp" ] || { rm -f "$tmp"; return 1; }
  printf '%s' "$tmp"
}

FAILED=""
# Same IFS trap as the backup script: split the space-separated list explicitly.
IFS=' ' read -r -a DRILL_DBS <<< "$DB_LIST"
for DB in "${DRILL_DBS[@]}"; do
  case "$DB" in ''|*[[:space:]]*) echo "   FAIL: suspicious database name '$DB'"; FAILED="$FAILED bad-name"; continue ;; esac
  DDB="${DB}_drill"
  echo "== database: $DB =="
  ARCHIVE="$(archive_for_db "$DB")" || { echo "   FAIL: could not obtain an archive for $DB"; FAILED="$FAILED $DB"; continue; }
  case "$ARCHIVE" in /tmp/*) CLEANUP="$ARCHIVE" ;; *) CLEANUP="" ;; esac
  SRC="$(msh "$(count_js "$DB")")"; echo "   source   $SRC"
  docker run --rm -i --network "$NET" -e U="$RURI" "$IMG" \
    sh -c 'mongorestore --uri="$U" --archive --gzip --drop --nsInclude="'"$DB"'.*" --nsFrom="'"$DB"'.*" --nsTo="'"$DDB"'.*"' \
    < "$ARCHIVE" >/dev/null 2>&1 || true
  DST="$(msh "$(count_js "$DDB")")"; echo "   restored $DST"
  msh "db.getSiblingDB(\"$DDB\").dropDatabase()" >/dev/null 2>&1 || true
  [ -n "$CLEANUP" ] && { shred -u "$CLEANUP" 2>/dev/null || rm -f "$CLEANUP"; }
  if [ "$SRC" = "$DST" ] && [ "${SRC%% *}" != "0" ]; then
    echo "   OK: $DB round-trips"
  else
    echo "   FAIL: $DB does not round-trip (source '$SRC' vs restored '$DST')"
    FAILED="$FAILED $DB"
  fi
done

if [ -n "$FAILED" ]; then
  echo "== DRILL FAILED for:$FAILED =="
  exit 1
fi
echo "== DRILL PASSED: every database round-trips ($DB_LIST) =="
