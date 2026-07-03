#!/bin/sh

set -eu

. "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/lib.sh"

load_env
require_var RESTORE_DATABASE_URL

dump_path=${1:-}
[ -n "$dump_path" ] || fail "usage: RESTORE_DATABASE_URL=postgresql://... sh scripts/prod/restore-db.sh /path/to/backup.dump"
[ -f "$dump_path" ] || fail "backup file not found: $dump_path"
[ -s "$dump_path" ] || fail "backup file is empty: $dump_path"
[ "${RESTORE_CONFIRM:-}" = "RESTORE_DATABASE" ] || fail "set RESTORE_CONFIRM=RESTORE_DATABASE to confirm restore target"
require_command pg_restore

info "Restoring PostgreSQL backup into explicit RESTORE_DATABASE_URL target..."
pg_restore --clean --if-exists --no-owner --dbname "$RESTORE_DATABASE_URL" "$dump_path"
info "Database restore completed. Run npm run prod:smoke against the restored environment."
