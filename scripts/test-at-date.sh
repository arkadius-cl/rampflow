#!/usr/bin/env bash
# Runs the package and API test suites as if today were shifted by <offset>, for Node and Postgres.
#
#   scripts/test-at-date.sh +40d [vitest args...]   offsets as libfaketime reads them: +10d, -3d, +400d, +0d
#
# Both clocks move together through libfaketime: a throwaway Postgres 18 container on a free port,
# and the test runner in a Node 24 container with the repo mounted at its host path, so
# scripts/checkout-env.mjs derives this checkout's database names. Shifting only one side produces
# failures that cannot happen in reality. Mail still goes to the shared Mailpit on localhost.
set -euo pipefail

offset=${1:?usage: scripts/test-at-date.sh <offset, e.g. +40d> [vitest args...]}
shift
[[ $offset =~ ^[+-][0-9]+[smhdy]$ ]] || { echo "offset must look like +40d or -3d, got $offset" >&2; exit 2; }

root=$(cd "$(dirname "$0")/.." && pwd)
pg_image=localhost/rampflow-faketime-postgres:18
node_image=localhost/rampflow-faketime-node:24

build() {
  podman image exists "$1" || printf 'FROM %s\nRUN %s\n' "$2" "$3" | podman build -t "$1" -f - "$root/infra"
}
build "$pg_image" docker.io/library/postgres:18-alpine 'apk add --no-cache libfaketime'
build "$node_image" docker.io/library/node:24-bookworm-slim \
  'apt-get update && apt-get install -y --no-install-recommends faketime && rm -rf /var/lib/apt/lists/*'

port=$(node -e "const s = require('node:net').createServer().listen(0, () => { console.log(s.address().port); s.close(); })")
pg_name="rampflow-at-date-$$-pg"
runner_name="rampflow-at-date-$$-runner"
cleanup() { podman rm -f "$runner_name" "$pg_name" >/dev/null 2>&1 || true; }
trap cleanup EXIT

faketime_env=(-e "FAKETIME=$offset" -e FAKETIME_DONT_FAKE_MONOTONIC=1)

podman run -d --rm --name "$pg_name" -p "127.0.0.1:$port:5432" \
  -e POSTGRES_DB=rampflow -e POSTGRES_USER=rampflow -e POSTGRES_PASSWORD=rampflow \
  "${faketime_env[@]}" -e LD_PRELOAD=/usr/lib/faketime/libfaketime.so.1 \
  -v "$root/infra/postgres/init:/docker-entrypoint-initdb.d:ro,z" \
  --tmpfs /var/lib/postgresql \
  "$pg_image" >/dev/null

# The entrypoint restarts the server after the init scripts; wait for the final one on TCP.
for _ in $(seq 60); do
  podman exec "$pg_name" pg_isready -h 127.0.0.1 -U rampflow -d rampflow >/dev/null 2>&1 && break
  sleep 1
done
podman exec "$pg_name" pg_isready -h 127.0.0.1 -U rampflow -d rampflow >/dev/null
echo "postgres: $(podman exec "$pg_name" psql -U rampflow -d rampflow -Atc 'select now()')"

db=$(node "$root/scripts/checkout-env.mjs" | sed -n 's|^DATABASE_URL=.*/||p')
podman run --rm --name "$runner_name" --network host \
  "${faketime_env[@]}" -e LD_PRELOAD=/usr/lib/x86_64-linux-gnu/faketime/libfaketime.so.1 \
  -e DATABASE_URL="postgres://rampflow_app:rampflow_app@localhost:$port/$db" \
  -e MIGRATION_DATABASE_URL="postgres://rampflow:rampflow@localhost:$port/$db" \
  -e TZ="$(readlink /etc/localtime | sed 's|.*/zoneinfo/||')" \
  -v "$root:$root:z" -w "$root" \
  "$node_image" sh -c '
    echo "node: $(date -u +%FT%TZ)"
    for dir in packages/shared packages/i18n apps/api; do
      echo "== $dir"
      (cd "$dir" && node ../../scripts/checkout-env.mjs run -- node_modules/.bin/vitest run --passWithNoTests "$@") || status=1
    done
    exit ${status:-0}
  ' sh "$@"
