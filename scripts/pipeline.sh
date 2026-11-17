#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "1. Test"
npm ci
npm test
npx tsc --noEmit

echo "2. Build"
docker compose build

echo "3. Deploy"
docker compose up -d

for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  if curl -sf "http://127.0.0.1:${PORT:-8010}/health"; then
    echo
    exit 0
  fi
  sleep 1
done

echo "The deployment did not become healthy." >&2
exit 1
