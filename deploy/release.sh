#!/usr/bin/env bash
# Release one install: keep the running image as :prev, pull, rebuild, wait for healthy.
# Usage: deploy/release.sh /var/www/fc-solver     Undo: deploy/rollback.sh /var/www/fc-solver
set -euo pipefail
DIR=${1:?usage: release.sh <app dir>}
cd "$DIR"
APP=$(grep -E '^APP_NAME=' .env | cut -d= -f2- || true); APP=${APP:-sbc-builder}
PROFILE=(); grep -qE '^DISCORD_TOKEN=.+' .env && PROFILE=(--profile discord)
docker image inspect "$APP:latest" >/dev/null 2>&1 && docker tag "$APP:latest" "$APP:prev"
git pull --ff-only
docker compose "${PROFILE[@]}" up -d --build
for _ in $(seq 1 36); do
  state=$(docker inspect -f '{{.State.Health.Status}}' "$APP" 2>/dev/null || echo missing)
  [ "$state" = healthy ] && { echo "[release] $APP healthy at $(git log --oneline -1)"; exit 0; }
  sleep 5
done
echo "[release] $APP not healthy after 3 min (state: $state). Undo: deploy/rollback.sh $DIR" >&2
exit 1
