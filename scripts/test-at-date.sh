#!/usr/bin/env bash
# Runs the API and package test suites as if today were shifted by <offset>, for Node and Postgres.
#
#   scripts/test-at-date.sh +40d [vitest args...]   offsets as libfaketime reads them: +10d, -3d, +400d, +0d
#
# Both clocks move together through libfaketime: a throwaway Postgres 18 container on a free port,
# and the test runner in a Node 24 container with the repo mounted. Shifting only one side produces
# failures that cannot happen in reality. Mail still goes to the shared Mailpit on localhost.
set -euo pipefail

offset=${1:?usage: scripts/test-at-date.sh <offset, e.g. +40d> [vitest args...]}
shift
[[ $offset =~ ^[+-][0-9]+[smhdy]$ ]] || { echo "offset must look like +40d or -3d, got $offset" >&2; exit 2; }

root=$(cd "$(dirname "$0")/.." && pwd)
pg_image=localhost/rampflow-faketime-postgres:18
node_image=localhost/rampflow-faketime-node:24

if ! podman image exists "$pg_image"; then
  podman build -t "$pg_image" - <<'EOF'
FROM docker.io/library/postgres:18-alpine
RUN apk add --no-cache libfaketime
EOF
fi
if ! podman image exists "$node_image"; then
  podman build -t "$node_image" - <<'EOF'
FROM docker.io/library/node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends faketime && rm -rf /var/lib/apt/lists/*
EOF
fi

port=$(node -e "const s = require('node:net').createServer().listen(0, () => { console.log(s.address().port); s.close(); })")
pg_name="rampflow-at-date-$$"
cleanup() { podman rm -f "$pg_name" >/dev/null 2>&1 || true; }
trap cleanup EXIT

faketime_env=(-e "FAKETIME=$offset" -e FAKETIME_DONT_FAKE_MONOTONIC=1)

podman run -d --rm --name "$pg_name" -p "127.0.0.1:$port:5432" \
  -e POSTGRES_DB=rampflow -e POSTGRES_USER=rampflow -e POSTGRES_PASSWORD=rampflow \
  "${faketime_env[@]}" -e LD_PRELOAD=/usr/lib/faketime/libfaketime.so.1 \
  -v "$root/infra/postgres/init:/docker-entrypoint-initdb.d:ro,z" \
  --tmpfs /var/lib/postgresql \
  "$pg_image" >/dev/null

for _ in $(seq 60); do
  # The entrypoint restarts the server after the init scripts; wait for the final one on TCP.
  podman exec "$pg_name" pg_isready -h 127.0.0.1 -U rampflow -d rampflow >/dev/null 2>&1 && break
  sleep 1
done
podman exec "$pg_name" pg_isready -h 127.0.0.1 -U rampflow -d rampflow >/dev/null

db=$(node "$root/scripts/checkout-env.mjs" | sed -n 's|^DATABASE_URL=.*/||p')
db_url="postgres://rampflow_app:rampflow_app@localhost:$port/$db"
owner_url="postgres://rampflow:rampflow@localhost:$port/$db"

podman run --rm --network host --userns keep-id -u "$(id -u):$(id -g)" \
  "${faketime_env[@]}" -e LD_PRELOAD=/usr/lib/x86_64-linux-gnu/faketime/libfaketime.so.1 \
  -e DATABASE_URL="$db_url" -e MIGRATION_DATABASE_URL="$owner_url" -e TZ="$(readlink /etc/localtime | sed "s|.*/zoneinfo/||")" \
  -v "$root:/work:z" -w /work \
  "$node_image" sh -c '
    echo "node: $(date -u +%FT%TZ)"
    for dir in packages/shared packages/i18n apps/api; do
      echo "== $dir"
      (cd "$dir" && node /work/scripts/checkout-env.mjs run -- node_modules/.bin/vitest run "$@") || status=1
    done
    exit ${status:-0}
  ' sh "$@" &
runner=$!
echo "postgres: $(podman exec "$pg_name" psql -U rampflow -d rampflow -Atc 'select now()')"
wait $runner
