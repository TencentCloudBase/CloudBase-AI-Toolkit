#!/usr/bin/env bash
#
# specs 归档同步脚本
#
# 背景：
#   specs/ 是本地目录，已从公开仓库移除（.gitignore + git rm --cached），
#   只归档到私有仓库。副作用是：切分支 / merge 新 main 时，git 会把这些
#   原本 tracked 的文件从工作区删掉（属预期行为，不是数据丢失）。
#   本脚本负责两个方向的搬运：
#
#     pull    归档仓 -> 本地   切分支被清空后恢复（post-checkout / post-merge 自动跑）
#     push    本地   -> 归档仓 新写或改过的 spec 归档，避免切分支时丢
#     status  显示本地与归档仓之间的漂移
#
# 归档仓位置不在本仓库内硬编码（公开仓库不泄漏私有位置），按序读取：
#   1. 环境变量 SPECS_ARCHIVE_DIR
#   2. 配置文件 ~/.config/cloudbase-mcp/specs-archive-dir（一行路径）
# 两者都没有时静默退出 0 —— hook 场景不能因为没配置就把 git 操作卡住。
#
# 用法：
#   bash scripts/specs-sync.sh [pull|push|status] [--hook] [--no-push]

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
LOCAL_SPECS="$REPO_ROOT/specs"

CONFIG_FILE="${HOME}/.config/cloudbase-mcp/specs-archive-dir"
ARCHIVE_DIR="${SPECS_ARCHIVE_DIR:-}"
if [[ -z "$ARCHIVE_DIR" && -f "$CONFIG_FILE" ]]; then
  ARCHIVE_DIR="$(head -n 1 "$CONFIG_FILE" | tr -d '[:space:]')"
fi

CMD="${1:-pull}"
shift || true
HOOK_MODE=0
DO_PUSH_REMOTE=1
for arg in "$@"; do
  case "$arg" in
    --hook)    HOOK_MODE=1 ;;
    --no-push) DO_PUSH_REMOTE=0 ;;
  esac
done

log() { [[ "$HOOK_MODE" == "1" ]] || echo "$@"; }

# 未配置归档仓：静默退出，不打扰正常的 git 操作
if [[ -z "$ARCHIVE_DIR" || ! -d "$ARCHIVE_DIR/specs" ]]; then
  exit 0
fi

# 仍在版本控制里的白名单目录：pull 时不覆盖，避免冲掉未提交改动
KEEP_DIRS=()
while IFS= read -r dir; do
  [[ -n "$dir" ]] && KEEP_DIRS+=("--exclude=$dir/")
done < <(git -C "$REPO_ROOT" ls-files specs/ | sed -n 's|^specs/\([^/]*\)/.*|\1|p' | sort -u)

count_specs() { find "$1" -type f -not -name '.DS_Store' 2>/dev/null | wc -l | tr -d ' '; }

case "$CMD" in
  pull)
    before="$(count_specs "$LOCAL_SPECS")"
    # ${arr[@]+...} 是 bash 3.2（macOS 自带）下安全展开可能为空数组写法
    rsync -a --exclude '.DS_Store' ${KEEP_DIRS[@]+"${KEEP_DIRS[@]}"} "$ARCHIVE_DIR/specs/" "$LOCAL_SPECS/"
    after="$(count_specs "$LOCAL_SPECS")"
    if [[ "$before" != "$after" ]]; then
      echo "specs: 已从归档仓恢复（$before → $after 个文件）"
    else
      log "specs: 已是最新（$after 个文件）"
    fi
    ;;

  push)
    rsync -a --checksum --exclude '.DS_Store' "$LOCAL_SPECS/" "$ARCHIVE_DIR/specs/"
    cd "$ARCHIVE_DIR"
    if [[ -n "$(git status --porcelain)" ]]; then
      git add -A
      git commit -q -m "chore: 📦 sync specs archive"
      if [[ "$DO_PUSH_REMOTE" == "1" ]]; then
        git push -q origin HEAD
      fi
      echo "specs: 已归档并推送（$(count_specs "$ARCHIVE_DIR/specs") 个文件）"
    else
      log "specs: 归档仓无变化"
    fi
    ;;

  status)
    echo "本地 specs   : $(count_specs "$LOCAL_SPECS") 个文件"
    echo "归档仓 specs : $(count_specs "$ARCHIVE_DIR/specs") 个文件"
    echo
    echo "本地有但归档仓没有（切分支会丢）："
    comm -23 \
      <(cd "$LOCAL_SPECS" && find . -type f -not -name '.DS_Store' | sort) \
      <(cd "$ARCHIVE_DIR/specs" && find . -type f -not -name '.DS_Store' | sort) \
      | sed 's|^\./|  |'
    ;;

  *)
    echo "用法: bash scripts/specs-sync.sh [pull|push|status] [--hook] [--no-push]" >&2
    exit 1
    ;;
esac
