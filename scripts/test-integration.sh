#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_dir"
docker_context="${YU_TEST_DOCKER_CONTEXT:-$(docker context show)}"
# Unique project names isolate concurrent runs and cleanup from any existing stack.
project="yu-ci-$(date +%s)-$$"
compose=(docker --context "$docker_context" compose --project-directory "$project_dir" -p "$project" -f compose.ci.yaml --env-file /dev/null)
cleanup() {
  result=$?
  if ((result != 0)); then "${compose[@]}" logs --no-color --tail 100 app migrate tests; fi
  "${compose[@]}" down -v --remove-orphans > /dev/null
  exit "$result"
}
trap cleanup EXIT
"${compose[@]}" build
"${compose[@]}" up -d --wait --wait-timeout 180 app
"${compose[@]}" run --rm --no-deps tests
# Exercise the same backup and restore scripts used for scheduled real backups.
backup_dir="$(mktemp -d)"
if ! YU_BACKUP_CONFIG=/dev/null YU_DOCKER_CONTEXT="$docker_context" YU_COMPOSE_FILE=compose.ci.yaml YU_COMPOSE_PROJECT="$project" YU_ENV_FILE=/dev/null YU_BACKUP_DIR="$backup_dir" YU_VERIFY_BACKUP=true bash scripts/backup.sh; then
  rm -rf "$backup_dir"
  exit 1
fi
rm -rf "$backup_dir"
