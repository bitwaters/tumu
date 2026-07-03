#!/bin/sh

set -eu

. "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/lib.sh"

load_env
require_command docker
require_backup_dir
require_var POSTGRES_DB
require_var POSTGRES_USER

out="$BACKUP_DIR/postgres-$POSTGRES_DB-$(timestamp_utc).dump"
tmp="$out.tmp"

info "Writing PostgreSQL backup to $out"
compose_prod exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc > "$tmp"
[ -s "$tmp" ] || fail "database backup output is empty"
mv "$tmp" "$out"
info "$out"
