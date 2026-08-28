#!/usr/bin/env bash
# git-guard-pre-push.sh — 通用 pre-push 护盾（适用于任何 git 项目）
#
# 拦截两类已知坑（2026-08-24 沉淀）：
#   1. 脏 PR：分支从未合并/并行分支切出，带入无关历史提交
#      检查：HEAD 必须包含 origin/main（merge-base --is-ancestor）
#   2. lockfile 不同步：依赖清单变更但 lockfile 未更新（如只更了 pnpm-lock.yaml
#      漏了 package-lock.json），CI npm ci 报 Invalid/Missing
#      检查：package.json 变更时，同目录所有已存在的 lockfile 必须一起变更
#
# 用法：
#   bash scripts/git-guard-pre-push.sh                 # 默认基线 origin/main
#   bash scripts/git-guard-pre-push.sh origin/master   # 自定义基线
# 接入 lefthook（.lefthook.yml）：
#   pre-push:
#     jobs:
#       - name: git-guard
#         run: bash scripts/git-guard-pre-push.sh
set -uo pipefail

BASE_REF="${1:-origin/main}"
FAILED=0

say_fail() { echo "❌ [git-guard] $*" >&2; FAILED=1; }
say_ok()   { echo "✅ [git-guard] $*"; }

# ---------- 检查 1：分支基线（防脏 PR） ----------
if ! git rev-parse --verify "$BASE_REF" >/dev/null 2>&1; then
  # 远程 ref 不存在（如首次推送的仓库），尝试取远程最新
  git fetch origin >/dev/null 2>&1 || true
fi

if git rev-parse --verify "$BASE_REF" >/dev/null 2>&1; then
  # 脏 PR 特征：分支从并行/未合并分支切出，带入大量无关提交（实测 #953 带入 77 个）。
  # 正常任务分支相对基线的提交数通常是个位数。
  AHEAD_COUNT="$(git rev-list --count "$BASE_REF"..HEAD 2>/dev/null || echo 0)"
  if [[ "$AHEAD_COUNT" -gt 30 ]]; then
    say_fail "分支相对 $BASE_REF 有 $AHEAD_COUNT 个提交（远超正常任务规模）——疑似从并行/未合并分支切出，会把无关历史提交带入 PR。"
    echo "  正确姿势：git worktree add -b <分支> origin/main（或 git checkout -b <分支> origin/main）" >&2
  else
    say_ok "分支相对 $BASE_REF 有 $AHEAD_COUNT 个提交（正常范围）"
    # 基线落后仅警告不拦截：PR 冲突由 CI/合并时处理，避免误伤基于旧 main 的合规分支
    if ! git merge-base --is-ancestor "$BASE_REF" HEAD 2>/dev/null; then
      echo "⚠️ [git-guard] 分支落后于 ${BASE_REF}（未包含最新基线），PR 可能冲突。建议先 merge/同步最新 main 再推。" >&2
    fi
  fi
else
  echo "⚠️ [git-guard] 基线 $BASE_REF 不存在，跳过分支基线检查（首次推送场景）" >&2
fi

# ---------- 检查 2：lockfile 同步（防 CI npm ci 失败） ----------
# 收集本次推送涉及的变更文件（相对基线的 diff）
CHANGED_FILES="$(git diff --name-only "$BASE_REF"...HEAD 2>/dev/null || true)"
if [[ -z "$CHANGED_FILES" ]]; then
  # 首次推送无基线 diff，退回检查暂存/工作区
  CHANGED_FILES="$(git diff --cached --name-only; git diff --name-only)"
fi

# 找出所有被变更的依赖清单文件（package.json 等）
CHANGED_MANIFESTS="$(printf '%s\n' "$CHANGED_FILES" | grep -E '(^|/)package\.json$' || true)"

# 依赖字段指纹：只有 dependencies / devDependencies / optionalDependencies /
# peerDependencies / packageManager 变了才需要 lockfile 跟着动。
# 只改 scripts、version、description 之类的元数据不影响 npm ci，
# 拦下来纯属误伤（2026-08-28 加 npm scripts 被拦的教训）。
deps_fingerprint() {
  local ref="$1"
  if ! command -v node >/dev/null 2>&1; then
    echo "NO_NODE"
    return
  fi
  git show "$ref" 2>/dev/null | node -e '
    let s = "";
    process.stdin.on("data", d => s += d);
    process.stdin.on("end", () => {
      try {
        const p = JSON.parse(s);
        const pick = o => (o && typeof o === "object") ? o : {};
        console.log(JSON.stringify([
          pick(p.dependencies), pick(p.devDependencies),
          pick(p.optionalDependencies), pick(p.peerDependencies),
          p.packageManager || ""
        ]));
      } catch (e) {
        console.log("PARSE_ERROR");
      }
    });
  '
}

if [[ -n "$CHANGED_MANIFESTS" ]]; then
  for manifest in $CHANGED_MANIFESTS; do
    dir="$(dirname "$manifest")"

    base_fp="$(deps_fingerprint "$BASE_REF:$manifest")"
    head_fp="$(deps_fingerprint "HEAD:$manifest")"
    if [[ -n "$base_fp" && "$base_fp" != "NO_NODE" && "$base_fp" != "PARSE_ERROR" \
       && "$base_fp" == "$head_fp" ]]; then
      say_ok "$manifest 仅非依赖字段变更（scripts / 元数据），跳过 lockfile 校验"
      continue
    fi

    echo "[git-guard] 检测到依赖变更，校验 lockfile 同步…"
    # Normalize "." so lock paths match `git diff --name-only` (no ./ prefix).
    if [[ "$dir" == "." ]]; then
      dir=""
    fi
    # Same-directory lockfile shapes (npm / pnpm / yarn).
    for lock_name in package-lock.json pnpm-lock.yaml yarn.lock; do
      if [[ -n "$dir" ]]; then
        lock="$dir/$lock_name"
      else
        lock="$lock_name"
      fi
      if [[ -f "$lock" ]]; then
        if printf '%s\n' "$CHANGED_FILES" | grep -qxF "$lock"; then
          say_ok "$lock 已随清单更新"
        else
          say_fail "$manifest 已变更，但 $lock 未更新。依赖升级必须同步所有 lockfile（CLI/CI 用 npm ci 校验）。"
        fi
      fi
    done
  done
else
  say_ok "无依赖清单变更"
fi

if [[ "$FAILED" -ne 0 ]]; then
  echo "❌ [git-guard] push 被拒绝，请修复上述问题后重试。" >&2
  exit 1
fi
echo "✅ [git-guard] pre-push 检查全部通过"
