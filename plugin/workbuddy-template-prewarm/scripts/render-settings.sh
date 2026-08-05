#!/usr/bin/env bash
# render-settings.sh — offline fallback: rewrite settings.snippet.json with absolute hook path.
#
# Preferred enablement is marketplace plugin install (hooks/hooks.json auto-merges).
# Use this only when plugin marketplace is unavailable.
#
# Usage:
#   bash scripts/render-settings.sh
#   bash scripts/render-settings.sh --print
#   bash scripts/render-settings.sh --merge   # print merge hint for ~/.workbuddy/settings.json

set -euo pipefail

PLUGIN_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOOK="$PLUGIN_ROOT/hooks/on-session-start.sh"
SNIPPET="$PLUGIN_ROOT/settings.snippet.json"
OUT="$PLUGIN_ROOT/settings.rendered.json"

PRINT_ONLY=0
MERGE_HINT=0
for arg in "$@"; do
  case "$arg" in
    --print) PRINT_ONLY=1 ;;
    --merge) MERGE_HINT=1 ;;
  esac
done

if [ ! -f "$HOOK" ]; then
  echo "error: hook missing at $HOOK" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "error: node required" >&2
  exit 1
fi

RENDERED="$(node -e '
  const fs = require("fs");
  const pluginRoot = process.argv[1];
  const hook = process.argv[2];
  const raw = fs.readFileSync(process.argv[3], "utf8");
  const j = JSON.parse(raw);
  const cmd = `bash "${hook}"`;
  for (const entry of j.hooks.SessionStart) {
    for (const h of entry.hooks || []) {
      if (h.type === "command") h.command = cmd;
    }
  }
  j._comment = `Rendered for ${pluginRoot}. APPEND SessionStart into ~/.workbuddy/settings.json (stack with teamai; do not replace). Prefer marketplace plugin install over this fallback.`;
  process.stdout.write(JSON.stringify(j, null, 2) + "\n");
' "$PLUGIN_ROOT" "$HOOK" "$SNIPPET")"

if [ "$PRINT_ONLY" = "1" ]; then
  printf '%s' "$RENDERED"
  exit 0
fi

printf '%s' "$RENDERED" >"$OUT"
echo "wrote $OUT"
echo "hook: $HOOK"

if [ "$MERGE_HINT" = "1" ]; then
  cat <<EOF

Merge hint (legacy / offline only):
  1. Open ~/.workbuddy/settings.json
  2. Under hooks.SessionStart, APPEND the object from settings.rendered.json
     (keep existing teamai SessionStart entries — do not replace the whole hooks object)
  3. Restart WorkBuddy / start a new session in an empty project directory

Prefer instead:
  /plugin marketplace add TencentCloudBase/CloudBase-MCP
  /plugin install workbuddy-template-prewarm@tencent-cloudbase
EOF
fi
