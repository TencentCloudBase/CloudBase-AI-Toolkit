#!/usr/bin/env bash
# sync-sites-vendor.sh — refresh vendored cloudbase-sites bin+lib from sibling plugin.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PREWARM_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SITES_ROOT="$(cd "$PREWARM_ROOT/../cloudbase-sites" && pwd)"
DEST="$PREWARM_ROOT/vendor/cloudbase-sites"

if [ ! -x "$SITES_ROOT/bin/cloudbase-sites" ]; then
  echo "error: sibling Sites CLI missing at $SITES_ROOT/bin/cloudbase-sites" >&2
  exit 1
fi

rm -rf "$DEST"
mkdir -p "$DEST"
cp -R "$SITES_ROOT/bin" "$DEST/bin"
cp -R "$SITES_ROOT/lib" "$DEST/lib"

cat > "$DEST/VENDOR.md" << EOF
# Vendored CloudBase Sites CLI (preview subset)

Copied from sibling \`plugin/cloudbase-sites\` (\`bin/\` + \`lib/\` only).

Synced: $(date -u +%Y-%m-%dT%H:%M:%SZ)
Source: $SITES_ROOT

Refresh:
\`\`\`bash
bash plugin/workbuddy-template-prewarm/scripts/sync-sites-vendor.sh
\`\`\`

Do not edit files under this tree by hand — re-sync from upstream Sites.
EOF

echo "synced $DEST from $SITES_ROOT"
