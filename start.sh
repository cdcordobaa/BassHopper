#!/usr/bin/env bash
# Start BassHopper: the Python helper (songs, tabs, stems) and the web app, together.
# Ctrl+C stops both. If the helper can't start, the web app still runs (Riff Arena just shows "helper offline").
set -uo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
WEB_PORT="${BASSHOPPER_WEB_PORT:-5180}"
HELPER_PORT="${BASSHOPPER_PORT:-8765}"
HELPER_LOG="$ROOT/helper/helper.log"
HELPER_PID=""
WEB_PID=""

say() { printf '\033[1;35m▸\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!\033[0m %s\n' "$*"; }

# uv run / npm spawn children, so stop the whole tree, deepest first.
kill_tree() {
  local pid=$1 child
  for child in $(pgrep -P "$pid" 2>/dev/null); do kill_tree "$child"; done
  kill -TERM "$pid" 2>/dev/null || true
}

cleanup() {
  trap - INT TERM EXIT
  echo
  say "Stopping BassHopper…"
  [[ -n "$WEB_PID" ]] && kill_tree "$WEB_PID"
  [[ -n "$HELPER_PID" ]] && kill_tree "$HELPER_PID"
  wait 2>/dev/null
  exit 0
}
trap cleanup INT TERM EXIT

lan_ip() {
  if [[ "$(uname)" == "Darwin" ]]; then
    ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null
  else
    hostname -I 2>/dev/null | awk '{print $1}'
  fi
}

# --- web deps (required) ---
if ! command -v npm >/dev/null; then
  warn "npm not found. Install Node.js 20+ from https://nodejs.org and run ./start.sh again."
  exit 1
fi
if [[ ! -d "$ROOT/web/node_modules" ]]; then
  say "First run: installing web app packages (npm install)…"
  (cd "$ROOT/web" && npm install) || { warn "npm install failed."; exit 1; }
fi

# --- helper (optional) ---
UV="$(command -v uv || echo "$HOME/.local/bin/uv")"
if [[ ! -x "$UV" ]]; then
  warn "uv not found, so the song helper is off (Riff Arena import needs it)."
  warn "Install it with: curl -LsSf https://astral.sh/uv/install.sh | sh"
elif curl -fsS "http://127.0.0.1:$HELPER_PORT/api/health" >/dev/null 2>&1; then
  say "Helper already running on port $HELPER_PORT, using it."
else
  if [[ ! -d "$ROOT/helper/.venv" ]]; then
    say "First run: installing helper packages (uv sync)…"
    (cd "$ROOT/helper" && "$UV" sync) || warn "uv sync failed; trying to start the helper anyway."
  fi
  say "Starting helper on port $HELPER_PORT (log: helper/helper.log)…"
  "$ROOT/helper/run.sh" >"$HELPER_LOG" 2>&1 &
  HELPER_PID=$!
  for _ in $(seq 1 40); do
    curl -fsS "http://127.0.0.1:$HELPER_PORT/api/health" >/dev/null 2>&1 && break
    kill -0 "$HELPER_PID" 2>/dev/null || break
    sleep 0.25
  done
  if curl -fsS "http://127.0.0.1:$HELPER_PORT/api/health" >/dev/null 2>&1; then
    say "Helper is up."
  else
    warn "Helper didn't start (see helper/helper.log). The web app still works; song import is off."
    kill_tree "$HELPER_PID"
    HELPER_PID=""
  fi
fi

# --- web app ---
say "Starting web app…"
cd "$ROOT/web"
npm run dev -- --port "$WEB_PORT" --strictPort &
WEB_PID=$!

for _ in $(seq 1 80); do
  curl -fsS "http://localhost:$WEB_PORT/" >/dev/null 2>&1 && break
  kill -0 "$WEB_PID" 2>/dev/null || { warn "Web app failed to start (is port $WEB_PORT in use? set BASSHOPPER_WEB_PORT)."; exit 1; }
  sleep 0.25
done

IP="$(lan_ip)"
echo
say "BassHopper is running:"
echo "    This computer:  http://localhost:$WEB_PORT"
[[ -n "$IP" ]] && echo "    Tablet (Wi-Fi): http://$IP:$WEB_PORT"
echo "    Press Ctrl+C to stop."
echo

if [[ "$(uname)" == "Darwin" && -z "${BASSHOPPER_NO_OPEN:-}" ]]; then
  open "http://localhost:$WEB_PORT"
fi

wait "$WEB_PID"
