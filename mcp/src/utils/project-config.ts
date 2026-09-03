import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ProjectConfig } from "./site-map.js";

/**
 * 读取项目级配置 `.cloudbase/project.json`。
 *
 * 该文件是 site/region/envId 的可选持久化来源，让"打开项目即连对服务"
 * （对齐 Vercel `.vercel/project.json` 的三级回退）。读取失败/文件不存在
 * 返回 undefined，不阻塞调用方。
 */
export function readProjectConfig(cwd?: string): ProjectConfig | undefined {
  try {
    const projectRoot = cwd ?? process.env.WORKSPACE_FOLDER_PATHS ?? process.cwd();
    const configPath = join(projectRoot, ".cloudbase", "project.json");
    if (!existsSync(configPath)) {
      return undefined;
    }
    const raw = readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw) as ProjectConfig;
    if (!parsed || typeof parsed !== "object") {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

/**
 * 读取项目级配置里的默认环境（`.cloudbase/project.json` 的 `envId`）。
 *
 * 该字段让环境绑定跟随仓库工作区，而不是跟随单个 MCP 进程：
 * 新起的 stdio 进程、以及同一仓库的每个 Git worktree（`.cloudbase/project.json`
 * 已提交，各 worktree 都有该文件）都能直接命中同一环境，无需重复 `auth(set_env)`；
 * 不同仓库各读自己的文件，绑定不会互相串。
 */
export function readProjectEnvId(cwd?: string): string | undefined {
  const envId = readProjectConfig(cwd)?.envId;
  if (typeof envId !== "string") {
    return undefined;
  }
  const trimmed = envId.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
