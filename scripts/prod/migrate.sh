#!/bin/sh

set -eu

. "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/lib.sh"

load_env
require_command docker
require_var POSTGRES_DB
require_var POSTGRES_USER
require_var POSTGRES_PASSWORD
reject_placeholder_secret POSTGRES_PASSWORD

info "Running production database migrations..."
compose_prod run --rm api npm --workspace @site-management/api run prisma:migrate
info "Production database migrations completed."
