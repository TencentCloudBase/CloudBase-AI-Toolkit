#!/usr/bin/env python3
"""把所有 git worktree 的 specs/ 与 .workbuddy/ 收进私有归档仓。

为什么需要它：
    scripts/internal-sync.sh 只同步「当前工作区」。写在一个 worktree 里的
    新文档（untracked，或改了没归档）不在任何 commit 里，切分支 / 清理
    worktree 就永久没了 —— 这种事已经发生过（2026-08-28 cb-ide-mcp-upgrade
    的 18 个文件）。本脚本扫全部 worktree，把漂移补齐。

挑选规则（文件级，避免版本倒退）：
    - 归档仓没有的            -> 收
    - 两边都有、内容不同      -> mtime 新的赢
    - 内容相同                -> 跳过

    mtime 比对的坑：归档仓里的文件被 git checkout 过，mtime 会被刷新成
    checkout 时间、反而比源文件新，所以只在「内容确实不同」时才比 mtime，
    不用 rsync -u（那会直接漏归档）。

用法：
    python3 scripts/internal-archive-all.py            # 归档并推送
    python3 scripts/internal-archive-all.py --no-push  # 只提交不推送
    python3 scripts/internal-archive-all.py --dry-run  # 只看会做什么

归档仓位置与 internal-sync.sh 一致（不写死在公开仓库里）：
    环境变量 INTERNAL_ARCHIVE_DIR / SPECS_ARCHIVE_DIR，或
    ~/.config/cloudbase-mcp/internal-archive-dir、specs-archive-dir
没配置时静默退出 0，不阻塞定时任务。
"""

from __future__ import annotations

import hashlib
import os
import shutil
import subprocess
import sys
import time

DIRS = ("specs", ".workbuddy")

# 构建产物 / 备份 / 依赖不归档：体积大、可从源头重建（IDE 备份、bundle 产物等）。
# 本脚本直接扫文件系统，读不到各 spec 自己 .gitignore 里那层规则，所以在这里
# 显式排除。放在这里的是"产物类别"，不是某个 spec 的特例。
EXCLUDE_PARTS = {"node_modules", "dist", "build", "bundle", "backup", ".git", ".DS_Store"}


def archive_dir() -> str:
    for key in ("INTERNAL_ARCHIVE_DIR", "SPECS_ARCHIVE_DIR"):
        v = os.environ.get(key, "").strip()
        if v:
            return os.path.expanduser(v)
    for name in ("internal-archive-dir", "specs-archive-dir"):
        p = os.path.expanduser(f"~/.config/cloudbase-mcp/{name}")
        if os.path.isfile(p):
            with open(p, encoding="utf-8") as f:
                v = f.readline().strip()
            if v:
                return os.path.expanduser(v)
    return ""


def md5(path: str) -> str:
    h = hashlib.md5()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def scan(base: str) -> dict[str, tuple[str, float]]:
    """返回 {相对路径: (内容哈希, mtime)}，跳过 .git / .DS_Store / 产物目录。"""
    out: dict[str, tuple[str, float]] = {}
    for dirpath, dirnames, filenames in os.walk(base):
        dirnames[:] = [d for d in dirnames if d not in EXCLUDE_PARTS]
        for name in filenames:
            if name in EXCLUDE_PARTS:
                continue
            p = os.path.join(dirpath, name)
            if os.path.islink(p):
                # 软链按目标路径比对（.workbuddy/skills/* 就是软链）
                out[os.path.relpath(p, base)] = ("link:" + os.readlink(p), 0.0)
                continue
            try:
                st = os.stat(p)
                out[os.path.relpath(p, base)] = (md5(p), st.st_mtime)
            except OSError:
                continue
    return out


def worktrees(repo: str) -> list[str]:
    out = subprocess.run(
        ["git", "worktree", "list", "--porcelain"],
        cwd=repo, capture_output=True, text=True, check=True,
    ).stdout
    return [ln.split(" ", 1)[1] for ln in out.splitlines() if ln.startswith("worktree ")]


def main() -> int:
    args = set(sys.argv[1:])
    dry = "--dry-run" in args
    do_push = "--no-push" not in args

    repo = subprocess.run(
        ["git", "rev-parse", "--show-toplevel"],
        capture_output=True, text=True, check=True,
    ).stdout.strip()
    arch = archive_dir()
    if not arch or not os.path.isdir(os.path.join(arch, "specs")):
        return 0  # 未配置归档仓，静默跳过

    added: dict[str, list[str]] = {d: [] for d in DIRS}
    updated: dict[str, list[str]] = {d: [] for d in DIRS}

    for d in DIRS:
        arch_root = os.path.join(arch, d)
        os.makedirs(arch_root, exist_ok=True)
        current = scan(arch_root)

        # 每个文件只保留「内容不同时 mtime 最新」的那份
        best: dict[str, tuple[str, float, str]] = {}
        for wt in worktrees(repo):
            src = os.path.join(wt, d)
            if not os.path.isdir(src):
                continue
            for rel, (h, mt) in scan(src).items():
                if rel not in best or mt > best[rel][1]:
                    best[rel] = (h, mt, os.path.join(src, rel))

        for rel, (h, mt, src_path) in best.items():
            dst_path = os.path.join(arch_root, rel)
            if rel not in current:
                added[d].append(rel)
            elif current[rel][0] == h:
                continue
            elif mt <= current[rel][1]:
                continue  # 归档仓这份更新，别倒退
            else:
                updated[d].append(rel)

            if dry:
                continue
            os.makedirs(os.path.dirname(dst_path), exist_ok=True)
            if os.path.lexists(dst_path):
                os.remove(dst_path)
            shutil.copy2(src_path, dst_path, follow_symlinks=False)

    total = sum(len(v) for v in added.values()) + sum(len(v) for v in updated.values())
    stamp = time.strftime("%m-%d %H:%M")
    if dry:
        print(f"[{stamp}] dry-run：将新增 {sum(len(v) for v in added.values())} 个、"
              f"更新 {sum(len(v) for v in updated.values())} 个")
        for d in DIRS:
            for rel in added[d]:
                print(f"  + {d}/{rel}")
            for rel in updated[d]:
                print(f"  ~ {d}/{rel}")
        return 0

    if total == 0:
        return 0

    subprocess.run(["git", "add", "-A"], cwd=arch, check=True)
    if subprocess.run(["git", "diff", "--cached", "--quiet"], cwd=arch).returncode == 0:
        return 0  # 归档仓无实际变更
    subprocess.run(
        ["git", "commit", "-q", "-m",
         f"chore: 🤖 scheduled archive sweep (+{sum(len(v) for v in added.values())} "
         f"new, {sum(len(v) for v in updated.values())} updated)"],
        cwd=arch, check=True,
    )
    if do_push:
        subprocess.run(["git", "push", "-q", "origin", "HEAD"], cwd=arch, check=True)

    print(f"[{stamp}] 已归档推送：新增 {sum(len(v) for v in added.values())} 个、"
          f"更新 {sum(len(v) for v in updated.values())} 个")
    for d in DIRS:
        for rel in added[d][:20]:
            print(f"  + {d}/{rel}")
        for rel in updated[d][:20]:
            print(f"  ~ {d}/{rel}")
        extra = len(added[d]) + len(updated[d]) - 40
        if extra > 0:
            print(f"  ... 另 {extra} 个")
    return 0


if __name__ == "__main__":
    sys.exit(main())
