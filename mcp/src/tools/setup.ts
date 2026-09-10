import AdmZip from "adm-zip";
import * as fs from "fs";
import * as fsPromises from "fs/promises";
import * as http from "http";
import * as https from "https";
import * as os from "os";
import * as path from "path";
import { URL } from "url";
import { z } from "zod";
import { t, type MessageKey } from "../i18n/index.js";
import { ExtendedMcpServer } from "../server.js";
import { prepareSafeRemoteRequest } from "../utils/remote-url-safety.js";

// CloudBase 模板配置
const TEMPLATES: Record<string, { description: MessageKey; url: string }> = {
  react: {
    description: "setup.template.react",
    url: "https://static.cloudbase.net/cloudbase-examples/web-cloudbase-react-template.zip",
  },
  vue: {
    description: "setup.template.vue",
    url: "https://static.cloudbase.net/cloudbase-examples/web-cloudbase-vue-template.zip",
  },
  miniprogram: {
    description: "setup.template.miniprogram",
    url: "https://static.cloudbase.net/cloudbase-examples/miniprogram-cloudbase-miniprogram-template.zip",
  },
  uniapp: {
    description: "setup.template.uniapp",
    url: "https://static.cloudbase.net/cloudbase-examples/universal-cloudbase-uniapp-template.zip",
  },
  rules: {
    description: "setup.template.rules",
    url: "https://static.cloudbase.net/cloudbase-examples/web-cloudbase-project.zip",
  },
};

// IDE类型枚举
export const IDE_TYPES = [
  "all", // 下载所有IDE配置（默认）
  "cursor", // Cursor AI编辑器
  "windsurf", // WindSurf AI编辑器
  "codebuddy", // CodeBuddy AI编辑器
  "claude-code", // Claude Code AI编辑器
  "cline", // Cline AI编辑器
  "gemini-cli", // Gemini CLI
  "opencode", // OpenCode AI编辑器
  "qwen-code", // 通义灵码
  "baidu-comate", // 百度Comate
  "openai-codex-cli", // OpenAI Codex CLI
  "augment-code", // Augment Code
  "github-copilot", // GitHub Copilot
  "roocode", // RooCode AI编辑器（已 deprecated 2026-05，可考虑引导转向 Cline/ZooCode）
  "tongyi-lingma", // 通义灵码
  "trae", // Trae AI编辑器
  "qoder", // Qoder AI编辑器
  "antigravity", // Google Antigravity AI编辑器
  "vscode", // Visual Studio Code
  "kiro", // Kiro AI编辑器
  "aider", // Aider AI编辑器
  "iflow-cli", // iFlow CLI
] as const;

// IDE映射关系表
interface IDEMapping {
  ide: string;
  description: string;
  configFiles: string[];
  directories?: string[];
}

// IDE文件描述符
interface IdeFileDescriptor {
  path: string;
  isMcpConfig?: boolean;
}


// IDE到文件的映射关系
// 注意：以 "/" 结尾的路径表示目录，会包含该目录下的所有文件
export const RAW_IDE_FILE_MAPPINGS: Record<string, IdeFileDescriptor[]> = {
  cursor: [
    { path: ".cursor/rules/" },
    { path: ".cursor/mcp.json", isMcpConfig: true },
  ],
  windsurf: [{ path: ".windsurf/rules/" }],
  codebuddy: [
    { path: ".rules/cloudbase-rules.md" },
    { path: ".rules/cloudbase-rules.mdc" },
    { path: ".codebuddy/" },
    { path: "CODEBUDDY.md" },
    { path: ".mcp.json", isMcpConfig: true },
  ],
  "claude-code": [
    { path: "CLAUDE.md" },
    { path: ".mcp.json", isMcpConfig: true },
    { path: ".claude/" },
  ],
  cline: [{ path: ".clinerules/" }],
  "gemini-cli": [
    { path: ".gemini/GEMINI.md" },
    { path: ".gemini/settings.json", isMcpConfig: true },
  ],
  opencode: [{ path: ".opencode.json", isMcpConfig: true }],
  "qwen-code": [
    { path: ".qwen/QWEN.md" },
    { path: ".qwen/settings.json", isMcpConfig: true },
  ],
  "baidu-comate": [
    { path: ".comate/rules/cloudbase-rules.mdr" },
    { path: ".comate/mcp.json", isMcpConfig: true },
  ],
  "openai-codex-cli": [
    { path: ".codex/config.toml", isMcpConfig: true },
    { path: "AGENTS.md" },
  ],
  "augment-code": [{ path: ".augment-guidelines" }],
  "github-copilot": [{ path: ".github/copilot-instructions.md" }],
  roocode: [
    { path: ".roo/rules/cloudbase-rules.md" },
    { path: ".roo/mcp.json", isMcpConfig: true },
  ],
  "tongyi-lingma": [{ path: ".lingma/rules/cloudbase-rules.md" }],
  trae: [{ path: ".trae/rules/" }],
  qoder: [{ path: ".qoder/rules/" }],
  antigravity: [{ path: ".agent/rules/" }],
  vscode: [
    { path: ".vscode/mcp.json", isMcpConfig: true },
    { path: ".vscode/settings.json" },
  ],
  kiro: [
    { path: ".kiro/settings/mcp.json", isMcpConfig: true },
    { path: ".kiro/steering/" },
  ],
  aider: [{ path: "mcp.json", isMcpConfig: true }],
  "iflow-cli": [
    { path: "IFLOW.md" },
    { path: ".iflow/settings.json", isMcpConfig: true },
  ],
};

const IDE_FILE_MAPPINGS = structuredClone(RAW_IDE_FILE_MAPPINGS)


// 所有IDE配置文件的完整列表 - 通过IDE_FILE_MAPPINGS计算得出
const ALL_IDE_FILES = Array.from(
  new Set(
    Object.values(IDE_FILE_MAPPINGS)
      .flat()
      .map((descriptor) => descriptor.path),
  ),
);

// 为"all"选项添加映射
IDE_FILE_MAPPINGS["all"] = ALL_IDE_FILES.map((path) => ({ path }));

// IDE描述映射（值为词典 key，运行时经 t() 解析）
const IDE_DESCRIPTIONS: Record<string, MessageKey> = {
  all: "setup.ide.all",
  cursor: "setup.ide.cursor",
  windsurf: "setup.ide.windsurf",
  codebuddy: "setup.ide.codebuddy",
  "claude-code": "setup.ide.claudeCode",
  cline: "setup.ide.cline",
  "gemini-cli": "setup.ide.geminiCli",
  opencode: "setup.ide.opencode",
  "qwen-code": "setup.ide.qwenCode",
  "baidu-comate": "setup.ide.baiduComate",
  "openai-codex-cli": "setup.ide.openaiCodexCli",
  "augment-code": "setup.ide.augmentCode",
  "github-copilot": "setup.ide.githubCopilot",
  roocode: "setup.ide.roocode",
  "tongyi-lingma": "setup.ide.tongyiLingma",
  trae: "setup.ide.trae",
  qoder: "setup.ide.qoder",
  antigravity: "setup.ide.antigravity",
  vscode: "setup.ide.vscode",
  kiro: "setup.ide.kiro",
  aider: "setup.ide.aider",
  "iflow-cli": "setup.ide.iflowCli",
};

/** 解析 IDE 描述：词典 key 优先，未知 IDE 原样返回 */
function getIdeDescription(ide: string): string {
  const key = IDE_DESCRIPTIONS[ide];
  return key ? t(key) : ide;
}

// INTEGRATION_IDE 环境变量值到 IDE 类型的映射
const INTEGRATION_IDE_MAPPING: Record<string, string> = {
  Cursor: "cursor",
  WindSurf: "windsurf",
  CodeBuddy: "codebuddy",
  CodeBuddyManual: "codebuddy",
  CodeBuddyCode: "codebuddy",
  CodeBuddyPlugin: "codebuddy",
  "Claude Code": "claude-code",
  CLINE: "cline",
  "Gemini CLI": "gemini-cli",
  OpenCode: "opencode",
  "Qwen Code": "qwen-code",
  "Baidu Comate": "baidu-comate",
  "OpenAI Codex CLI": "openai-codex-cli",
  "Augment Code": "augment-code",
  "GitHub Copilot": "github-copilot",
  RooCode: "roocode",
  "Tongyi Lingma": "tongyi-lingma",
  Trae: "trae",
  Qoder: "qoder",
  Antigravity: "antigravity",
  VSCode: "vscode",
  Kiro: "kiro",
  iFlow: "iflow-cli",
};

export type DownloadTemplateIdeResolution =
  | { ok: true; resolvedIDE: string }
  | {
    ok: false;
    reason: "missing_ide" | "unmapped_integration_ide";
    supportedIDEs: string[];
    integrationIDE?: string;
  };

// Resolve IDE for downloadTemplate without side effects (unit-test friendly).
export function resolveDownloadTemplateIDE(
  ide: string | undefined,
  integrationIDE: string | undefined,
): DownloadTemplateIdeResolution {
  if (ide) {
    return { ok: true, resolvedIDE: ide };
  }

  if (integrationIDE) {
    const mappedIDE = INTEGRATION_IDE_MAPPING[integrationIDE];
    if (mappedIDE) {
      return { ok: true, resolvedIDE: mappedIDE };
    }
    return {
      ok: false,
      reason: "unmapped_integration_ide",
      integrationIDE,
      supportedIDEs: IDE_TYPES.filter((t) => t !== "all"),
    };
  }

  return {
    ok: false,
    reason: "missing_ide",
    supportedIDEs: IDE_TYPES.filter((t) => t !== "all"),
  };
}

const MAX_REDIRECT_HOPS = 5;

// 根据 INTEGRATION_IDE 环境变量获取默认 IDE 类型
// 下载文件到临时目录
async function downloadFile(url: string, filePath: string, redirectCount = 0): Promise<void> {
  if (redirectCount > MAX_REDIRECT_HOPS) {
    throw new Error(t("setup.download.redirectLimitExceeded", { max: MAX_REDIRECT_HOPS }));
  }

  const { requestUrl, requestOptions } = await prepareSafeRemoteRequest(url);
  const client = requestUrl.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    client
      .get(requestUrl, requestOptions ?? {}, (res) => {
        if (res.statusCode === 200) {
          const file = fs.createWriteStream(filePath);
          res.pipe(file);
          file.on("finish", () => {
            file.close();
            resolve();
          });
          file.on("error", reject);
        } else if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400) {
          // 处理重定向
          if (res.headers.location) {
            const redirectUrl = new URL(res.headers.location, requestUrl).toString();
            downloadFile(redirectUrl, filePath, redirectCount + 1)
              .then(resolve)
              .catch(reject);
          } else {
            reject(new Error(t("setup.download.redirectNoLocation")));
          }
        } else {
          reject(new Error(t("setup.download.failedWithStatus", { status: res.statusCode ?? 0 })));
        }
      })
      .on("error", reject);
  });
}

// 解压ZIP文件（含 zip slip 防护）
async function extractZip(zipPath: string, extractPath: string): Promise<void> {
  try {
    // 创建解压目录
    await fsPromises.mkdir(extractPath, { recursive: true });

    // 使用 adm-zip 库逐条目解压，防止 zip slip 路径穿越
    const zip = new AdmZip(zipPath);
    const entries = zip.getEntries();
    const resolvedExtractPath = path.resolve(extractPath);

    for (const entry of entries) {
      // 跳过目录条目，后面由 mkdir 自动创建
      if (entry.isDirectory) continue;

      const entryPath = path.resolve(resolvedExtractPath, entry.entryName);
      if (!entryPath.startsWith(resolvedExtractPath + path.sep)) {
        throw new Error(
          t("setup.extract.invalidPath", { path: entry.entryName }),
        );
      }

      // 确保目标目录存在
      await fsPromises.mkdir(path.dirname(entryPath), { recursive: true });

      // 写入文件
      await fsPromises.writeFile(entryPath, entry.getData());
    }
  } catch (error) {
    throw new Error(
      t("setup.extract.failed", {
        reason: error instanceof Error ? error.message : t("setup.unknownError"),
      }),
    );
  }
}

// 获取目录下所有文件的相对路径列表
async function getAllFiles(
  dir: string,
  baseDir: string = dir,
): Promise<string[]> {
  const files: string[] = [];
  const entries = await fsPromises.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const subFiles = await getAllFiles(fullPath, baseDir);
      files.push(...subFiles);
    } else {
      files.push(path.relative(baseDir, fullPath));
    }
  }

  return files;
}

// 复制文件，不覆盖已存在的文件
async function copyFileIfNotExists(
  src: string,
  dest: string,
): Promise<{ copied: boolean; reason?: string }> {
  try {
    // 检查目标文件是否存在
    if (fs.existsSync(dest)) {
      return { copied: false, reason: t("setup.file.alreadyExists") };
    }

    // 创建目标目录
    await fsPromises.mkdir(path.dirname(dest), { recursive: true });

    // 复制文件
    await fsPromises.copyFile(src, dest);
    return { copied: true };
  } catch (error) {
    return {
      copied: false,
      reason: t("setup.file.copyFailed", {
        reason: error instanceof Error ? error.message : t("setup.unknownError"),
      }),
    };
  }
}

// 复制文件，支持覆盖模式
// 判断是否应该跳过 README.md 文件
function shouldSkipReadme(
  template: string,
  destPath: string,
  overwrite: boolean,
): boolean {
  const isReadme = path.basename(destPath).toLowerCase() === "readme.md";
  const isRulesTemplate = template === "rules";
  const exists = fs.existsSync(destPath);

  return isReadme && isRulesTemplate && exists && !overwrite;
}

async function copyFile(
  src: string,
  dest: string,
  overwrite: boolean = false,
  template?: string,
): Promise<{ copied: boolean; reason?: string; action?: string }> {
  try {
    const destExists = fs.existsSync(dest);

    // 检查是否需要跳过 README.md 文件（仅对 rules 模板）
    if (template && shouldSkipReadme(template, dest, overwrite)) {
      return {
        copied: false,
        reason: t("setup.file.readmeProtected"),
        action: "protected",
      };
    }

    // 如果目标文件存在且不允许覆盖
    if (destExists && !overwrite) {
      return { copied: false, reason: t("setup.file.alreadyExists"), action: "skipped" };
    }

    // 创建目标目录
    await fsPromises.mkdir(path.dirname(dest), { recursive: true });

    // 复制文件
    await fsPromises.copyFile(src, dest);
    return {
      copied: true,
      action: destExists ? "overwritten" : "created",
    };
  } catch (error) {
    return {
      copied: false,
      reason: t("setup.file.copyFailed", {
        reason: error instanceof Error ? error.message : t("setup.unknownError"),
      }),
    };
  }
}

// IDE验证函数
export function validateIDE(ide: string): {
  valid: boolean;
  error?: string;
  supportedIDEs?: string[];
} {
  if (ide === "all") {
    return { valid: true };
  }

  const supportedIDEs = IDE_TYPES.filter((type) => type !== "all");
  const isValid = supportedIDEs.includes(ide as any);

  if (!isValid) {
    return {
      valid: false,
      error: t("setup.invalidIdeType", { ide }),
      supportedIDEs: supportedIDEs as string[],
    };
  }

  return { valid: true };
}

// 检查文件是否匹配给定的路径（支持文件和目录）
function matchesPath(file: string, pathPattern: string): boolean {
  if (pathPattern.endsWith("/")) {
    // 目录路径：检查文件是否在该目录下
    return file.startsWith(pathPattern);
  } else {
    // 文件路径：精确匹配
    return file === pathPattern;
  }
}

// 构建 IDE 配置文件检查清单
// 返回所有需要检查的路径模式列表
function buildIDEChecklist(): string[] {
  return ALL_IDE_FILES;
}

// 检查文件是否在检查清单范围内
function isInChecklist(file: string, checklist: string[]): boolean {
  for (const pattern of checklist) {
    if (matchesPath(file, pattern)) {
      return true;
    }
  }
  return false;
}

// 文件过滤函数
export function filterFilesByIDE(files: string[], ide: string): string[] {
  if (ide === "all") {
    return files; // 返回所有文件
  }

  const ideFiles = IDE_FILE_MAPPINGS[ide];
  if (!ideFiles) {
    return files; // 如果找不到映射，返回所有文件
  }

  // 构建检查清单
  const checklist = buildIDEChecklist();

  // 两阶段过滤
  return files.filter((file) => {
    // 阶段1: 检查文件是否在检查清单范围内
    if (!isInChecklist(file, checklist)) {
      // 不在检查清单范围内，直接保留
      return true;
    }

    // 阶段2: 在检查清单范围内，检查是否属于当前 IDE
    for (const ideFile of ideFiles) {
      if (matchesPath(file, ideFile.path)) {
        // 属于当前 IDE，保留
        return true;
      }
    }

    // 在检查清单范围内但不属于当前 IDE，排除
    return false;
  });
}

// 创建过滤后的目录结构
async function createFilteredDirectory(
  extractDir: string,
  filteredFiles: string[],
  ide: string,
): Promise<string> {
  if (ide === "all") {
    return extractDir; // 如果选择所有IDE，直接返回原目录
  }

  // 创建新的过滤后目录
  const filteredDir = path.join(path.dirname(extractDir), "filtered");
  await fsPromises.mkdir(filteredDir, { recursive: true });

  // 只复制过滤后的文件到新目录
  for (const relativePath of filteredFiles) {
    const srcPath = path.join(extractDir, relativePath);
    const destPath = path.join(filteredDir, relativePath);

    // 创建目标目录
    await fsPromises.mkdir(path.dirname(destPath), { recursive: true });

    // 复制文件
    await fsPromises.copyFile(srcPath, destPath);
  }

  return filteredDir;
}

export function registerSetupTools(server: ExtendedMcpServer) {
  // downloadTemplate - 下载项目模板 (cloud-incompatible)
  server.registerTool(
    "downloadTemplate",
    {
      title: "setup.downloadTemplate.title",
      description: "setup.downloadTemplate.description",
      inputSchema: {
        template: z
          .enum(["react", "vue", "miniprogram", "uniapp", "rules"])
          .describe("要下载的模板类型"),
        ide: z
          .enum(IDE_TYPES)
          .describe(
            "指定要下载的IDE类型。",
          ),
        overwrite: z
          .boolean()
          .optional()
          .describe("是否覆盖已存在的文件，默认为false（不覆盖）"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
        category: "setup",
      },
    },
    async ({
      template,
      ide,
      overwrite = false,
    }: {
      template: "react" | "vue" | "miniprogram" | "uniapp" | "rules";
      ide?: string;
      overwrite?: boolean;
    }) => {
      try {
        const ideResolution = resolveDownloadTemplateIDE(
          ide,
          undefined,
        );

        if (!ideResolution.ok) {
          const supportedIDEs = ideResolution.supportedIDEs.join(", ");
          if (ideResolution.reason === "unmapped_integration_ide") {
            return {
              content: [
                {
                  type: "text",
                  text: t("setup.unmappedIde", {
                    ide: ideResolution.integrationIDE ?? "-",
                    ides: supportedIDEs,
                  }),
                },
              ],
            };
          }

          return {
            content: [
              {
                type: "text",
                text: t("setup.missingIde", { ides: supportedIDEs }),
              },
            ],
          };
        }

        const resolvedIDE = ideResolution.resolvedIDE;

        // 验证IDE类型
        const ideValidation = validateIDE(resolvedIDE);
        if (!ideValidation.valid) {
          const supportedIDEs = ideValidation.supportedIDEs?.join(", ") || "";
          return {
            content: [
              {
                type: "text",
                text: `❌ ${ideValidation.error}\n\n${t("setup.supportedIdeTypes", { ides: supportedIDEs })}`,
              },
            ],
          };
        }

        const templateConfig = TEMPLATES[template];
        if (!templateConfig) {
          return {
            content: [
              {
                type: "text",
                text: t("setup.unsupportedTemplate", { template }),
              },
            ],
          };
        }

        // 创建临时目录
        const tempDir = fs.mkdtempSync(
          path.join(os.tmpdir(), "cloudbase-template-"),
        );
        const zipPath = path.join(tempDir, "template.zip");
        const extractDir = path.join(tempDir, "extracted");

        // 下载和解压
        await downloadFile(templateConfig.url, zipPath);
        await extractZip(zipPath, extractDir);
        const extractedFiles = await getAllFiles(extractDir);

        // 根据IDE类型过滤文件
        const filteredFiles = filterFilesByIDE(extractedFiles, resolvedIDE);

        // 创建过滤后的目录结构（当选择特定IDE时）
        const workingDir = await createFilteredDirectory(
          extractDir,
          filteredFiles,
          resolvedIDE,
        );

        // 检查是否需要复制到项目目录
        const workspaceFolder =
          process.env.WORKSPACE_FOLDER_PATHS || process.cwd();
        let finalFiles: string[] = [];
        let createdCount = 0;
        let overwrittenCount = 0;
        let skippedCount = 0;
        const results: string[] = [];

        if (workspaceFolder) {
          let protectedCount = 0;
          for (const relativePath of filteredFiles) {
            const srcPath = path.join(workingDir, relativePath);
            const destPath = path.join(workspaceFolder, relativePath);

            const copyResult = await copyFile(
              srcPath,
              destPath,
              overwrite,
              template,
            );

            if (copyResult.copied) {
              if (copyResult.action === "overwritten") {
                overwrittenCount++;
              } else {
                createdCount++;
              }
              finalFiles.push(destPath);
            } else {
              if (copyResult.action === "protected") {
                protectedCount++;
              } else {
                skippedCount++;
              }
              finalFiles.push(srcPath);
            }
          }

          // 添加IDE过滤信息
          const ideInfo = getIdeDescription(resolvedIDE);
          results.push(
            t("setup.syncCompleted", {
              template: t(templateConfig.description),
              ide: ideInfo,
            }),
          );
          results.push(t("setup.tempDir", { dir: workingDir }));
          results.push(
            t("setup.fileFilter", {
              from: extractedFiles.length,
              to: filteredFiles.length,
            }),
          );
          if (resolvedIDE !== "all") {
            results.push(t("setup.ideFiltered", { ide: ideInfo }));
          }

          const stats: string[] = [];
          if (createdCount > 0) stats.push(t("setup.stats.created", { count: createdCount }));
          if (overwrittenCount > 0)
            stats.push(t("setup.stats.overwritten", { count: overwrittenCount }));
          if (protectedCount > 0)
            stats.push(t("setup.stats.protected", { count: protectedCount }));
          if (skippedCount > 0) stats.push(t("setup.stats.skipped", { count: skippedCount }));

          if (stats.length > 0) {
            results.push(`📊 ${stats.join(t("setup.stats.separator"))}`);
          }

          if (overwrite || overwrittenCount > 0 || skippedCount > 0) {
            results.push(
              t("setup.overwriteMode", {
                mode: overwrite ? t("setup.overwriteOn") : t("setup.overwriteOff"),
              }),
            );
          }
        } else {
          finalFiles = filteredFiles.map((relativePath) =>
            path.join(workingDir, relativePath),
          );
          const ideInfo = getIdeDescription(resolvedIDE);
          results.push(
            t("setup.downloadCompleted", {
              template: t(templateConfig.description),
              ide: ideInfo,
            }),
          );
          results.push(t("setup.savedToTempDir", { dir: workingDir }));
          results.push(
            t("setup.fileFilter", {
              from: extractedFiles.length,
              to: filteredFiles.length,
            }),
          );
          if (resolvedIDE !== "all") {
            results.push(t("setup.ideFiltered", { ide: ideInfo }));
          }
          results.push(t("setup.copyHiddenFilesHint"));
        }

        // 文件路径列表
        results.push("");
        results.push(t("setup.fileListHeader"));
        finalFiles.forEach((filePath) => {
          results.push(`${filePath}`);
        });

        return {
          content: [
            {
              type: "text",
              text: results.join("\n"),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: t("setup.download.failed", {
                reason: error instanceof Error ? error.message : t("setup.unknownError"),
              }),
            },
          ],
        };
      }
    },
  );
}
