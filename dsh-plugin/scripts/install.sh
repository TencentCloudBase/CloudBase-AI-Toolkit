#!/usr/bin/env bash
# One-shot installer for @cloudbase/dsh-plugin
# Usage: curl -fsSL <raw install.sh> | bash
#    or: bash scripts/install.sh [web|headless]
set -euo pipefail

PROFILE="${1:-web}"
DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
PROFILE_DIR="$DSH_HOME/profiles/$PROFILE"
PKG="${CLOUDBASE_DSH_PLUGIN_SPEC:-@cloudbase/dsh-plugin}"

if ! command -v dsh >/dev/null 2>&1; then
  echo "dsh is not on PATH. Install DeepSeek Harness first: https://github.com/deepseek-ai/deepseek-harness"
  exit 1
fi

echo "==> Adding $PKG to profile $PROFILE"
dsh plugin --profile "$PROFILE" add "$PKG"

mkdir -p "$PROFILE_DIR"
if [ ! -f "$PROFILE_DIR/.npmrc" ] || ! grep -q "enable-scripts=true" "$PROFILE_DIR/.npmrc" 2>/dev/null; then
  echo "enable-scripts=true" >> "$PROFILE_DIR/.npmrc"
  echo "==> Wrote enable-scripts=true to $PROFILE_DIR/.npmrc (pnpm must run protobufjs install scripts)"
fi

if command -v pnpm >/dev/null 2>&1 && [ -f "$PROFILE_DIR/package.json" ]; then
  echo "==> pnpm install in $PROFILE_DIR"
  (cd "$PROFILE_DIR" && pnpm install)
fi

if [ "$PROFILE" = "web" ]; then
  echo "==> Rebuilding DSH web so CloudBase UI slots load"
  if command -v pnpm >/dev/null 2>&1; then
    DSH_ROOT="$(dirname "$(dirname "$(command -v dsh)")")"
    if [ -f "$DSH_ROOT/package.json" ] && grep -q '"build:web"' "$DSH_ROOT/package.json"; then
      (cd "$DSH_ROOT" && pnpm run build:web)
    elif [ -f "$PROFILE_DIR/package.json" ] && grep -q '"build:web"' "$PROFILE_DIR/package.json"; then
      (cd "$PROFILE_DIR" && pnpm run build:web)
    else
      echo "    build:web not found. After install, restart dsh --profile web."
      echo "    If cards/panel are missing, run pnpm run build:web from the DSH install directory."
    fi
  fi
fi

echo "==> Installing CloudBase skills into ~/.dsh/skills/cloudbase/"
npx --yes -p "$PKG" cloudbase-skills sync 2>/dev/null || true
if command -v cloudbase-skills >/dev/null 2>&1; then
  cloudbase-skills sync || true
fi

echo
echo "Done. Next:"
echo "  dsh --profile $PROFILE"
echo "If CloudBase tools are missing, wait for npx @cloudbase/cloudbase-mcp@latest to finish, then retry."
echo "Login: ask the model to call mcp__cloudbase__auth action=start_auth authMode=device"
