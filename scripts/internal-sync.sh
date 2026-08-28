#!/usr/bin/env bash
#
# 内部目录归档同步脚本（specs/ 与 .workbuddy/）
#
# 背景：
#   specs/ 与 .workbuddy/ 都是本地目录，已从公开仓库移除
#   （.gitignore + git rm --cached），只归档到私有仓库。副作用是：切分支 /
#   merge 新 main 时，git 会把这些原本 tracked 的文件从工作区删掉
#   （属预期行为，不是数据丢失）。本脚本负责两个方向的搬运：
#
#     pull    归档仓 -> 本地   切分支被清空后恢复（pre-commit 自动跑）
#     push    本地   -> 归档仓 新写或改过的内容归档，避免切分支时丢
#     status  显示本地与归档仓之间的漂移
#
# 两个目录的差异：
#   specs/        有白名单子目录（仍在版本控制中），pull 时排除，避免冲掉未提交改动
#   .workbuddy/   IDE 本地状态，全量取消跟踪。pull 用 -u 保护本地实时状态
#                 （IDE 会自己写 memory / mcp.json，本地比归档仓新就不该被覆盖）
#
# 归档仓位置不在本仓库内硬编码（公开仓库不泄漏私有位置），按序读取：
#   1. 环境变量 INTERNAL_ARCHIVE_DIR（旧名 SPECS_ARCHIVE_DIR 仍兼容）
#   2. 配置文件 ~/.config/cloudbase-mcp/internal-archive-dir（一行路径）
#   3. 配置文件 ~/.config/cloudbase-mcp/specs-archive-dir（旧路径，同上兼容）
# 都没有时静默退出 0 —— hook 场景不能因为没配置就把 git 操作卡住。
#
# 用法：
#   bash scripts/internal-sync.sh [pull|push|status] [--hook] [--no-push]

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
LOCAL_SPECS="$REPO_ROOT/specs"
LOCAL_WB="$REPO_ROOT/.workbuddy"

CONFIG_NEW="${HOME}/.config/cloudbase-mcp/internal-archive-dir"
CONFIG_OLD="${HOME}/.config/cloudbase-mcp/specs-archive-dir"
ARCHIVE_DIR="${INTERNAL_ARCHIVE_DIR:-${SPECS_ARCHIVE_DIR:-}}"
if [[ -z "$ARCHIVE_DIR" && -f "$CONFIG_NEW" ]]; then
  ARCHIVE_DIR="$(head -n 1 "$CONFIG_NEW" | tr -d '[:space:]')"
fi
if [[ -z "$ARCHIVE_DIR" && -f "$CONFIG_OLD" ]]; then
  ARCHIVE_DIR="$(head -n 1 "$CONFIG_OLD" | tr -d '[:space:]')"
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

# 仍在版本控制里的白名单目录：pull 时不覆盖，避免冲掉未提交改动。
# ${arr[@]+...} 是 bash 3.2（macOS 自带）下安全展开可能为空数组的写法。
KEEP_DIRS=()
while IFS= read -r dir; do
  [[ -n "$dir" ]] && KEEP_DIRS+=("--exclude=$dir/")
done < <(git -C "$REPO_ROOT" ls-files specs/ | sed -n 's|^specs/\([^/]*\)/.*|\1|p' | sort -u)

# 目录不存在时 find 返回非 0，pipefail 会让命令替换整体失败、被 set -e 杀掉。
# （切分支把目录清空后正是这种场景，必须兜住）所以显式吃掉失败、回落 0。
count() {
  local n
  n=$(find "$1" -type f -not -name '.DS_Store' 2>/dev/null | wc -l) || n=0
  echo "${n// /}"
}

case "$CMD" in
  pull)
    b1="$(count "$LOCAL_SPECS")"
    mkdir -p "$LOCAL_SPECS"
    rsync -a --exclude '.DS_Store' ${KEEP_DIRS[@]+"${KEEP_DIRS[@]}"} "$ARCHIVE_DIR/specs/" "$LOCAL_SPECS/"
    a1="$(count "$LOCAL_SPECS")"
    if [[ "$b1" != "$a1" ]]; then
      echo "specs: 已从归档仓恢复（$b1 → $a1 个文件）"
    else
      log "specs: 已是最新（$a1 个文件）"
    fi

    if [[ -d "$ARCHIVE_DIR/.workbuddy" ]]; then
      b2="$(count "$LOCAL_WB")"
      mkdir -p "$LOCAL_WB"
      # -u：本地比归档仓新的文件是 IDE 刚写的实时状态，不覆盖
      rsync -au --exclude '.DS_Store' "$ARCHIVE_DIR/.workbuddy/" "$LOCAL_WB/"
      a2="$(count "$LOCAL_WB")"
      if [[ "$b2" != "$a2" ]]; then
        echo ".workbuddy: 已从归档仓恢复（$b2 → $a2 个文件）"
      else
        log ".workbuddy: 已是最新（$a2 个文件）"
      fi
    fi
    ;;

  push)
    rsync -a --checksum --exclude '.DS_Store' "$LOCAL_SPECS/" "$ARCHIVE_DIR/specs/" 2>/dev/null || true
    if [[ -d "$LOCAL_WB" ]]; then
      mkdir -p "$ARCHIVE_DIR/.workbuddy"
      rsync -a --checksum --exclude '.DS_Store' "$LOCAL_WB/" "$ARCHIVE_DIR/.workbuddy/" 2>/dev/null || true
    fi
    cd "$ARCHIVE_DIR"
    if [[ -n "$(git status --porcelain)" ]]; then
      git add -A
      git commit -q -m "chore: 📦 sync internal archive (specs + .workbuddy)"
      if [[ "$DO_PUSH_REMOTE" == "1" ]]; then
        git push -q origin HEAD
      fi
      echo "已归档并推送（specs $(count "$ARCHIVE_DIR/specs") / .workbuddy $(count "$ARCHIVE_DIR/.workbuddy") 个文件）"
    else
      log "归档仓无变化"
    fi
    ;;

  status)
    printf "%-24s %s\n" "本地 specs:"      "$(count "$LOCAL_SPECS") 个文件"
    printf "%-24s %s\n" "归档仓 specs:"    "$(count "$ARCHIVE_DIR/specs") 个文件"
    printf "%-24s %s\n" "本地 .workbuddy:"  "$(count "$LOCAL_WB") 个文件"
    printf "%-24s %s\n" "归档仓 .workbuddy:" "$(count "$ARCHIVE_DIR/.workbuddy") 个文件"
    for pair in "specs:$LOCAL_SPECS:$ARCHIVE_DIR/specs" ".workbuddy:$LOCAL_WB:$ARCHIVE_DIR/.workbuddy"; do
      name="${pair%%:*}"; rest="${pair#*:}"; local_d="${rest%%:*}"; arch_d="${rest##*:}"
      [[ -d "$arch_d" ]] || continue
      if [[ ! -d "$local_d" ]]; then
        echo
        echo "$name —— 本地目录不存在（切分支已清空，跑 pull 恢复）"
        continue
      fi
      echo
      echo "$name —— 本地有但归档仓没有（切分支会丢）："
      comm -23 \
        <(cd "$local_d" && find . -type f -not -name '.DS_Store' | sort) \
        <(cd "$arch_d"  && find . -type f -not -name '.DS_Store' | sort) \
        | sed 's|^\./|  |'
    done
    ;;

  *)
    echo "用法: bash scripts/internal-sync.sh [pull|push|status] [--hook] [--no-push]" >&2
    exit 1
    ;;
esac
