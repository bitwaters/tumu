#!/bin/sh

set -eu

. "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/lib.sh"

load_env
require_command docker
require_var S3_BUCKET

archive_path=${1:-}
[ -n "$archive_path" ] || fail "usage: RESTORE_CONFIRM=RESTORE_OBJECTS sh scripts/prod/restore-objects.sh /path/to/minio-bucket.tar.gz"
[ -f "$archive_path" ] || fail "object backup archive not found: $archive_path"
[ -s "$archive_path" ] || fail "object backup archive is empty: $archive_path"
[ "${RESTORE_CONFIRM:-}" = "RESTORE_OBJECTS" ] || fail "set RESTORE_CONFIRM=RESTORE_OBJECTS to confirm object restore target"

info "Restoring object storage archive into configured MinIO bucket target..."
compose_prod exec -T -e RESTORE_BUCKET="$S3_BUCKET" minio sh -c 'mkdir -p "/data/$RESTORE_BUCKET"'
compose_prod exec -T minio tar -C /data -xzf - < "$archive_path"
info "Object storage restore completed. Run npm run prod:smoke against the restored environment."
