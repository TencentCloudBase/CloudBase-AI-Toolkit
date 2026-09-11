import fs from "node:fs";
import path from "node:path";
import CloudBase from "@cloudbase/manager-node";

/**
 * hosting 声明式构建的 MCP 策略层（deployBuild / deployApply 共用）
 *
 * 背景：deployApply 此前会经 manager-node StaticDeployer.deployHosting →
 * runLocalBuild 在部署链路内隐式本地执行 buildCommand。对齐 CLI
 * （cloudbase-cli `tcb app build`，业界 Vercel vercel build / Azure swa build），
 * 拆分为：
 *   - deployBuild      负责本地构建（不装依赖、不上传）
 *   - deployApply   只上传产物目录（有 buildCommand 的项必须先构建，经
 *                    neutralizeHostingForDeploy 中立化后直传产物）
 *
 * 职责边界（与 CLI hostingBuildUtils.ts 同构）：
 * - 框架推断（buildCommand / outputDir 解析、package.json 探测）与构建执行
 *   在 manager-node（CloudBase.resolveHostingBuildCommand / resolveHostingOutputDir /
 *   buildHosting），本模块不复制 —— 单一真相源在 manager-node。
 * - 本模块只做 MCP 侧策略：产物有效性检查（存在且非空）、node_modules 提示（限定 workspace root）、deploy 中立化改写。
 *
 * 抛错统一用 HostingBuildError（带稳定 code），deploy.ts 的错误信封会透传该 code，
 * 供 agent 程序化分支处理。
 */

/**
 * 单个 hosting 声明式项（与 cloudbaserc.json 中 hosting[] 元素对齐）
 *
 * 显式列出常见字段以提供类型提示；保留 `[key: string]: unknown` 索引签名
 * 兼容未来扩展（ignore / env / 重写规则等）与 manager-node 透传字段。
 */
export interface HostingItem {
  name?: string;
  root?: string;
  framework?: string;
  buildCommand?: string;
  installCommand?: string;
  outputDir?: string;
  deployPath?: string;
  ignore?: string[];
  [key: string]: unknown;
}

/** 声明式部署的 config 根（cloudbaserc.json 的子集），保留索引签名兼容其它资源字段 */
export interface DeployConfig {
  hosting?: HostingItem[];
  [key: string]: unknown;
}

/**
 * hosting 构建/中立化的稳定错误码。与 CLI 同名同义，随 deploy 信封的 errorCode 返回。
 * - BUILD_OUTPUT_NOT_FOUND：deployApply 中立化时产物目录缺失 → 引导先 deployBuild
 * - DEPENDENCY_NOT_INSTALLED：deployBuild 前检测到声明依赖但未安装 node_modules
 * - BUILD_FAILED：deployBuild 构建命令执行失败
 */
export const HOSTING_BUILD_ERROR_CODES = {
  BUILD_OUTPUT_NOT_FOUND: "BUILD_OUTPUT_NOT_FOUND",
  DEPENDENCY_NOT_INSTALLED: "DEPENDENCY_NOT_INSTALLED",
  BUILD_FAILED: "BUILD_FAILED",
} as const;

/** 携带稳定错误码的 hosting 策略错误，由 deploy.ts 错误信封归一为 errorCode */
export class HostingBuildError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "HostingBuildError";
    this.code = code;
  }
}

/** buildHostingItem 的结构化结果，供工具层组装 message（MCP 无 Logger 上下文） */
export interface HostingBuildOutcome {
  name: string;
  root: string;
  action: "built" | "skipped";
  buildCommand?: string;
  outputDir?: string;
}

function defaultItemName(item: HostingItem): string {
  return item.name || "default";
}

/**
 * 构建单个 hosting 项（仅执行 buildCommand，不安装依赖）
 *
 * 委托 manager-node buildHosting；构建前做 node_modules 存在性提示
 * （与 fn deploy Node22+ 拦截同一心智：可证伪的坏状态在用户还能补救时失败）。
 *
 * @returns 结构化结果（skipped = 未检测到构建命令，纯静态无需构建）
 * @throws HostingBuildError 缺 node_modules（DEPENDENCY_NOT_INSTALLED）/ 构建失败（BUILD_FAILED）
 */
export function buildHostingItem(item: HostingItem, cwd: string): HostingBuildOutcome {
  const name = defaultItemName(item);
  const root = path.resolve(cwd, item.root || ".");

  const buildCommand = CloudBase.resolveHostingBuildCommand(item, root);
  if (!buildCommand) {
    return { name, root, action: "skipped" };
  }

  // package.json 声明了依赖（dependencies 或 devDependencies）但本地未安装 → 提示先自行安装。
  // 注：构建工具（vite/webpack/tsc 等）通常位于 devDependencies，纯前端项目 dependencies
  // 可能为空，故两者任一非空即视为需要 node_modules，避免漏判导致构建阶段才崩、报错更晦涩。
  let hasDeps = false;
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(root, "package.json"), "utf8"),
    ) as {
      dependencies?: Record<string, unknown>;
      devDependencies?: Record<string, unknown>;
    };
    hasDeps =
      Object.keys(pkg.dependencies || {}).length > 0 ||
      Object.keys(pkg.devDependencies || {}).length > 0;
  } catch {
    // 无 package.json 或解析失败 → 按无依赖处理，仅尝试构建
  }
  if (hasDeps) {
    // node_modules 沿父链向上查找，但**限定在 workspace root（cwd）以内**：
    // pnpm workspace / monorepo 依赖通常 hoist 到项目根（子包只有 symlink），
    // 只查 item.root 会误报「未安装」；但若不设上界，会一路爬到文件系统根，
    // 项目外无关的 node_modules（如 home 目录的全局依赖）会造成「漏报」——
    // 把未安装误判成已安装，反而拖到构建阶段才崩、报错更晦涩。故以 cwd 为上界。
    const boundary = path.resolve(cwd);
    const withinBoundary = (dir: string): boolean =>
      dir === boundary || dir.startsWith(boundary + path.sep);
    let nodeModulesFound = false;
    let probeDir = root;
    while (true) {
      if (fs.existsSync(path.join(probeDir, "node_modules"))) {
        nodeModulesFound = true;
        break;
      }
      const parent = path.dirname(probeDir);
      // 到达文件系统根，或再上溯就越过 workspace root → 停止
      if (parent === probeDir || !withinBoundary(parent)) break;
      probeDir = parent;
    }
    if (!nodeModulesFound) {
      throw new HostingBuildError(
        HOSTING_BUILD_ERROR_CODES.DEPENDENCY_NOT_INSTALLED,
        `[${name}] 未检测到 node_modules。构建前请先在 ${root} 目录自行安装依赖` +
          "（如 npm install），构建过程不会代为安装依赖。",
      );
    }
  }

  try {
    const outputDir = CloudBase.buildHosting(item, root);
    return {
      name,
      root,
      action: "built",
      buildCommand,
      outputDir: outputDir ?? undefined,
    };
  } catch (e: unknown) {
    const rawMessage = e instanceof Error ? e.message : String(e);
    const detail = rawMessage.trim();
    throw new HostingBuildError(
      HOSTING_BUILD_ERROR_CODES.BUILD_FAILED,
      `[${name}] 构建失败：在 ${root} 执行「${buildCommand}」失败\n${detail.slice(0, 500)}`,
    );
  }
}

/**
 * deployApply 前的 hosting 中立化：
 *
 * 声明式部署不再由 MCP 执行本地构建（拆到 deployBuild）。对每个 hosting 项：
 *   - 无 buildCommand → 纯静态直传，原样放行
 *   - 有 buildCommand → 检查产物目录存在：
 *       · 存在 → 清空 buildCommand/installCommand（manager-node 收到空命令即跳过
 *         runLocalBuild 直接上传），并确保 outputDir 指向产物目录，避免
 *         manager-node resolveHostingOutputDir 在无 outputDir 时回退上传 root
 *       · 缺失 → 报错并引导先执行 deployBuild
 *
 * @returns 处理后的 config（不修改入参，返回新对象）
 * @throws HostingBuildError 产物缺失（BUILD_OUTPUT_NOT_FOUND）
 */
export function neutralizeHostingForDeploy(config: DeployConfig, cwd: string): DeployConfig {
  if (!Array.isArray(config.hosting) || config.hosting.length === 0) {
    return config;
  }

  const hosting = config.hosting.map((item) => {
    if (!item || typeof item !== "object") {
      return item;
    }
    const name = defaultItemName(item);
    const root = path.resolve(cwd, item.root || ".");
    const buildCommand = CloudBase.resolveHostingBuildCommand(item, root);

    // 纯静态：不构建，原样直传
    if (!buildCommand) {
      return item;
    }

    // 原产物目录（与 deployBuild 落盘位置一致）
    const outputDir = CloudBase.resolveHostingOutputDir(item, root);

    // 产物缺失或为空 → 引导先执行 deployBuild
    // 仅 existsSync 不足以判断产物有效：构建被中断、或产物目录被清空后未重新构建，
    // 会留下一个空目录；直传空目录会把线上站点覆盖成空白页。故要求「存在且非空」。
    // 注：这里只做确定性的「空/缺失」拦截，不做源码 vs 产物的 mtime/hash 新鲜度校验
    //     —— 那类校验易误报（改 README、git checkout 触碰源码文件都会误判过期），
    //     且与 CLI（tcb app build）/ Vercel 语义一致：是否重新构建交由用户判断。
    let artifactReady = false;
    try {
      const stat = fs.statSync(outputDir);
      // 目录要求非空；极少数产物为单文件的情况，存在即视为就绪
      artifactReady = stat.isDirectory() ? fs.readdirSync(outputDir).length > 0 : true;
    } catch {
      artifactReady = false; // 不存在 / 无访问权限
    }
    if (!artifactReady) {
      throw new HostingBuildError(
        HOSTING_BUILD_ERROR_CODES.BUILD_OUTPUT_NOT_FOUND,
        `[${name}] 未找到有效构建产物（目录不存在或为空）：${outputDir}\n` +
          "hosting 声明式部署不再自动执行本地构建，请先执行 deployBuild 完成构建后再执行 deployApply。",
      );
    }

    // 中立化：清空 build/install 命令；outputDir 显式写回（相对 root 的产物目录），
    // 确保 manager-node 上传产物而非回退 root
    //
    // 空命令语义依赖 manager-node 的 resolveBuildCommand（lib/deploy/framework.js）：
    //   if (config.buildCommand !== undefined) return config.buildCommand || null;
    // 显式声明的 buildCommand 最先短路（'' → null → 跳过 runLocalBuild），不会进入
    // framework 映射分支，因此保留 framework 字段（如 "vite"）不会被框架映射"复活"构建命令。
    const { buildCommand: _build, installCommand: _install, ...rest } = item;
    return {
      ...rest,
      buildCommand: "",
      installCommand: "",
      outputDir: path.relative(root, outputDir) || ".",
    };
  });

  return { ...config, hosting };
}
