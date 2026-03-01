# FLASH (Flashscore Tennis)

Playwright-based tennis prediction pipeline for `https://www.flashscore.co.ke/tennis/`.

The runtime builds predictions from strict history-only `Tech Statistics` (`stable14`) collected from Flashscore match pages and player results pages.

## Current Source / Policy

- Source: Flashscore (`flashscore.co.ke`) for day page, match page, player profiles/results, match stats, odds, outcome audit.
- Match scope: singles only (doubles/mixed filtered out).
- History policy: strict `5` valid historical matches per player.
- Metrics policy: `stable14`.
- `YTD` path removed.
- `PCLASS` may still exist internally as `missing`, but is not shown in user-facing output or match trace text.

## What the runtime does

- Opens tennis day page and extracts candidate matches (`live / upcoming / finished`).
- Resolves match page metadata (players, tournament, status, scheduled time, odds).
- Opens both player profiles (`/player/.../results/`) and collects recent match candidates.
- Loads each historical match `summary/stats` page and parses Flashscore statistics rows.
- Accepts only matches with full `stable14` coverage.
- Builds prediction (`Logistic`, `Markov`, `Bradley-Terry`, `PCA`, `NOVA`) and prints `TENNIS SIGNAL`.

## Signal format (current)

- Optional first line: `✅✅✅` when `HISTORY-5` winner and `NOVA` winner are the same player
- Main block: `Logistic`, `Markov`, `Bradley-Terry`, `PCA`
- Summary: `Winner`, `Odds`, `Methods`, `Agreement`, `Confidence`
- Short summary: `HISTORY-5`, `NOVA`, `STATE`, `STATE REASON`, `STATE DIAG`, `NOVA FILTER`
- Player state block: `PLAYER STATE (10/5/3)` for each player
- Player state metrics: `Stability`, `Form-TECH`, `Form-PLUS`, `Strength`, `Coverage`, `Quality`
- `Coverage` = completeness (`tech n/10` and availability markers `W10/W5/W3`)
- `Quality` = signal quality by windows (`windowReliability`, `scoreCoverage`, `oppCoverage`, composite `q`)
- `STATE DIAG` = compact pair diagnostics (`EDGE`, `CONFLICT`, `VOTES`, `REL`)
- `STATE`/`STATE REASON`/`STATE DIAG` are informational only and do not change main `Winner`/`Confidence`
- No `YTD SIGNAL`
- No `PCLASS` lines

## Install

```bash
npm install
npx playwright install chromium
```

## Telegram env (optional)

```bash
export TG_BOT_TOKEN="123456:..."
export TG_CHAT_ID="-1001234567890"
export TG_SEND_MAX_RPM="18"
```

## Run prediction

```bash
npm run predict -- \
  --entry-url https://www.flashscore.co.ke/tennis/ \
  --status all \
  --limit 10 \
  --recent-count 5 \
  --headed false \
  --slow-mo 0 \
  --timeout-ms 30000 \
  --telegram false \
  --console true
```

## Audits

### Formula audit (`prod vs oracle`)

```bash
npm run audit:calc -- \
  --entry-url https://www.flashscore.co.ke/tennis/ \
  --status all \
  --limit 10 \
  --headed false \
  --slow-mo 0 \
  --timeout-ms 30000
```

### Match trace (collection + pairs + model outputs)

```bash
npm run audit:match -- \
  --match-url "https://www.flashscore.co.ke/match/tennis/moutet-corentin-bX0EWcV9/zverev-alexander-dGbUhw9m/" \
  --player-a "Зверев" \
  --player-b "Муте" \
  --headed false \
  --slow-mo 0 \
  --timeout-ms 30000
```

### Outcome audit (Flashscore URL-based, Playwright)

```bash
npm run audit:outcome -- \
  --match-urls "https://www.flashscore.co.ke/match/tennis/alcaraz-garfia-carlos-UkhgIFEq/zverev-alexander-dGbUhw9m/?mid=OWtBstdE"
```

Optional predictions file (JSON array with `matchUrl`, `mainPick`, `novaPick`, etc.):

```bash
npm run audit:outcome -- \
  --match-urls "https://www.flashscore.co.ke/match/.../?mid=..." \
  --predictions-file ./predictions.json
```

## Control bot

```bash
npm run control-bot -- \
  --entry-url https://www.flashscore.co.ke/tennis/ \
  --headed false \
  --slow-mo 0 \
  --timeout-ms 30000
```

### Ошибка 409 getUpdates

Симптом:

```text
Conflict: terminated by other getUpdates request; make sure that only one bot instance is running
```

Что это значит:
- один Telegram token нельзя polling-ить из двух процессов одновременно;
- обычно запущен дубликат `control-bot` (второй терминал/повторный старт).

Как проверить локально:

```bash
ps aux | rg -i "controlBotCli|control-bot"
```

Как остановить дубликат:

```bash
pkill -f "dist/src/controlBotCli.js"
# или точечно:
kill <pid>
```

Runtime-защита в проекте:
- при старте ставится process-lock в `/tmp/flash-control-bot-{tokenHash}.lock`;
- второй процесс с тем же token завершится сразу (fail-fast);
- если polling 409 идёт подряд, бот делает backoff и завершает процесс после порога конфликтов;
- stale lock после падения автоматически очищается при следующем старте.

## Server Deployment (Ubuntu + systemd)

The recommended server mode is a permanently running Telegram `control-bot` service (`systemd`), and you trigger forecasts from the Telegram menu.

### 1. Upload project to server

Copy the project folder to your Ubuntu server (git clone / rsync / scp).

### 2. Export Telegram secrets (so the install script writes `/etc/flash-control-bot.env`)

```bash
export TG_BOT_TOKEN="123456:..."
export TG_CHAT_ID="-1001234567890"
export TG_SEND_MAX_RPM="18" # optional
```

### 3. Run install script (one-time)

Root-only server (project in `/root/FLASH`):

```bash
cd /root/FLASH
bash scripts/server/install_ubuntu_systemd.sh
```

Regular user + `sudo` (best practice):

```bash
cd ~/FLASH
sudo -E bash scripts/server/install_ubuntu_systemd.sh
```

If you are already inside `scripts/server`, use:

```bash
bash ./install_ubuntu_systemd.sh
```

(`bash scripts/server/install_ubuntu_systemd.sh` from `scripts/server` is the wrong relative path.)

What it does:
- installs Node.js 22 (NodeSource)
- installs `npm` dependencies
- installs Playwright Chromium (+ OS deps)
- builds the project
- creates `/etc/flash-control-bot.env` (if missing), using your exported `TG_*` variables
- installs and enables `flash-control-bot.service`

If you run from a non-root user and forget `sudo -E`, the script will create a template env file and warn you.

### 4. Fill Telegram secrets (only if you skipped exports / forgot `sudo -E`)

Secrets are read from `/etc/flash-control-bot.env` (not CLI flags):

```bash
sudo nano /etc/flash-control-bot.env
```

Required values:

```bash
TG_BOT_TOKEN=123456:...
TG_CHAT_ID=-1001234567890
TG_SEND_MAX_RPM=18
```

Then restart:

```bash
sudo systemctl restart flash-control-bot
```

If you are already in a root shell, `sudo` is not required:

```bash
systemctl restart flash-control-bot
```

### 5. Operations (status / logs / restart)

Root shell:

```bash
systemctl status flash-control-bot
journalctl -u flash-control-bot -f
systemctl restart flash-control-bot
systemctl stop flash-control-bot
```

Regular user:

```bash
sudo systemctl status flash-control-bot
sudo journalctl -u flash-control-bot -f
sudo systemctl restart flash-control-bot
sudo systemctl stop flash-control-bot
```

### 6. Update project on server (after code changes)

Root-only server:

```bash
cd /root/FLASH
bash scripts/server/update_and_restart.sh
```

Regular user:

```bash
cd ~/FLASH
bash scripts/server/update_and_restart.sh
```

This script:
- runs `npm ci`
- updates Playwright Chromium
- rebuilds the project
- restarts `flash-control-bot`
- prints status + recent logs

### systemd unit and env templates

- `deploy/systemd/flash-control-bot.service`
- `deploy/env/flash-control-bot.env.example`

## CLI defaults

- `--entry-url`: `https://www.flashscore.co.ke/tennis/`
- `--status`: `all`
- `--recent-count`: `5` (runtime still enforces strict history = 5)
- `--headed`: `true`
- `--slow-mo`: `450`
- `--timeout-ms`: `30000`
- `--telegram`: `true`
- `--console`: `true`

## Data notes

- Accepted historical matches must have complete `stable14` metrics:
  - `first_serve`
  - `first_serve_points_won`
  - `second_serve_points_won`
  - `break_points_saved`
  - `double_faults`
  - `first_serve_return_points_won`
  - `second_serve_return_points_won`
  - `break_points_converted`
  - `total_service_points_won`
  - `return_points_won`
  - `total_points_won`
  - `service_games_won`
  - `return_games_won`
  - `total_games_won`
- If either player has fewer than 5 valid historical matches, the match is skipped (`strict_5_not_reached`).

## Tests

```bash
npm run typecheck
npm test
```
# FLASH
