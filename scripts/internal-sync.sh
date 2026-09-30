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
#   specs/        有白名单子目录（仍在版本控制中），pull 时排除，避免冲掉未提交改动。
#                 其余内容 pull 也用 -u：本地比归档仓新就不覆盖。pull 挂在 pre-commit 与
#                 post-checkout 上，没有 -u 时，刚写进 specs/ 还没归档的内容会被归档仓的
#                 旧版本静默冲掉（实测发生过）。
#   .workbuddy/   IDE 本地状态，全量取消跟踪。pull 用 -u 保护本地实时状态
#                 （IDE 会自己写 memory / mcp.json，本地比归档仓新就不该被覆盖）
#
# 归档仓位置不在本仓库内硬编码（公开仓库不泄漏私有位置），按序读取：
#   1. 环境变量 INTERNAL_ARCHIVE_DIR（旧名 SPECS_ARCHIVE_DIR 仍兼容）
#   2. 配置文件 ~/.config/cloudbase-mcp/internal-archive-dir（一行路径）
#   3. 配置文件 ~/.config/cloudbase-mcp/specs-archive-dir（旧路径，同上兼容）
# 都没有时静默退出 0 —— hook 场景不能因为没配置就把 git 操作卡住。
#
# 归档前的密钥自检：
#   扫描类工具会把命中的凭证原值逐字写进产物（riskCode / poc 字段），而这些产物
#   曾随 specs/ 整目录同步推到归档仓 —— 等于把密钥又复制一份出去。
#   现在：① runs/ agents/ 不参与归档；② push 前跑一次「密钥形态」自检，命中即中止；
#        ③ prune-evidence 用来清掉归档仓里已经存在的这两类目录。
#   `check` 可单独跑自检（只读）。豁免名单放仓库根 .internal-sync-ignore。
#
# 用法：
#   bash scripts/internal-sync.sh [pull|push|status|check|prune-evidence] [--hook] [--no-push] [--skip-secret-check]

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
SKIP_SECRET_CHECK=0
for arg in "$@"; do
  case "$arg" in
    --hook)              HOOK_MODE=1 ;;
    --no-push)           DO_PUSH_REMOTE=0 ;;
    # 只在确认自检误报时使用：跳过密钥自检直接归档。用之前先看一眼 check 的输出。
    --skip-secret-check) SKIP_SECRET_CHECK=1 ;;
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

# 归档要忽略的垃圾文件（rsync 与计数两处判据必须一致）：
#   .DS_Store             macOS 元数据
#   .<name>.<10 位随机>    编辑器「临时名 + rename」原子写被打断留下的残片
#                         （内容与同名正式文件逐字节相同，无归档价值；一个残片
#                          还会被 pull 复制到所有 worktree，越滚越多）
# 后缀写死 10 位是实测形态，同时也是为了不误伤 .env.local / .env.example
# 这类名称里带点的正常隐藏文件（它们的后缀长度不同）。rsync 的 ? 与 shell 不同，
# 匹配单个字符。
JUNK_RE='/\.DS_Store$|/\.[^/]*\.[A-Za-z0-9]{10}$'

# 额外不参与归档的目录（见下方密钥自检一节）：
#   runs/ agents/         扫描类工具的「原始产物」目录 —— 可复现、无归档价值，
#                         且会把命中的凭证原值逐字带进去（riskCode / poc 字段）。
EVIDENCE_RE='/(runs|agents)/'

# 归档侧判据（rsync + 计数 + push 自检都用它）
IGNORE_RE="$JUNK_RE|$EVIDENCE_RE"
RSYNC_JUNK=(--exclude '.DS_Store' --exclude '.*.??????????' --exclude 'runs/' --exclude 'agents/')

# ── 密钥自检（归档前的最后一道闸）──────────────────────────────────────────
# 背景：扫描/审计工具会把「命中的凭证原值」逐字写进产物（riskCode / poc 字段，
# 见上面的 runs/ agents/ 注释）。specs/ 又是整目录 rsync 到私有仓再 push，
# 全程没有脱敏 —— 于是「扫出一个密钥」变成了「把密钥又复制一份出去」。
#
# 三层防线，从粗到细：
#   ① 目录级：runs/ agents/ 不参与归档（在上面的 IGNORE_RE / RSYNC_JUNK 里）
#   ② 内容级：push 之前对本地两份目录做一次「密钥形态」自检，命中即中止，
#             不 rsync、不 commit、不 push（`check` 子命令可单独跑）
#   ③ 存量级：`prune-evidence` 把归档仓里已经存在的 runs/ agents/ 清掉
#
# 判据只认「密钥」，不认账号标识：AppID / UIN / envId 是公开或半公开的标识
# 把它们也算进来只会让正常的决策文档没法归档。
# 命中时只打印文件名，绝不回显匹配到的值。
SECRET_KW='(client_?secret|app_?secret|appsecret|secret_?key|secret|token|password|passwd|private_?key|access_?key|api_?key|apikey|authorization|x-api-key)'
# 每条规则写成「模式|过滤|正则」：
#   模式 i = 忽略大小写，s = 区分大小写。
#     厂商前缀必须区分大小写 —— 否则 AKID 会撞上 "AkiD…" 这种恰好开头的随机串（实测踩过）。
#   过滤 3digit = 只保留「值里至少 3 个数字」的匹配。
#     「值 ≥16 位且有足够熵」没法用一个 ERE 干净表达（数字位置不定），所以拆两步：
#     正则只保证 ≥16 位，熵的判据在过滤阶段做。这样
#       · Token:defaultToConfig2（TS 函数名）      → 只 1 个数字，过滤掉
#       · token=e.AuthData.Token（代码表达式）    → 0 个数字，过滤掉
#       · {{env.TCB_TCR_PASSWORD}}（模板）        → 值字符集不含 { } 已被正则挡掉
#       · abcdef0123456789ab / 32 位 hex（真值）  → 数字充足，照报
#     代价：纯字母的短密钥（如某些 20 位 base64）可能漏——判据取「宁可少见，不可误伤」，
#     因为误伤会让这道闸被习惯性跳过，那才是真的失效。
SECRET_RES=(
  # 键值形态：secret / password / token / api_key / authorization … 后跟 ≥16 位值
  # 引号位置允许 HTML 实体（产物里的 HTML 报告会把 ' 写成 &#x27;）。
  "i|3digit|${SECRET_KW}[[:space:]]*[:=][[:space:]]*(&#x27;|&quot;|&#39;|&apos;|[\"'\`])?[A-Za-z0-9/+_.-]{16,}"
  # 厂商密钥前缀
  's||(AKID[A-Za-z0-9]{13,}|sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,}|glpat-[A-Za-z0-9_-]{18,}|xox[abprs]-[A-Za-z0-9-]{10,}|AIza[A-Za-z0-9_-]{30,}|BEGIN [A-Z ]*PRIVATE KEY)'
)
# 占位符豁免：值本身长得就像示例/占位/已打码，不算命中。
# （例如有人故意写个 AKIDverifyOnlyNotARealCredential 来验证正则）。
SECRET_ALLOW_RE='verifyOnly|notAReal|NotAReal|PLACEHOLDER|placeholder|EXAMPLE|Example|YOUR_|xxxx|XXXX|dummy|DUMMY|fake|FAKE|redacted|REDACTED'

# 目录不存在时 find 返回非 0，pipefail 会让命令替换整体失败、被 set -e 杀掉。
# （切分支把目录清空后正是这种场景，必须兜住）所以显式吃掉失败、回落 0。
# 过滤后无剩余时 grep -v 返回 1，同样要兜住。
list_files() {
  find "${1:-.}" -type f 2>/dev/null | grep -vE "$IGNORE_RE" || true
}
count() {
  local n
  n=$(list_files "$1" | wc -l) || n=0
  echo "${n// /}"
}

# 自检豁免名单：仓库根目录 .internal-sync-ignore（一行一个路径前缀，`#` 注释）。
# 放行某个文件时应优先用它，而不是 --skip-secret-check（那是跳过整道闸）。
SYNC_IGNORE=( )
if [[ -f "$REPO_ROOT/.internal-sync-ignore" ]]; then
  while IFS= read -r line; do
    line="${line%%#*}"
    line="${line#"${line%%[![:space:]]*}"}"
    line="${line%"${line##*[![:space:]]}"}"
    [[ -n "$line" ]] && SYNC_IGNORE+=("$line")
  done < "$REPO_ROOT/.internal-sync-ignore"
fi

# 把任意绝对路径归一成 specs/... 或 .workbuddy/... 再比前缀，
# 这样本地目录和归档仓目录能共用同一份名单。
is_ignored() {
  local f="$1" rel="" p
  case "$f" in
    */specs/*)      rel="specs/${f#*/specs/}" ;;
    */.workbuddy/*) rel=".workbuddy/${f##*/.workbuddy/}" ;;
    *)              return 1 ;;
  esac
  for p in ${SYNC_IGNORE[@]+"${SYNC_IGNORE[@]}"}; do
    case "$rel" in "$p"*) return 0 ;; esac
  done
  return 1
}

# 扫一个目录里「像密钥」的文件，只输出文件名。
#   mode=sync（默认）：按归档判据排除 runs/ agents/（这些文件根本不会被同步）
#   mode=all         ：只排除垃圾文件 —— 用来查看归档仓里「实际已经躺着什么」，
#                      否则存量明文会被目录排除一并挡掉，自检假报通过。
scan_secrets() {
  local dir="$1" mode="${2:-sync}" i=0 rule flag filt re f flt gl gf n_real
  [[ -d "$dir" ]] || return 0
  if [[ "$mode" == "all" ]]; then flt="$JUNK_RE"; else flt="$IGNORE_RE"; fi
  while [[ $i -lt ${#SECRET_RES[@]} ]]; do
    rule="${SECRET_RES[$i]}"
    flag="${rule%%|*}"; rule="${rule#*|}"
    filt="${rule%%|*}"; re="${rule#*|}"
    if [[ "$flag" == "i" ]]; then gl="-rliE"; gf="-oiE"; else gl="-rlE"; gf="-oE"; fi
    # 先按形态捞文件，再做二次判定（过滤 + 占位符豁免）—— 只要还剩一条「像真凭证」
    # 的匹配，这个文件就要报出来。
    # 注意别用 `grep -q`：它命中第一条就退出，会让上游 grep 吃到 SIGPIPE，
    # 配上 pipefail 整条管道会被判成「没命中」—— 匹配条数多的文件（HTML 报告）
    # 反而因此漏检。这里全程用计数式判定，避免提前退出。
    grep $gl "$re" "$dir" 2>/dev/null | grep -vE "$flt" | while IFS= read -r f; do
      if ! is_ignored "$f"; then
        if [[ "$filt" == "3digit" ]]; then
          n_real="$(grep $gf "$re" "$f" 2>/dev/null | grep -E '([0-9][^0-9]*){3,}' | grep -vcE "$SECRET_ALLOW_RE" || true)"
        else
          n_real="$(grep $gf "$re" "$f" 2>/dev/null | grep -vcE "$SECRET_ALLOW_RE" || true)"
        fi
        [[ "${n_real:-0}" != "0" ]] && printf '%s\n' "$f"
      fi
    done || true
    i=$((i + 1))
  done
  return 0
}

# 用法: collect_secrets <outfile> <mode> <dir>...  把命中文件名去重写入 outfile
collect_secrets() {
  local out="$1" mode="$2"; shift 2
  : > "$out"
  local dir
  for dir in "$@"; do scan_secrets "$dir" "$mode" >> "$out"; done
  sort -u -o "$out" "$out"
}

case "$CMD" in
  pull)
    b1="$(count "$LOCAL_SPECS")"
    mkdir -p "$LOCAL_SPECS"
    rsync -au "${RSYNC_JUNK[@]}" ${KEEP_DIRS[@]+"${KEEP_DIRS[@]}"} "$ARCHIVE_DIR/specs/" "$LOCAL_SPECS/"
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
      rsync -au "${RSYNC_JUNK[@]}" "$ARCHIVE_DIR/.workbuddy/" "$LOCAL_WB/"
      a2="$(count "$LOCAL_WB")"
      if [[ "$b2" != "$a2" ]]; then
        echo ".workbuddy: 已从归档仓恢复（$b2 → $a2 个文件）"
      else
        log ".workbuddy: 已是最新（$a2 个文件）"
      fi
    fi
    ;;

  push)
    # ② 内容级防线：归档前先自检，命中就整体中止 —— 不 rsync、不 commit、不 push。
    #    先扫再动，避免出现「一半已同步、一半没同步」的中间态。
    if [[ "$SKIP_SECRET_CHECK" != "1" ]]; then
      SECRET_TMP="$(mktemp)"
      collect_secrets "$SECRET_TMP" sync "$LOCAL_SPECS" "$LOCAL_WB"
      if [[ -s "$SECRET_TMP" ]]; then
        {
          echo
          echo "✋ 归档已中止：下面这些文件里出现了「密钥形态」的内容，"
          echo "   直接归档等于把密钥再复制一份到归档仓。"
          echo
          sed "s|^$REPO_ROOT/|  |" "$SECRET_TMP"
          echo
          echo "   处理方式二选一："
          echo "     · 该文件本来就不该归档 → 加进 .internal-sync-ignore（一行一个路径前缀）"
          echo "     · 确实是密钥           → 先把它从文件里去掉/替换成占位符，再重跑"
          echo "   确认是自检误报才用 --skip-secret-check 跳过（会跳过整道闸，别习惯性加）。"
          echo
        } >&2
        rm -f "$SECRET_TMP"
        exit 1
      fi
      rm -f "$SECRET_TMP"
    else
      echo "⚠️  已跳过密钥自检（--skip-secret-check）" >&2
    fi

    rsync -a --checksum "${RSYNC_JUNK[@]}" "$LOCAL_SPECS/" "$ARCHIVE_DIR/specs/" 2>/dev/null || true
    if [[ -d "$LOCAL_WB" ]]; then
      mkdir -p "$ARCHIVE_DIR/.workbuddy"
      rsync -a --checksum "${RSYNC_JUNK[@]}" "$LOCAL_WB/" "$ARCHIVE_DIR/.workbuddy/" 2>/dev/null || true
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
        <(cd "$local_d" && list_files . | sort) \
        <(cd "$arch_d"  && list_files . | sort) \
        | sed 's|^\./|  |'
    done
    ;;

  check)
    # 只读自检：不写归档仓、不 commit、不 push。
    # 本地按归档判据扫；归档仓按 mode=all 扫 —— 要能看到里面「实际已经躺着」什么，
    # 包括那些已经被目录排除、但历史上推上去过的原始产物。
    SECRET_TMP="$(mktemp)"
    collect_secrets "$SECRET_TMP" sync "$LOCAL_SPECS" "$LOCAL_WB"
    A_TMP="$(mktemp)"
    collect_secrets "$A_TMP" all "$ARCHIVE_DIR/specs" "$ARCHIVE_DIR/.workbuddy"
    ln="$(wc -l < "$SECRET_TMP" | tr -d ' ')"
    an="$(wc -l < "$A_TMP" | tr -d ' ')"
    if [[ "$ln" == "0" && "$an" == "0" ]]; then
      echo "✅ 自检通过：本地待归档内容与归档仓里都没有「密钥形态」的内容"
    else
      if [[ "$ln" != "0" ]]; then
        echo "✋ 本地待归档内容里有 $ln 个「像含密钥」的文件（push 会被中止）："
        sed "s|^$REPO_ROOT/|  |" "$SECRET_TMP"
      fi
      if [[ "$an" != "0" ]]; then
        echo "✋ 归档仓里已有 $an 个「像含密钥」的文件（存量，跑 prune-evidence 清掉）："
        sed "s|^$ARCHIVE_DIR/|  [归档仓] |" "$A_TMP"
      fi
      echo
      echo "   只列文件名，不回显匹配到的值。确认是误报 → 加进 .internal-sync-ignore。"
    fi
    rm -f "$SECRET_TMP" "$A_TMP"
    [[ "$ln" == "0" && "$an" == "0" ]] || exit 1
    ;;

  prune-evidence)
    # ③ 存量级防线：把归档仓里已经存在的原始证据目录（runs/ agents/）清掉。
    # 只删这两类目录，不碰其它内容；不重写历史（历史里那份靠轮换作废，见第 07 节）。
    cd "$ARCHIVE_DIR"
    SECRET_TMP="$(mktemp)"
    git ls-files | grep -E '(^|/)(runs|agents)/' > "$SECRET_TMP" || true
    n="$(wc -l < "$SECRET_TMP" | tr -d ' ')"
    if [[ "$n" == "0" ]]; then
      log "归档仓里没有 runs/ 或 agents/ 目录，无需清理"
    else
      tr '\n' '\0' < "$SECRET_TMP" | xargs -0 git rm -q --ignore-unmatch --
      git commit -q -m "chore: 🧹 归档仓移除扫描原始产物目录（runs/ agents/，含明文凭证）"
      echo "已从归档仓移除 $n 个原始产物文件并提交"
      if [[ "$DO_PUSH_REMOTE" == "1" ]]; then
        git push -q origin HEAD
        echo "已推送到远端"
      fi
    fi
    rm -f "$SECRET_TMP"
    ;;

  *)
    echo "用法: bash scripts/internal-sync.sh [pull|push|status|check|prune-evidence] [--hook] [--no-push] [--skip-secret-check]" >&2
    echo "  pull            归档仓 → 本地（切分支被清空后恢复；pre-commit 自动跑）" >&2
    echo "  push            本地 → 归档仓（含密钥自检，命中则中止）" >&2
    echo "  status          显示本地与归档仓之间的漂移" >&2
    echo "  check           只读：扫「像含密钥」的文件（本地 + 归档仓）" >&2
    echo "  prune-evidence  从归档仓移除 runs/ agents/ 原始产物目录（一次性清理）" >&2
    exit 1
    ;;
esac
