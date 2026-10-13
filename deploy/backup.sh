#!/usr/bin/env bash
# Nightly backup of one FC Solver install: Postgres dump + data/ (without the raw Postgres files).
# Usage: deploy/backup.sh /var/www/fc-solver   (cron: deploy/fc-solver-backup.cron). Keeps 14 days.
# data/ holds extension keys: everything is root-only (dirs 700, files 600).
set -euo pipefail
DIR=${1:?usage: backup.sh <app dir>}
APP=$(grep -E '^APP_NAME=' "$DIR/.env" | cut -d= -f2- || true); APP=${APP:-sbc-builder}
HOOK=$(grep -E '^ALERT_WEBHOOK_URL=' "$DIR/.env" | cut -d= -f2- || true)
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
tar --zstd -C "$DIR" --exclude=./data/postgres -cf "$TMP/data.tar.zst" ./data
chmod 600 "$TMP"/*
rm -rf "${ROOT:?}/$DAY" && mv "$TMP" "$ROOT/$DAY"
find "$ROOT" -mindepth 1 -maxdepth 1 -type d -name '20*' -mtime +14 -exec rm -rf {} +
echo "[backup] $APP $DAY ok: $(du -sh "$ROOT/$DAY" | cut -f1)"
