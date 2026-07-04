#!/bin/sh

set -eu

. "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/lib.sh"

show_help() {
  cat <<'EOF'
Usage: npm run prod:deploy -- [options]

Options:
  --host <host-or-ip>          Generate .env.production on first deploy
  --skip-smoke                 Skip prod smoke validation
  --api-port <port>            Pass through to prod:init-env
  --web-port <port>            Pass through to prod:init-env
  --api-url <url>              Pass through to prod:init-env
  --web-url <url>              Pass through to prod:init-env
  --backup-dir <path>          Pass through to prod:init-env
  --smoke-username <name>      Pass through to prod:init-env
  --smoke-password <value>     Pass through to prod:init-env
  --image-tag <tag>            Pass through to prod:init-env
  -h, --help                   Show this help

Environment:
  ENV_FILE                     Defaults to .env.production
  COMPOSE_FILE                 Defaults to infra/docker-compose.prod.yml
  DEPLOY_DRY_RUN=true          Print commands without executing them
EOF
}

dry_run=${DEPLOY_DRY_RUN:-false}
skip_smoke=false
host=
api_port=
web_port=
api_url=
web_url=
backup_dir=
smoke_username=
smoke_password=
image_tag=

while [ "$#" -gt 0 ]; do
  case "$1" in
    --host)
      [ "${2:-}" ] || fail "missing value for --host"
      host=$2
      shift 2
      ;;
    --skip-smoke)
      skip_smoke=true
      shift
      ;;
    --api-port|--web-port|--api-url|--web-url|--backup-dir|--smoke-username|--smoke-password|--image-tag)
      [ "${2:-}" ] || fail "missing value for $1"
      case "$1" in
        --api-port) api_port=$2 ;;
        --web-port) web_port=$2 ;;
        --api-url) api_url=$2 ;;
        --web-url) web_url=$2 ;;
        --backup-dir) backup_dir=$2 ;;
        --smoke-username) smoke_username=$2 ;;
        --smoke-password) smoke_password=$2 ;;
        --image-tag) image_tag=$2 ;;
      esac
      shift 2
      ;;
    -h|--help)
      show_help
      exit 0
      ;;
    *)
      fail "unknown option: $1"
      ;;
  esac
done

format_command() {
  redact_next=false
  formatted=
  for arg do
    if [ "$redact_next" = "true" ]; then
      display="***"
      redact_next=false
    else
      display=$arg
      [ "$arg" = "--smoke-password" ] && redact_next=true
    fi
    formatted="$formatted $display"
  done
  printf '%s' "${formatted# }"
}

run_cmd() {
  info "+ $(format_command "$@")"
  if [ "$dry_run" = "true" ]; then
    return 0
  fi
  "$@"
}

if [ ! -f "$ENV_FILE" ]; then
  [ -n "$host" ] || fail "$ENV_FILE does not exist. Re-run with --host <server-host-or-ip> for first deploy."
  set --
  [ -z "$api_port" ] || set -- "$@" --api-port "$api_port"
  [ -z "$web_port" ] || set -- "$@" --web-port "$web_port"
  [ -z "$api_url" ] || set -- "$@" --api-url "$api_url"
  [ -z "$web_url" ] || set -- "$@" --web-url "$web_url"
  [ -z "$backup_dir" ] || set -- "$@" --backup-dir "$backup_dir"
  [ -z "$smoke_username" ] || set -- "$@" --smoke-username "$smoke_username"
  [ -z "$smoke_password" ] || set -- "$@" --smoke-password "$smoke_password"
  [ -z "$image_tag" ] || set -- "$@" --image-tag "$image_tag"
  run_cmd node "$SCRIPT_DIR/init-env.mjs" --output "$ENV_FILE" --host "$host" "$@"
else
  info "Using existing environment file: $ENV_FILE"
fi

run_cmd sh "$SCRIPT_DIR/preflight.sh"
run_cmd docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" build
run_cmd docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d
run_cmd sh "$SCRIPT_DIR/migrate.sh"
run_cmd docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps

if [ "$skip_smoke" = "true" ]; then
  info "Skipping production smoke validation because --skip-smoke was provided."
else
  run_cmd node "$SCRIPT_DIR/smoke.mjs"
fi

info "Production deploy command completed."
