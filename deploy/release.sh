#!/usr/bin/env bash
# Release one install: keep the running (healthy) image as :prev, pull, rebuild, wait for healthy.
# The Discord bot starts only where that install's .env has COMPOSE_PROFILES=discord (prod yes, dev never).
# Usage: deploy/release.sh /var/www/fc-solver     Undo: deploy/rollback.sh /var/www/fc-solver
set -euo pipefail
DIR=${1:?usage: release.sh <app dir>}
[ -f "$DIR/.env" ] || { echo "[release] $DIR/.env not found" >&2; exit 1; }
envval() { grep -E "^$1=" "$DIR/.env" | head -n1 | cut -d= -f2- | sed -E "s/^(['\"])(.*)\1[[:space:]]*$/\2/" || true; }
cd "$DIR"
APP=$(envval APP_NAME); APP=${APP:-sbc-builder}
# keep the last GOOD image: tag :prev only while the running container is healthy
if [ "$(docker inspect -f '{{.State.Health.Status}}' "$APP" 2>/dev/null || true)" = healthy ]; then docker tag "$(docker inspect -f '{{.Image}}' "$APP")" "$APP:prev"; fi
git pull --ff-only
docker compose up -d --build || { echo "[release] $APP: compose up failed. Undo: deploy/rollback.sh $DIR" >&2; exit 1; }
state=missing
for _ in $(seq 1 36); do
  state=$(docker inspect -f '{{.State.Health.Status}}' "$APP" 2>/dev/null || echo missing)
  [ "$state" = healthy ] && { echo "[release] $APP healthy at $(git log --oneline -1)"; docker image prune -f >/dev/null || true; exit 0; }
  sleep 5
done
echo "[release] $APP not healthy after 3 min (state: $state). Undo: deploy/rollback.sh $DIR" >&2
exit 1
