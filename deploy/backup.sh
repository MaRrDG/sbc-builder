#!/usr/bin/env bash
# Nightly backup of one FC Solver install: Postgres dump + data/ (without the raw Postgres files).
# Usage: deploy/backup.sh /var/www/fc-solver   (cron: deploy/fc-solver-backup.cron). Keeps 14 days.
# data/ holds extension keys: everything is root-only (dirs 700, files 600).
set -euo pipefail
DIR=${1:?usage: backup.sh <app dir>}
[ -f "$DIR/.env" ] || { echo "[backup] $DIR/.env not found" >&2; exit 1; }
envval() { grep -E "^$1=" "$DIR/.env" | head -n1 | cut -d= -f2- | sed -E "s/^(['\"])(.*)\1[[:space:]]*$/\2/" || true; }
APP=$(envval APP_NAME); APP=${APP:-sbc-builder}
HOOK=$(envval ALERT_WEBHOOK_URL)
ROOT=${BACKUP_ROOT:-/root/backups}/$APP
DAY=$(date +%F)
TMP=$ROOT/.tmp-$DAY
fail() {
  local msg="[backup] $APP failed: ${1:-unknown error}"
  echo "$msg" >&2
  [ -n "$HOOK" ] && curl -fsS -m 10 -H 'Content-Type: application/json' -d "{\"content\":\"**[$APP] backup** failed: ${1:-unknown error}\"}" "$HOOK" >/dev/null || true
  rm -rf "$TMP"
  exit 1
}
trap 'fail "line $LINENO"' ERR
umask 077
mkdir -p "$ROOT"
rm -rf "$TMP" && mkdir -p "$TMP"
docker exec "$APP-db" pg_dump -U fcsolver -Fc fcsolver > "$TMP/db.dump"
[ -s "$TMP/db.dump" ] || fail "empty database dump"
# the app rewrites files while we read (tmp + rename): tar status 1 = "changed/removed", archive is still good
rc=0
tar --zstd --warning=no-file-changed --warning=no-file-removed --ignore-failed-read -C "$DIR" --exclude=./data/postgres -cf "$TMP/data.tar.zst" ./data || rc=$?
[ "$rc" -le 1 ] || fail "tar exit $rc"
chmod 600 "$TMP"/*
rm -rf "${ROOT:?}/$DAY" && mv "$TMP" "$ROOT/$DAY"
find "$ROOT" -mindepth 1 -maxdepth 1 -type d -name '20*' -mtime +13 -exec rm -rf {} +
echo "[backup] $APP $DAY ok: $(du -sh "$ROOT/$DAY" | cut -f1)"
