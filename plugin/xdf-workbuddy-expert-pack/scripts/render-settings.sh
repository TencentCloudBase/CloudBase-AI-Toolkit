#!/usr/bin/env bash
# render-settings.sh — rewrite settings.snippet.json with absolute pack roots.
#
# Usage:
#   bash scripts/render-settings.sh
#   bash scripts/render-settings.sh --print   # stdout only
#   bash scripts/render-settings.sh --merge   # print jq merge hint for ~/.workbuddy/settings.json
#
# Output file (default): settings.rendered.json (gitignored locally; not committed)

set -euo pipefail

PACK_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PREWARM_HOOK="$PACK_ROOT/../workbuddy-template-prewarm/hooks/on-session-start.sh"
SNIPPET="$PACK_ROOT/settings.snippet.json"
OUT="$PACK_ROOT/settings.rendered.json"

PRINT_ONLY=0
MERGE_HINT=0
for arg in "$@"; do
  case "$arg" in
    --print) PRINT_ONLY=1 ;;
    --merge) MERGE_HINT=1 ;;
  esac
done

if [ ! -f "$PREWARM_HOOK" ]; then
  echo "error: prewarm hook missing at $PREWARM_HOOK" >&2
  echo "ship workbuddy-template-prewarm as a sibling of this pack." >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "error: node required" >&2
  exit 1
fi

RENDERED="$(node -e '
  const fs = require("fs");
  const packRoot = process.argv[1];
  const hook = process.argv[2];
  const raw = fs.readFileSync(process.argv[3], "utf8");
  const j = JSON.parse(raw);
  const cmd = `bash "${hook}"`;
  for (const entry of j.hooks.SessionStart) {
    for (const h of entry.hooks || []) {
      if (h.type === "command") h.command = cmd;
    }
  }
  j._comment = `Rendered for ${packRoot}. Merge SessionStart into ~/.workbuddy/settings.json (stack; do not replace).`;
  delete j._xdf;
  process.stdout.write(JSON.stringify(j, null, 2) + "\n");
' "$PACK_ROOT" "$PREWARM_HOOK" "$SNIPPET")"

if [ "$PRINT_ONLY" = "1" ]; then
  printf '%s' "$RENDERED"
  exit 0
fi

printf '%s' "$RENDERED" >"$OUT"
echo "wrote $OUT"
echo "hook: $PREWARM_HOOK"

if [ "$MERGE_HINT" = "1" ]; then
  cat <<EOF

Merge hint (manual):
  1. Open ~/.workbuddy/settings.json
  2. Under hooks.SessionStart, APPEND the object from settings.rendered.json
     (keep existing teamai SessionStart entries)
  3. Restart WorkBuddy / start a new session in an empty project directory
  4. Do NOT set allowUntrustedFrontmatterHooks for this enablement path

Verify:
  cat <cwd>/.cloudbase-prewarm/state.json
  # expect status=ready after ~20-40s
EOF
fi
