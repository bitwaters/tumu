#!/bin/sh

set -eu

. "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/lib.sh"

load_env
require_command docker
require_backup_dir
require_var S3_BUCKET

out="$BACKUP_DIR/minio-$S3_BUCKET-$(timestamp_utc).tar.gz"
tmp="$out.tmp"

info "Writing object storage backup to $out"
compose_prod exec -T -e BACKUP_BUCKET="$S3_BUCKET" minio sh -c 'test -d "/data/$BACKUP_BUCKET" && tar -C /data -czf - "$BACKUP_BUCKET"' > "$tmp"
[ -s "$tmp" ] || fail "object storage backup output is empty"
mv "$tmp" "$out"
info "$out"
