#!/usr/bin/env bash
set -euo pipefail

echo "[deploy] pulling..."
git fetch --all
git pull --rebase

echo "[deploy] building images..."
docker compose build --no-cache --pull

echo "[deploy] starting..."
docker compose up -d

echo "[deploy] pruning old images..."
docker image prune -f

echo "[deploy] done"
