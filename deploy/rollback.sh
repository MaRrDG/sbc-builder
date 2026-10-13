#!/usr/bin/env bash
# Go back to the image that ran before the last release.sh. Code in the folder stays at the new
# commit; the database keeps any new migration (migrations are additive, so the old code runs on it).
set -euo pipefail
DIR=${1:?usage: rollback.sh <app dir>}
[ -f "$DIR/.env" ] || { echo "[rollback] $DIR/.env not found" >&2; exit 1; }
envval() { grep -E "^$1=" "$DIR/.env" | head -n1 | cut -d= -f2- | sed -E "s/^(['\"])(.*)\1[[:space:]]*$/\2/" || true; }
cd "$DIR"
APP=$(envval APP_NAME); APP=${APP:-sbc-builder}
docker image inspect "$APP:prev" >/dev/null 2>&1 || { echo "[rollback] no $APP:prev image: nothing to go back to" >&2; exit 1; }
docker tag "$APP:prev" "$APP:latest"
docker compose up -d --no-build
echo "[rollback] $APP back on the previous image; check: docker inspect -f '{{.State.Health.Status}}' $APP"
