#!/usr/bin/env bash
# Go back to the image that ran before the last release.sh. Code in the folder stays at the new
# commit; the database keeps any new migration (migrations are additive, so the old code runs on it).
set -euo pipefail
DIR=${1:?usage: rollback.sh <app dir>}
cd "$DIR"
APP=$(grep -E '^APP_NAME=' .env | cut -d= -f2- || true); APP=${APP:-sbc-builder}
docker image inspect "$APP:prev" >/dev/null 2>&1 || { echo "[rollback] no $APP:prev image: nothing to go back to" >&2; exit 1; }
PROFILE=(); grep -qE '^DISCORD_TOKEN=.+' .env && PROFILE=(--profile discord)
docker tag "$APP:prev" "$APP:latest"
docker compose "${PROFILE[@]}" up -d --no-build
echo "[rollback] $APP back on the previous image; check: docker inspect -f '{{.State.Health.Status}}' $APP"
