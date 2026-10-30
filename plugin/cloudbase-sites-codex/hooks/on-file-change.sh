#!/usr/bin/env bash
# on-file-change.sh — Claude Code / OpenClaw / CodeBuddy PostToolUse hook
#
# Reads the hook event payload from stdin (JSON). Restarts the daemonized
# Vite dev server iff the edited file is one Vite HMR cannot handle (config
# files, tsconfig, .env, package.json).
#
# Constraints:
#   - exit fast (≤ ~50ms)
#   - debounce: 1.5s lockfile so a rapid burst of edits restart only once
#   - background restart so the hook returns immediately
#   - exit code is always 0 — never block the user's tool call

set -u

# Read hook payload from stdin.
PAYLOAD="$(cat)"

# Without jq we cannot parse — silently skip. (Don't block the user.)
if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

FILE_PATH="$(printf '%s' "$PAYLOAD" | jq -r '.tool_input.file_path // empty')"
CWD="$(printf '%s' "$PAYLOAD" | jq -r '.cwd // empty')"

[ -z "$FILE_PATH" ] && exit 0

# --- Decide if file warrants a dev-server restart ---------------------------
# Vite HMR handles src/*.tsx / *.css / public/* etc. We only restart for
# changes Vite cannot hot-swap.
restart=0
case "$(basename "$FILE_PATH")" in
  package.json | tsconfig.json | tsconfig.*.json) restart=1 ;;
  vite.config.* | tailwind.config.* | postcss.config.*) restart=1 ;;
  .env | .env.* ) restart=1 ;;
esac
if [ "$restart" = "0" ]; then
  case "$FILE_PATH" in
    */vite.config.* | */tailwind.config.* | */postcss.config.*) restart=1 ;;
    */.env | */.env.*) restart=1 ;;
  esac
fi
[ "$restart" = "1" ] || exit 0

# --- Resolve target cwd (where preview.json lives) --------------------------
TARGET_CWD="${CWD:-$(dirname "$FILE_PATH")}"

find_preview_root() {
  local d="$1"
  while [ "$d" != "/" ] && [ -n "$d" ]; do
    if [ -f "$d/.cloudbase-sites/preview.json" ]; then
      printf '%s' "$d"
      return 0
    fi
    d="$(dirname "$d")"
  done
  return 1
}

PROJECT_ROOT="$(find_preview_root "$TARGET_CWD" || true)"
[ -z "$PROJECT_ROOT" ] && exit 0

# --- Debounce: 1.5s lockfile (Node.js Date.now() — cross-platform) ----------
LOCK="$PROJECT_ROOT/.cloudbase-sites/restart.lock"
NOW="$(node -e 'console.log(Date.now())' 2>/dev/null || python3 -c 'import time;print(int(time.time()*1000))' 2>/dev/null || echo 0)"
if [ -f "$LOCK" ]; then
  LAST="$(cat "$LOCK" 2>/dev/null || echo 0)"
  case "$NOW$LAST" in *[!0-9]*) ;; *)
    DELTA=$(( NOW - LAST ))
    if [ "$DELTA" -lt 1500 ]; then
      exit 0
    fi
  ;; esac
fi
mkdir -p "$(dirname "$LOCK")"
printf '%s' "$NOW" > "$LOCK"

# --- Async restart -----------------------------------------------------------
SITES_BIN="$(command -v cloudbase-sites || true)"
if [ -z "$SITES_BIN" ]; then
  HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
  SITES_BIN="$HOOK_DIR/../bin/cloudbase-sites"
  [ -x "$SITES_BIN" ] || exit 0  # give up silently — never block the user
fi

HOOK_LOG_DIR="$HOME/.cloudbase-sites/logs"
mkdir -p "$HOOK_LOG_DIR"
HOOK_LOG="$HOOK_LOG_DIR/hook-restart.log"
(
  cd "$PROJECT_ROOT" || exit 0
  printf '\n[%s] restart trigger: %s\n' "$(date -Iseconds 2>/dev/null || date)" "$FILE_PATH" >> "$HOOK_LOG"
  "$SITES_BIN" preview --restart >> "$HOOK_LOG" 2>&1 || true
) </dev/null >/dev/null 2>&1 &
disown 2>/dev/null || true

exit 0
