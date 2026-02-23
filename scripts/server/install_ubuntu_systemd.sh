#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="flash-control-bot"
ENV_FILE="/etc/${SERVICE_NAME}.env"
UNIT_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

log() {
  printf '[flash-install] %s\n' "$*"
}

warn() {
  printf '[flash-install] WARN: %s\n' "$*" >&2
}

die() {
  printf '[flash-install] ERROR: %s\n' "$*" >&2
  exit 1
}

escape_sed() {
  printf '%s' "$1" | sed -e 's/[\/&]/\\&/g'
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
  [[ -f "$APP_DIR/src/controlBotCli.ts" ]] || die "Missing src/controlBotCli.ts in APP_DIR: $APP_DIR"
}

resolve_run_user() {
  RUN_USER="${RUN_USER:-${SUDO_USER:-}}"
  if [[ -z "$RUN_USER" ]]; then
    RUN_USER="$(logname 2>/dev/null || true)"
  fi
  [[ -n "$RUN_USER" ]] || die "Unable to resolve RUN_USER. Export RUN_USER=<linux-user> and re-run."
  [[ "$RUN_USER" != "root" ]] || die "RUN_USER resolved to root. Re-run with sudo from your normal user or set RUN_USER."
  id "$RUN_USER" >/dev/null 2>&1 || die "RUN_USER does not exist: $RUN_USER"
}

check_platform() {
  command -v apt-get >/dev/null 2>&1 || die "apt-get not found. This script supports Ubuntu/apt only."
  [[ -r /etc/os-release ]] || die "/etc/os-release not found."
  # shellcheck disable=SC1091
  source /etc/os-release
  [[ "${ID:-}" == "ubuntu" ]] || die "Unsupported OS ID='${ID:-unknown}'. This script targets Ubuntu."
}

install_system_packages() {
  log "Installing system packages..."
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y \
    curl \
    ca-certificates \
    git \
    bash \
    procps
}

install_nodejs_22() {
  local need_install="1"
  if command -v node >/dev/null 2>&1; then
    local major
    major="$(node -v | sed -E 's/^v([0-9]+).*/\1/')"
    if [[ "$major" == "22" ]]; then
      need_install="0"
    fi
  fi

  if [[ "$need_install" == "1" ]]; then
    log "Installing Node.js 22.x (NodeSource)..."
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs
  fi

  command -v node >/dev/null 2>&1 || die "node not found after installation"
  command -v npm >/dev/null 2>&1 || die "npm not found after installation"
  log "Node: $(node -v), npm: $(npm -v)"
}

prepare_app_build() {
  local pw_path="$APP_DIR/.ms-playwright"
  local npm_cmd=(sudo -H -u "$RUN_USER" bash -lc)

  log "Installing project dependencies (npm ci) as $RUN_USER..."
  "${npm_cmd[@]}" "cd '$APP_DIR' && npm ci"

  log "Installing Playwright Chromium (+ OS deps)..."
  mkdir -p "$pw_path"
  PLAYWRIGHT_BROWSERS_PATH="$pw_path" bash -lc "cd '$APP_DIR' && npx playwright install --with-deps chromium"
  chown -R "$RUN_USER":"$RUN_USER" "$pw_path"

  log "Building project as $RUN_USER..."
  "${npm_cmd[@]}" "cd '$APP_DIR' && npm run build"
}

ensure_env_file() {
  local example="$APP_DIR/deploy/env/flash-control-bot.env.example"
  local tg_bot_token="${TG_BOT_TOKEN:-}"
  local tg_chat_id="${TG_CHAT_ID:-}"
  local tg_send_max_rpm="${TG_SEND_MAX_RPM:-18}"
  if ! [[ "$tg_send_max_rpm" =~ ^[0-9]+$ ]]; then
    warn "TG_SEND_MAX_RPM is not an integer ('${tg_send_max_rpm}'); using 18"
    tg_send_max_rpm="18"
  fi

  if [[ -f "$ENV_FILE" ]]; then
    log "Env file already exists: $ENV_FILE (not overwriting)"
    if [[ -n "$tg_bot_token" && -n "$tg_chat_id" ]]; then
      log "Exported TG_BOT_TOKEN/TG_CHAT_ID detected, but existing env file takes precedence."
    fi
    return
  fi

  if [[ -n "$tg_bot_token" && -n "$tg_chat_id" ]]; then
    log "Creating env file from exported TG_* variables: $ENV_FILE"
    cat >"$ENV_FILE" <<EOF
# FLASH Telegram control bot env
TG_BOT_TOKEN=$tg_bot_token
TG_CHAT_ID=$tg_chat_id
TG_SEND_MAX_RPM=$tg_send_max_rpm
EOF
  else
    log "Creating env file template: $ENV_FILE"
    if [[ -f "$example" ]]; then
      cp "$example" "$ENV_FILE"
    else
      cat >"$ENV_FILE" <<'EOF'
# FLASH Telegram control bot env
TG_BOT_TOKEN=123456:ABC_REPLACE_ME
TG_CHAT_ID=-1001234567890
TG_SEND_MAX_RPM=18
EOF
    fi
    warn "TG_BOT_TOKEN/TG_CHAT_ID were not found in environment. The service may fail until you fill $ENV_FILE."
    warn "If you exported them before install, run the script as: sudo -E bash scripts/server/install_ubuntu_systemd.sh"
  fi
  chown root:root "$ENV_FILE"
  chmod 600 "$ENV_FILE"
}

install_systemd_unit() {
  local template="$APP_DIR/deploy/systemd/flash-control-bot.service"
  local pw_path="$APP_DIR/.ms-playwright"
  [[ -f "$template" ]] || die "Missing systemd template: $template"

  log "Installing systemd unit: $UNIT_FILE"
  sed \
    -e "s/__RUN_USER__/$(escape_sed "$RUN_USER")/g" \
    -e "s#__APP_DIR__#$(escape_sed "$APP_DIR")#g" \
    -e "s#__ENV_FILE__#$(escape_sed "$ENV_FILE")#g" \
    -e "s#__PLAYWRIGHT_BROWSERS_PATH__#$(escape_sed "$pw_path")#g" \
    "$template" >"$UNIT_FILE"
  chmod 644 "$UNIT_FILE"
}

enable_and_start_service() {
  log "Reloading systemd and enabling service..."
  systemctl daemon-reload
  systemctl enable "$SERVICE_NAME"

  log "Restarting service..."
  if ! systemctl restart "$SERVICE_NAME"; then
    warn "Service restart failed. This is usually because /etc/${SERVICE_NAME}.env still has placeholder TG_BOT_TOKEN/TG_CHAT_ID."
  fi
}

print_next_steps() {
  cat <<EOF

FLASH server install finished.

App dir:       $APP_DIR
Run user:      $RUN_USER
Service:       $SERVICE_NAME
Env file:      $ENV_FILE
Playwright dir: $APP_DIR/.ms-playwright

If the service does not start, check secrets in $ENV_FILE (or rerun with exported vars + sudo -E):
  export TG_BOT_TOKEN="..."
  export TG_CHAT_ID="..."
  export TG_SEND_MAX_RPM="18"
  sudo -E bash scripts/server/install_ubuntu_systemd.sh

Manual edit path (optional):
  sudo nano $ENV_FILE
  sudo systemctl restart $SERVICE_NAME

Check status/logs:
  sudo systemctl status $SERVICE_NAME
  sudo journalctl -u $SERVICE_NAME -f
EOF
}

main() {
  [[ "${EUID}" -eq 0 ]] || die "Run with sudo: sudo bash scripts/server/install_ubuntu_systemd.sh"
  check_platform
  resolve_app_dir
  resolve_run_user
  log "Using APP_DIR=$APP_DIR"
  log "Using RUN_USER=$RUN_USER"
  install_system_packages
  install_nodejs_22
  prepare_app_build
  ensure_env_file
  install_systemd_unit
  enable_and_start_service
  print_next_steps
}

main "$@"
