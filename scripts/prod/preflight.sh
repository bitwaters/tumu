#!/bin/sh

set -eu

. "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/lib.sh"

load_env

require_command docker

for key in \
  POSTGRES_DB \
  POSTGRES_USER \
  POSTGRES_PASSWORD \
  PUBLIC_API_BASE_URL \
  PUBLIC_WEB_BASE_URL \
  API_CORS_ORIGIN \
  S3_BUCKET \
  S3_ACCESS_KEY \
  S3_SECRET_KEY \
  JWT_SECRET \
  BACKUP_DIR \
  SMOKE_USERNAME \
  SMOKE_PASSWORD
do
  require_var "$key"
done

reject_placeholder_secret POSTGRES_PASSWORD
reject_placeholder_secret S3_ACCESS_KEY
reject_placeholder_secret S3_SECRET_KEY
reject_placeholder_secret JWT_SECRET
reject_placeholder_secret SMOKE_PASSWORD
[ -z "${SEED_DEMO_PASSWORD:-}" ] || reject_placeholder_secret SEED_DEMO_PASSWORD
[ -z "${SEED_ADMIN_PASSWORD:-}" ] || reject_placeholder_secret SEED_ADMIN_PASSWORD
[ -z "${SEED_USER_PASSWORD:-}" ] || reject_placeholder_secret SEED_USER_PASSWORD

[ ${#JWT_SECRET} -ge 32 ] || fail "JWT_SECRET must be at least 32 characters"
require_backup_dir

compose_prod config --quiet

info "Production preflight passed."
