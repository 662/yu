#!/usr/bin/env bash
# Restore only into a new, isolated, disposable PostgreSQL container.
set -euo pipefail
[[ $# == 1 && -s "$1" ]] || { echo '用法：bash scripts/verify-backup.sh <备份.dump>' >&2; exit 1; }
docker_cli=(docker --context "${YU_DOCKER_CONTEXT:-nas}")
container=''
cleanup() { if [[ -n "$container" ]]; then "${docker_cli[@]}" rm -fv "$container" > /dev/null; fi; }
trap cleanup EXIT
container="$("${docker_cli[@]}" run -d --network none --label yu.backup-verification=true -e POSTGRES_HOST_AUTH_METHOD=trust "${YU_BACKUP_POSTGRES_IMAGE:-postgres:18}")"
ready=false
for ((attempt=0; attempt<60; attempt++)); do
  # The image's temporary initialization server only accepts Unix sockets.
  if "${docker_cli[@]}" exec "$container" pg_isready -h 127.0.0.1 -U postgres > /dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
[[ "$ready" == true ]] || { echo '恢复验证数据库启动失败' >&2; exit 1; }
"${docker_cli[@]}" exec -i "$container" pg_restore -U postgres -d postgres --exit-on-error --no-owner --no-privileges < "$1"
"${docker_cli[@]}" exec -i "$container" psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
DO $$
BEGIN
  IF EXISTS (SELECT transaction_id FROM journal_entries GROUP BY transaction_id HAVING sum(amount) <> 0 OR count(*) <> 2) THEN
    RAISE EXCEPTION 'Restored journal is unbalanced';
  END IF;
  IF EXISTS (SELECT 1 FROM transactions t LEFT JOIN journal_entries j ON j.transaction_id=t.id WHERE j.transaction_id IS NULL) THEN
    RAISE EXCEPTION 'Restored transactions have missing journals';
  END IF;
END $$;
SELECT 'restore verified' AS result,
  (SELECT count(*) FROM books) AS books,
  (SELECT count(*) FROM transactions) AS transactions,
  (SELECT count(*) FROM import_receipts) AS receipts;
SQL
printf '备份已通过隔离恢复验证：%s\n' "$1"
