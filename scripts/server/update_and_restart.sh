#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="${SERVICE_NAME:-flash-control-bot}"

log() {
  printf '[flash-update] %s\n' "$*"
}

die() {
  printf '[flash-update] ERROR: %s\n' "$*" >&2
  exit 1
}

resolve_app_dir() {
  if [[ -n "${APP_DIR:-}" ]]; then
    :
  elif [[ -f "./package.json" && -f "./src/controlBotCli.ts" ]]; then
    APP_DIR="$(pwd)"
  else
    APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
  fi

  APP_DIR="$(cd "$APP_DIR" && pwd)"
  [[ -f "$APP_DIR/package.json" ]] || die "APP_DIR does not look like project root: $APP_DIR"
}

run_systemctl() {
  if [[ "${EUID}" -eq 0 ]]; then
    systemctl "$@"
  else
    sudo systemctl "$@"
  fi
}

run_journalctl() {
  if [[ "${EUID}" -eq 0 ]]; then
    journalctl "$@"
  else
    sudo journalctl "$@"
  fi
}

main() {
  resolve_app_dir
  local pw_path="${PLAYWRIGHT_BROWSERS_PATH:-$APP_DIR/.ms-playwright}"
  local current_user
  current_user="$(whoami 2>/dev/null || printf 'unknown')"

  cd "$APP_DIR"
  log "USER=$current_user ($( [[ "${EUID}" -eq 0 ]] && printf 'root mode' || printf 'non-root mode' ))"
  log "APP_DIR=$APP_DIR"
  log "PLAYWRIGHT_BROWSERS_PATH=$pw_path"

  log "npm ci"
  npm ci

  log "npx playwright install chromium"
  PLAYWRIGHT_BROWSERS_PATH="$pw_path" npx playwright install chromium

  log "npm run build"
  npm run build

  log "Restarting systemd service: $SERVICE_NAME"
  run_systemctl restart "$SERVICE_NAME"

  log "Service status (short)"
  run_systemctl --no-pager --full status "$SERVICE_NAME" | sed -n '1,20p'

  log "Recent logs"
  run_journalctl -u "$SERVICE_NAME" -n 50 --no-pager
}

main "$@"
