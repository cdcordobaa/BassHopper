#!/usr/bin/env bash
# Start the BassHopper helper on http://127.0.0.1:8765 (BASSHOPPER_HOST=0.0.0.0 to reach it from a tablet).
set -euo pipefail
cd "$(dirname "$0")"
UV="$(command -v uv || echo "$HOME/.local/bin/uv")"
ARGS=(run)
# Demucs is used whenever it is installed; BASSHOPPER_STEMS=1 also installs it (torch, ~700 MB) if missing.
if [[ "${BASSHOPPER_STEMS:-}" == "1" ]]; then ARGS+=(--extra stems); fi
exec "$UV" "${ARGS[@]}" uvicorn basshopper_helper.app:app \
  --host "${BASSHOPPER_HOST:-127.0.0.1}" --port "${BASSHOPPER_PORT:-8765}" "$@"
