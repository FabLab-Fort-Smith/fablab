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

NET=fablab
IMG=mongo:7.0
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

msh() { docker run --rm --network "$NET" -e U="$RURI" -e JS="$1" "$IMG" \
          sh -c 'mongosh "$U" --quiet --eval "$JS"'; }
count_js() { printf 'var d=db.getSiblingDB("%s");var t=0;var n=d.getCollectionNames();n.forEach(function(c){t+=d.getCollection(c).countDocuments({})});print(n.length+" collections, "+t+" docs");' "$1"; }

echo "== 1. take a fresh backup =="
/usr/local/sbin/fablab-backup-mongo | sed 's/^/   /'
ARCHIVE="$(find "$BACKUP_DIR" -maxdepth 1 -name 'mongo-*.archive.gz' -printf '%T@ %p\n' 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2-)"
[ -n "$ARCHIVE" ] || { echo "ERROR: no backup archive in $BACKUP_DIR"; exit 1; }
SIZE="$(stat -c %s "$ARCHIVE")"
echo "   archive: $ARCHIVE (${SIZE} bytes)"
[ "$SIZE" -gt 0 ] || { echo "ERROR: archive is empty — the dump failed (check Mongo auth)"; exit 1; }

echo "== 2. source counts ($SRC_DB) =="
SRC="$(msh "$(count_js "$SRC_DB")")"; echo "   $SRC"

echo "== 3. restore archive into throwaway db '$DRILL_DB' =="
docker run --rm -i --network "$NET" -e U="$RURI" "$IMG" \
  sh -c 'mongorestore --uri="$U" --archive --gzip --drop --nsFrom="'"$SRC_DB"'.*" --nsTo="'"$DRILL_DB"'.*"' \
  < "$ARCHIVE" 2>&1 | tail -2 | sed 's/^/   /'

echo "== 4. verify restored counts ($DRILL_DB) =="
DST="$(msh "$(count_js "$DRILL_DB")")"; echo "   $DST"

echo "== 5. cleanup (drop throwaway db) =="
msh "db.getSiblingDB(\"$DRILL_DB\").dropDatabase();print(\"dropped $DRILL_DB\")" | sed 's/^/   /'

if [ "$SRC" = "$DST" ]; then
  echo "== DRILL PASSED: '$SRC_DB' backs up and restores correctly ($SRC) =="
else
  echo "== DRILL FAILED: source ($SRC) != restored ($DST) =="; exit 1
fi
