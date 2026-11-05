#!/usr/bin/env bash
set -euo pipefail
umask 077
project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_dir"
# Optional shell configuration, kept out of git alongside real environment files.
if [[ -f "${YU_BACKUP_CONFIG:-.env.backup}" ]]; then source "${YU_BACKUP_CONFIG:-.env.backup}"; fi
backup_dir="${YU_BACKUP_DIR:-$project_dir/.backups}"
retention_days="${YU_BACKUP_RETENTION_DAYS:-30}"
[[ "$retention_days" =~ ^[0-9]+$ ]] && ((retention_days >= 7)) || { echo '备份保留天数必须是至少 7 的整数' >&2; exit 1; }
mkdir -p "$backup_dir"
chmod 700 "$backup_dir"
exec 9>"$backup_dir/.backup.lock"
flock -n 9 || { echo '已有备份正在运行' >&2; exit 1; }
docker_context="${YU_DOCKER_CONTEXT:-nas}"
compose=(docker --context "$docker_context" compose --project-directory "$project_dir" -f "${YU_COMPOSE_FILE:-compose.yaml}" -p "${YU_COMPOSE_PROJECT:-yu}" --env-file "${YU_ENV_FILE:-.env.nas}")
partial="$(mktemp "$backup_dir/yu-$(date +%Y%m%d-%H%M%S)-XXXXXX.dump.partial")"
trap 'rm -f "$partial"' EXIT
"${compose[@]}" exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$partial"
# Reject truncated/unreadable archives before publishing or pruning any backup.
"${compose[@]}" exec -T db pg_restore --list < "$partial" > /dev/null
backup_file="${partial%.partial}"
mv "$partial" "$backup_file"
verify="${YU_VERIFY_BACKUP:-weekly}"
if [[ "$verify" == true || ( "$verify" == weekly && "$(date +%u)" == 7 ) ]]; then
  YU_DOCKER_CONTEXT="$docker_context" bash scripts/verify-backup.sh "$backup_file"
fi
find "$backup_dir" -maxdepth 1 -type f -name 'yu-*.dump' -mtime +"$retention_days" -delete
printf '%s 数据库备份已保存：%s\n' "$(date -Iseconds)" "$backup_file"
