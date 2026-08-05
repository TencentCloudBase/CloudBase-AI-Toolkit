#!/usr/bin/env bash
# Install minimal-web-baas-demo onto the local WorkBuddy / CodeBuddy skill surface
# so Skill("minimal-web-baas-demo") resolves before CloudBase connector Trust.
#
# Usage (from repo root or this pack directory):
#   bash plugin/xdf-workbuddy-expert-pack/scripts/install-skill.sh
#   bash scripts/install-skill.sh
#
# Destinations (created if missing):
#   ~/.workbuddy/skills/minimal-web-baas-demo
#   ~/.codebuddy/skills/minimal-web-baas-demo   (when that home exists)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACK_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
SRC="${PACK_ROOT}/skills/minimal-web-baas-demo"
SKILL_ID="minimal-web-baas-demo"

if [[ ! -f "${SRC}/SKILL.md" ]]; then
  echo "ERROR: missing ${SRC}/SKILL.md" >&2
  exit 1
fi

install_one() {
  local dest_root="$1"
  local label="$2"
  local dest="${dest_root}/${SKILL_ID}"
  mkdir -p "${dest_root}"
  rm -rf "${dest}"
  mkdir -p "${dest}"
  # Prefer rsync when available; fall back to cp -R for minimal partner hosts.
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete "${SRC}/" "${dest}/"
  else
    cp -R "${SRC}/." "${dest}/"
  fi
  echo "Installed ${SKILL_ID} → ${dest} (${label})"
}

install_one "${HOME}/.workbuddy/skills" "WorkBuddy"

if [[ -d "${HOME}/.codebuddy" ]]; then
  install_one "${HOME}/.codebuddy/skills" "CodeBuddy"
fi

echo
echo "Verify (expect SKILL.md):"
echo "  ls ~/.workbuddy/skills/${SKILL_ID}/SKILL.md"
echo "Then start a new WorkBuddy session and call Skill(\"${SKILL_ID}\")."
