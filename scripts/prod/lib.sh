#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)
ENV_FILE=${ENV_FILE:-"$PROJECT_ROOT/.env.production"}
COMPOSE_FILE=${COMPOSE_FILE:-"$PROJECT_ROOT/docker-compose.yml"}

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

info() {
  printf '%s\n' "$*"
}

load_env() {
  [ -f "$ENV_FILE" ] || fail "environment file not found: $ENV_FILE"
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "required command not found: $1"
}

require_var() {
  eval "value=\${$1:-}"
  [ -n "$value" ] || fail "missing required environment value: $1"
}

reject_placeholder_secret() {
  eval "value=\${$1:-}"
  case "$value" in
    CHANGE_ME*|*CHANGE_ME*|site-management-dev-secret|site_password|minioadmin|password123|admin123)
      fail "$1 must be replaced with a production value"
      ;;
  esac
}

require_backup_dir() {
  require_var BACKUP_DIR
  [ -d "$BACKUP_DIR" ] || fail "backup directory does not exist: BACKUP_DIR"
  [ -w "$BACKUP_DIR" ] || fail "backup directory is not writable: BACKUP_DIR"
}

compose_prod() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

timestamp_utc() {
  date -u +"%Y%m%dT%H%M%SZ"
}
