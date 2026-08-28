#!/usr/bin/env bash
# git-guard-internal.sh — pre-commit 护盾：阻止两个本地内部目录入库
#
#   specs/       需求/设计/任务文档，含内部信息（GEL 审视报告、内部任务与
#                goal ID、评测与归因上下文）
#   .workbuddy/  IDE 本地状态（AI 每日记忆、plans、expert 会话历史），
#                类比 .idea/ / .vscode/，本不该进版本控制，同样带内部任务 ID
#
# 背景（2026-08-28 沉淀）：
#   两个目录都已从公开仓库停止跟踪并私有归档。但以下场景仍会把它们带回仓库：
#     1. `git add -f specs/... .workbuddy/...` 强行绕过 .gitignore
#     2. 在基于旧 main 的 git worktree 里工作 —— 那里的 .gitignore 还没有
#        这些规则，git add 完全不受阻（实测 7 个 worktree 里 specs 仍处于
#        tracked 状态）
#     3. AI agent 不读 AGENTS.md，凭习惯直接建 specs/ 并 git add .
#
#   靠文档约定拦不住这些场景，所以加一道机械防线。本脚本不硬编码归档仓库
#   地址（避免在公开仓库里多处散落内部信息），改为指向 AGENTS.md 的
#   <internal_dirs> 段，并给出从 origin/main 读取该段的方式 —— 这样即使在
#   旧 worktree 里，撞墙时也能立刻拿到完整的同步/获取命令。
#
# 用法：
#   bash scripts/git-guard-internal.sh         # 检查当前 staged 内容
#   LEFTHOOK=0 git commit ...                  # 确需放行时绕过（不推荐）
#
# 接入 lefthook（lefthook.yml）：
#   pre-commit:
#     jobs:
#       - name: internal-docs-guard
#         run: bash scripts/git-guard-internal.sh
set -uo pipefail

# 白名单：这两个 specs 子目录有真实功能依赖，必须留在仓库里
#   - plugin-marketplace-listing: scripts/analyze-plugin-marketplace.mjs
#     与 tests/plugin-marketplace-listing.test.js 的数据文件
#   - npm-supply-chain-security-hardening: AGENTS.md 供应链安全章节强制引用
# 白名单只适用于 specs/；.workbuddy/ 全量禁止。
WHITELIST=(
  "specs/plugin-marketplace-listing/"
  "specs/npm-supply-chain-security-hardening/"
)

STAGED="$(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null || true)"
if [[ -z "$STAGED" ]]; then
  exit 0
fi

OFFENDERS=()
while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  case "$f" in
    specs/*) ;;
    .workbuddy/*) ;;
    *) continue ;;
  esac

  keep=0
  for w in "${WHITELIST[@]}"; do
    if [[ "$f" == "$w"* ]]; then
      keep=1
      break
    fi
  done

  if [[ "$keep" -eq 0 ]]; then
    OFFENDERS+=("$f")
  fi
done <<< "$STAGED"

if [[ ${#OFFENDERS[@]} -eq 0 ]]; then
  exit 0
fi

echo "" >&2
echo "❌ [internal-guard] 检测到 ${#OFFENDERS[@]} 个内部目录文件被暂存，已阻止提交" >&2
echo "" >&2
echo "   以下两个都是本仓库的本地内部目录，已从公开仓库停止跟踪：" >&2
echo "     - specs/       含 GEL 报告、内部任务 ID、评测/归因上下文" >&2
echo "     - .workbuddy/  IDE 本地状态（AI 记忆、plans），含内部任务 ID" >&2
echo "" >&2
echo "   本次被暂存的文件：" >&2
echo "" >&2
for f in "${OFFENDERS[@]}"; do
  echo "     - $f" >&2
done
echo "" >&2
echo "── 怎么处理 ────────────────────────────────────────────────" >&2
echo "" >&2
echo "   1. 从暂存区移除（本地文件会保留，不会丢）：" >&2
echo "" >&2
echo "        git restore --staged ${OFFENDERS[0]}" >&2
echo "        # 或多个文件：" >&2
echo "        git restore --staged specs/ .workbuddy/" >&2
echo "" >&2
echo "   2. 确认这些文件已不再是 tracked（旧 worktree 常见）：" >&2
echo "" >&2
echo "        git rm -r --cached specs/ .workbuddy/" >&2
echo "        git add specs/plugin-marketplace-listing specs/npm-supply-chain-security-hardening" >&2
echo "" >&2
echo "   3. 需要归档或查阅历史内容 —— 完整同步/获取命令见仓库根目录" >&2
echo "      AGENTS.md 的 <internal_dirs> 段。若本地 AGENTS.md 是旧版本（worktree" >&2
echo "      基于旧 main），直接读 origin/main 上的那份：" >&2
echo "" >&2
echo "        git show origin/main:AGENTS.md | grep -A 30 '<internal_dirs>'" >&2
echo "" >&2
echo "   4. 白名单目录（specs/plugin-marketplace-listing /" >&2
echo "      specs/npm-supply-chain-security-hardening）不受此限制，可正常提交。" >&2
echo "" >&2
echo "   确需强行放行（不推荐）：LEFTHOOK=0 git commit ..." >&2
echo "" >&2

exit 1
