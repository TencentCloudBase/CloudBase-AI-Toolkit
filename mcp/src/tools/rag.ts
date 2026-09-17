import AdmZip from "adm-zip";
import * as fs from "fs/promises";
import lockfile, { Options as LockfileOptions } from "lockfile";
import * as os from "os";
import * as path from "path";
import { z } from "zod";
import { createCloudBaseManagerWithOptions } from "../cloudbase-manager.js";
import { ExtendedMcpServer } from "../server.js";
import { isCloudMode } from "../utils/cloud-mode.js";
import { jsonContent } from "../utils/json-content.js";
import { debug, warn } from "../utils/logger.js";
import { t, type Lang, type MessageKey } from "../i18n/index.js";

// 1. 枚举定义
const SearchKnowledgeModeEnum = z.enum(["skill", "openapi", "docs"]);
const CloudBaseDocsActionEnum = z.enum([
  "listModules",
  "listModuleDocs",
  "findByName",
  "readDoc",
  "searchDocs",
]);

// ============ 缓存配置 ============
const CACHE_BASE_DIR = path.join(os.homedir(), ".cloudbase-mcp");
const CACHE_META_FILE = path.join(CACHE_BASE_DIR, "cache-meta.json");
const LOCK_FILE = path.join(CACHE_BASE_DIR, ".download.lock");
const DEFAULT_CACHE_TTL_MS = 60 * 60 * 1000; // default 1 hour (was 24h; templates/docs refresh more often)

// Promise wrapper for lockfile methods
function acquireLock(
  lockPath: string,
  options?: LockfileOptions,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (options) {
      lockfile.lock(lockPath, options, (err) => {
        if (err) reject(err);
        else resolve();
      });
    } else {
      lockfile.lock(lockPath, (err) => {
        if (err) reject(err);
        else resolve();
      });
    }
  });
}

function releaseLock(lockPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    lockfile.unlock(lockPath, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}
// 支持环境变量 CLOUDBASE_MCP_CACHE_TTL_MS 控制缓存过期时间（毫秒）
const parsedCacheTTL = process.env.CLOUDBASE_MCP_CACHE_TTL_MS
  ? parseInt(process.env.CLOUDBASE_MCP_CACHE_TTL_MS, 10)
  : NaN;
const CACHE_TTL_MS =
  Number.isNaN(parsedCacheTTL) || parsedCacheTTL < 0
    ? DEFAULT_CACHE_TTL_MS
    : parsedCacheTTL;

if (!Number.isNaN(parsedCacheTTL) && parsedCacheTTL >= 0) {
  debug("[cache] Using TTL from CLOUDBASE_MCP_CACHE_TTL_MS", {
    ttlMs: CACHE_TTL_MS,
  });
} else {
  debug("[cache] Using default TTL", { ttlMs: CACHE_TTL_MS });
}

// 缓存元数据类型
interface CacheMeta {
  timestamp?: number;
}

// OpenAPI 文档信息类型
type OpenAPIInfo = {
  name: string;
  description: string;
  absolutePath?: string;
  url?: string;
};

// 云端（hosted）模式下 skill 文档的远程基址：返回远程 URL 而不是服务端本地路径。
//
// 该地址指向官方 `npx skills add TencentCloudBase/cloudbase-skills` 分发的聚合 skill 仓
// （all-in-one）。它在 CNB 与 GitHub TencentCloudBase/cloudbase-skills 之间同步，是当前
// 唯一有 references/ 的活仓；旧的 `.../cloudbase/skills` 仓已停止更新（新 skill 与 references 均 404）。
//
// 聚合仓目录结构为：
//   <base>/<skillName>/SKILL.md
//   <base>/<skillName>/references/<file>.md
// 注意 base 里已含聚合前缀 `.../skills/cloudbase/references`，因此再拼 `<skillName>` 才是单个
// skill 的根目录（`<base>/<skillName>/SKILL.md` 已验证返回 200）。
export const SKILL_REMOTE_BASE_URL =
  "https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references";

// 资源下载结果类型
interface DownloadResult {
  webTemplateDir: string;
  openAPIDocs: OpenAPIInfo[];
}

interface ResolveSkillSearchRootsOptions {
  cliEntryPath?: string;
  homeDir?: string;
  fallbackSkillsRoot?: string;
}

// 共享的下载 Promise，防止并发重复下载
let resourceDownloadPromise: Promise<DownloadResult> | null = null;

async function filterExistingDirs(pathsToCheck: Array<string | undefined>): Promise<string[]> {
  const resolved: string[] = [];
  for (const candidate of pathsToCheck) {
    if (!candidate || resolved.includes(candidate)) {
      continue;
    }
    try {
      const stat = await fs.stat(candidate);
      if (stat.isDirectory()) {
        resolved.push(candidate);
      }
    } catch {
      // Ignore missing candidates and keep checking fallbacks.
    }
  }
  return resolved;
}

export async function resolveSkillSearchRoots(
  options: ResolveSkillSearchRootsOptions = {},
): Promise<string[]> {
  const cliEntryPath = options.cliEntryPath ?? process.argv[1];
  const homeDir = options.homeDir ?? os.homedir();
  const repoRoot = cliEntryPath
    ? path.resolve(path.dirname(cliEntryPath), "..", "..")
    : undefined;

  return filterExistingDirs([
    repoRoot
      ? path.join(repoRoot, ".generated", "compat-config", ".agents", "skills")
      : undefined,
    repoRoot
      ? path.join(repoRoot, ".generated", "compat-config", ".claude", "skills")
      : undefined,
    repoRoot
      ? path.join(repoRoot, ".generated", "compat-config", ".codebuddy", "skills")
      : undefined,
    repoRoot ? path.join(repoRoot, "config", "source", "skills") : undefined,
    options.fallbackSkillsRoot,
    path.join(homeDir, ".cloudbase-mcp", "web-template", ".claude", "skills"),
  ]);
}

// 检查缓存是否可用（未过期）
async function canUseCache(): Promise<boolean> {
  try {
    const content = await fs.readFile(CACHE_META_FILE, "utf8");
    const meta: CacheMeta = JSON.parse(content);
    if (!meta.timestamp) {
      debug("[cache] cache-meta missing timestamp, treating as invalid", {
        ttlMs: CACHE_TTL_MS,
      });
      return false;
    }

    const ageMs = Date.now() - meta.timestamp;
    const isValid = ageMs <= CACHE_TTL_MS;

    debug("[cache] evaluated cache meta", {
      timestamp: meta.timestamp,
      ageMs,
      ttlMs: CACHE_TTL_MS,
      valid: isValid,
    });

    return isValid;
  } catch (error) {
    debug("[cache] failed to read cache meta, treating as miss", { error });
    return false;
  }
}

// 更新缓存时间戳
async function updateCache(): Promise<void> {
  await fs.mkdir(CACHE_BASE_DIR, { recursive: true });
  await fs.writeFile(
    CACHE_META_FILE,
    JSON.stringify({ timestamp: Date.now() }, null, 2),
    "utf8",
  );
}

type CloudBaseDocsAction = z.infer<typeof CloudBaseDocsActionEnum>;

function buildDocsEnvelope(
  action: CloudBaseDocsAction,
  data: Record<string, unknown>,
  message: string,
) {
  return {
    success: true,
    data: {
      action,
      ...data,
    },
    message,
  };
}

function buildDocsErrorEnvelope(error: unknown) {
  return {
    success: false,
    data: {},
    message: error instanceof Error ? error.message : String(error),
  };
}

function requireStringParam(
  value: string | undefined,
  fieldName: string,
  action: CloudBaseDocsAction,
) {
  if (!value?.trim()) {
    throw new Error(t("rag.paramRequired", { action, param: fieldName }));
  }
  return value.trim();
}

function buildOptionalStringEnum(
  values: string[],
  descriptionKey: MessageKey,
  lang?: Lang,
) {
  const uniqueValues = [...new Set(values.filter((value) => value.trim()))];

  if (uniqueValues.length > 0) {
    return z
      .enum(uniqueValues as [string, ...string[]])
      .optional()
      .describe(descriptionKey);
  }

  return z
    .string()
    .optional()
    .describe(
      t(
        "rag.schema.enumUnavailable",
        { description: t(descriptionKey, undefined, lang) },
        lang,
      ),
    );
}

// OpenAPI 文档 URL 列表
const OPENAPI_SOURCES: Array<{
  name: string;
  description: string;
  url: string;
}> = [
    {
      name: "mysqldb",
      description: "MySQL RESTful API - 云开发 MySQL 数据库 HTTP API",
      url: "https://docs.cloudbase.net/openapi/mysqldb.v1.openapi.yaml",
    },
    {
      name: "pgdb",
      description:
        "PostgreSQL RESTful API (PostgREST) - 云开发 PostgreSQL 数据库 HTTP API，含 exec-pgsql 直连 SQL",
      url: "https://docs.cloudbase.net/openapi/pgdb.v1.openapi.yaml",
    },
    {
      name: "functions",
      description: "Cloud Functions API - 云函数 HTTP API",
      url: "https://docs.cloudbase.net/openapi/functions.v1.openapi.yaml",
    },
    {
      name: "auth",
      description: "Authentication API - 身份认证 HTTP API",
      url: "https://docs.cloudbase.net/openapi/auth.v1.openapi.yaml",
    },
    {
      name: "cloudrun",
      description: "CloudRun API - 云托管服务 HTTP API",
      url: "https://docs.cloudbase.net/openapi/cloudrun.v1.openapi.yaml",
    },
    {
      name: "storage",
      description: "Storage API - 云存储 HTTP API",
      url: "https://docs.cloudbase.net/openapi/storage.v1.openapi.yaml",
    },
    {
      name: "nosql",
      description: "NoSQL RESTful API - 文档型数据库 HTTP API",
      url: "https://docs.cloudbase.net/openapi/nosql.v1.openapi.yaml",
    },
    {
      name: "ai_model",
      description: "AI 大模型接入 API - 统一 AI 模型 HTTP API",
      url: "https://docs.cloudbase.net/openapi/ai_model.v1.openapi.yaml",
    },
  ];

async function downloadWebTemplate() {
  const zipPath = path.join(CACHE_BASE_DIR, "web-cloudbase-project.zip");
  const extractDir = path.join(CACHE_BASE_DIR, "web-template");
  const url =
    "https://static.cloudbase.net/cloudbase-examples/web-cloudbase-project.zip";

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(t("rag.downloadTemplateFailed", { status: response.status }));
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(zipPath, buffer);

  await fs.rm(extractDir, { recursive: true, force: true });
  await fs.mkdir(extractDir, { recursive: true });

  const zip = new AdmZip(zipPath);
  zip.extractAllTo(extractDir, true);

  debug("[downloadResources] webTemplate 下载完成");
  return extractDir;
}

async function downloadOpenAPI() {
  const baseDir = path.join(CACHE_BASE_DIR, "openapi");
  await fs.mkdir(baseDir, { recursive: true });

  const downloaded = await Promise.all(
    OPENAPI_SOURCES.map(async (source): Promise<OpenAPIInfo | undefined> => {
      try {
        const response = await fetch(source.url);
        if (!response.ok) {
          warn(`[downloadOpenAPI] Failed to download ${source.name}`, {
            status: response.status,
          });
          return undefined;
        }
        const content = await response.text();
        const filePath = path.join(baseDir, `${source.name}.openapi.yaml`);
        await fs.writeFile(filePath, content, "utf8");
        return {
          name: source.name,
          description: source.description,
          absolutePath: filePath,
          url: source.url,
        };
      } catch (error) {
        warn(`[downloadOpenAPI] Failed to download ${source.name}`, {
          error,
        });
        return undefined;
      }
    }),
  );

  // 顺序必须跟随 OPENAPI_SOURCES 声明顺序。`Promise.all` 只保证按输入顺序
  // 返回结果，所以这里先收集再过滤；若改成在各并发任务内部 `results.push()`，
  // 数组顺序会变成网络完成顺序，导致 tools.json / mcp-tools.md 里内联的
  // OpenAPI 清单在每次构建之间无意义漂移。
  const results = downloaded.filter(
    (item): item is OpenAPIInfo => item !== undefined,
  );

  debug("[downloadOpenAPI] openAPIDocs 下载完成", {
    successCount: results.length,
    total: OPENAPI_SOURCES.length,
  });
  return results;
}

// 实际执行下载所有资源的函数（webTemplate 和 openAPI 并发下载）
async function _doDownloadResources(skipOpenAPI: boolean): Promise<DownloadResult> {
  // 并发下载 webTemplate 和 openAPIDocs
  const [webTemplateDir, openAPIDocs] = await Promise.all([
    // 下载 web 模板
    downloadWebTemplate(),

    // 并发下载所有 OpenAPI 文档（云端模式跳过：openapi 直接返回远程 URL）
    skipOpenAPI ? Promise.resolve([] as OpenAPIInfo[]) : downloadOpenAPI(),
  ]);

  debug("[downloadResources] 所有资源下载完成");
  return { webTemplateDir, openAPIDocs };
}

// 下载所有资源（带缓存和共享 Promise 机制）
async function downloadResources(
  options: { skipOpenAPI?: boolean } = {},
): Promise<DownloadResult> {
  const skipOpenAPI = options.skipOpenAPI === true;
  const webTemplateDir = path.join(CACHE_BASE_DIR, "web-template");
  const openAPIDir = path.join(CACHE_BASE_DIR, "openapi");

  // 如果已有下载任务在进行中，共享该 Promise
  if (resourceDownloadPromise) {
    debug("[downloadResources] 共享已有下载任务");
    return resourceDownloadPromise;
  }

  // 先快速检查缓存（不需要锁，因为只是读取）
  if (await canUseCache()) {
    try {
      // 检查 webTemplate 目录存在（云端模式不需要 openapi 本地文件）
      await fs.access(webTemplateDir);
      if (skipOpenAPI) {
        debug("[downloadResources] 使用 webTemplate 缓存（快速路径，跳过 openapi）");
        return { webTemplateDir, openAPIDocs: [] };
      }
      // 检查两个目录都存在
      await fs.access(openAPIDir);
      const files = await fs.readdir(openAPIDir);
      if (files.length > 0) {
        debug("[downloadResources] 使用缓存（快速路径）");
        return {
          webTemplateDir,
          openAPIDocs: OPENAPI_SOURCES.map((source) => ({
            name: source.name,
            description: source.description,
            absolutePath: path.join(
              openAPIDir,
              `${source.name}.openapi.yaml`,
            ),
          })).filter((item) =>
            files.includes(`${item.name}.openapi.yaml`),
          ),
        };
      }
    } catch {
      // 缓存无效，需要重新下载
    }
  }

  // 创建新的下载任务，使用文件锁保护
  debug("[downloadResources] 开始新下载任务");
  await fs.mkdir(CACHE_BASE_DIR, { recursive: true });

  resourceDownloadPromise = (async () => {
    // 尝试获取文件锁，最多等待 6 秒（30 次 × 200ms），每 200ms 轮询一次
    let lockAcquired = false;
    try {
      await acquireLock(LOCK_FILE, {
        wait: 30 * 200, // 总等待时间：6000ms (6 秒)
        pollPeriod: 200, // 轮询间隔：200ms
        stale: 5 * 60 * 1000, // 5 分钟，如果锁文件超过这个时间认为是过期的
      });
      lockAcquired = true;
      debug("[downloadResources] 文件锁已获取");

      // 在持有锁的情况下再次检查缓存（可能其他进程已经下载完成）
      if (await canUseCache()) {
        try {
          // 检查两个目录都存在
          await Promise.all([fs.access(webTemplateDir), fs.access(openAPIDir)]);
          const files = await fs.readdir(openAPIDir);
          if (files.length > 0) {
            debug("[downloadResources] 使用缓存（在锁保护下检查）");
            return {
              webTemplateDir,
              openAPIDocs: OPENAPI_SOURCES.map((source) => ({
                name: source.name,
                description: source.description,
                absolutePath: path.join(
                  openAPIDir,
                  `${source.name}.openapi.yaml`,
                ),
              })).filter((item) =>
                files.includes(`${item.name}.openapi.yaml`),
              ),
            };
          }
        } catch {
          // 缓存无效，需要重新下载
        }
      }

      // 执行下载
      const result = await _doDownloadResources(skipOpenAPI);
      await updateCache();
      debug("[downloadResources] 缓存已更新");
      return result;
    } finally {
      // 释放文件锁
      if (lockAcquired) {
        try {
          await releaseLock(LOCK_FILE);
          debug("[downloadResources] 文件锁已释放");
        } catch (error) {
          warn("[downloadResources] 释放文件锁失败", { error });
        }
      }
    }
  })().finally(() => {
    resourceDownloadPromise = null;
  });

  return resourceDownloadPromise;
}

/**
 * docs.cloudbase.net 的 markdown 地址规则。
 *
 * 站点改为「页面路径 + `.md`」直接给出 Markdown 源文件；而 `@cloudbase/manager-node`
 * 的 `DocsService.readDoc()` 仍按旧规则拼接 `<path>/index.md`。旧地址不会 404 ——
 * 站点对未知路径返回 200 + HTML（SPA 兜底页），因此 SDK 会静默把整页 HTML 当成
 * 文档正文返回，既不报错也无法从状态码察觉。
 *
 * SDK 对已以 `.md` 结尾的路径原样透传，所以在这里先把路径归一化成正确形态即可
 * 绕开拼接逻辑；SDK 日后修好也不会重复加后缀。
 */
export function resolveDocsMarkdownPath(docPath: string): string {
  const raw = docPath.trim();
  const hashAt = raw.indexOf("#");
  const withoutHash = (hashAt >= 0 ? raw.slice(0, hashAt) : raw).replace(/\/+$/, "");
  const hash = hashAt >= 0 ? raw.slice(hashAt) : "";

  // 旧文档里常见的 `<path>/index.md` 写法先还原成页面路径，再按新规则加后缀。
  const base = withoutHash.replace(/\/index\.md$/i, "");
  const normalized = /\.md$/i.test(base)
    ? base
    : `${base.replace(/\/index$/i, "")}.md`;

  return `${normalized}${hash}`;
}

/**
 * 识别 SPA 兜底页：站点对不存在的 markdown 路径同样返回 200，正文是站点 HTML 外壳。
 * 用于把「静默返回一坨 HTML」换成明确的失败信息。
 */
export function isDocsHtmlFallback(content: string): boolean {
  return /^<!doctype html|^<html[\s>]/i.test(content.replace(/^\uFEFF/, "").trimStart());
}

export async function registerRagTools(server: ExtendedMcpServer) {
  let openapis: OpenAPIInfo[] = [];
  let skills: SkillInfo[] = [];
  let fallbackSkillsRoot: string | undefined;

  // 云端（hosted）模式：openapi 不下载 yaml 文件，直接返回远程 URL
  const cloudMode = isCloudMode();

  try {
    const { webTemplateDir, openAPIDocs } = await downloadResources({
      skipOpenAPI: cloudMode,
    });
    if (cloudMode) {
      openapis = OPENAPI_SOURCES.map((source) => ({
        name: source.name,
        description: source.description,
        url: source.url,
      }));
    } else {
      openapis = openAPIDocs;
    }
    fallbackSkillsRoot = path.join(webTemplateDir, ".claude", "skills");
  } catch (error) {
    warn("[downloadResources] Failed to download resources", {
      error,
    });
    if (cloudMode) {
      openapis = OPENAPI_SOURCES.map((source) => ({
        name: source.name,
        description: source.description,
        url: source.url,
      }));
    }
  }

  try {
    const skillRoots = await resolveSkillSearchRoots({
      fallbackSkillsRoot,
    });
    const preferredSkillRoot = skillRoots[0];
    if (preferredSkillRoot) {
      skills = await collectSkillDescriptions(preferredSkillRoot);
    }
  } catch (error) {
    warn("[registerRagTools] Failed to resolve local skill roots", {
      error,
    });
  }

  const skillNames = skills.map((skill) =>
    path.basename(path.dirname(skill.absolutePath)),
  );
  const openapiNames = openapis.map((api) => api.name);

  const getDocsManager = () =>
    (createCloudBaseManagerWithOptions(server.cloudBaseOptions ?? {}) as any)
      ?.docs;

  server.registerTool?.(
    "searchKnowledgeBase",
    {
      title: "rag.title",
      description: t("rag.description", {
        skillCount: skills.length,
        openapiCount: openapis.length,
      }),
      inputSchema: {
        mode: SearchKnowledgeModeEnum,
        skillName: buildOptionalStringEnum(
          skillNames,
          "rag.schema.skillName",
          server.lang,
        ),
        apiName: buildOptionalStringEnum(
          openapiNames,
          "rag.schema.apiName",
          server.lang,
        ),
        action: CloudBaseDocsActionEnum.optional().describe(
          "rag.schema.action",
        ),
        moduleName: z
          .string()
          .optional()
          .describe("rag.schema.moduleName"),
        input: z
          .string()
          .optional()
          .describe("rag.schema.input"),
        docPath: z
          .string()
          .optional()
          .describe("rag.schema.docPath"),
        query: z
          .string()
          .optional()
          .describe("rag.schema.query"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
        category: "rag",
      },
    },
    async ({
      mode,
      skillName,
      apiName,
      action,
      moduleName,
      input,
      docPath,
      query,
    }) => {
      if (mode === "docs") {
        try {
          const resolvedAction = action;
          if (!resolvedAction) {
            throw new Error(t("rag.actionRequired"));
          }

          const docsManager = getDocsManager();

          if (!docsManager) {
            throw new Error(t("rag.docsUnsupported"));
          }

          if (resolvedAction === "listModules") {
            const modules = await docsManager.listModules();
            return jsonContent(
              buildDocsEnvelope(
                resolvedAction,
                { modules },
                t("rag.listModulesSuccess"),
              ),
            );
          }

          if (resolvedAction === "listModuleDocs") {
            const resolvedModuleName = requireStringParam(
              moduleName,
              "moduleName",
              resolvedAction,
            );
            const docs = await docsManager.listModuleDocs(resolvedModuleName);
            return jsonContent(
              buildDocsEnvelope(
                resolvedAction,
                { moduleName: resolvedModuleName, docs },
                t("rag.listModuleDocsSuccess"),
              ),
            );
          }

          if (resolvedAction === "findByName") {
            const resolvedInput = requireStringParam(
              input,
              "input",
              resolvedAction,
            );
            const result = await docsManager.findByName(resolvedInput);
            return jsonContent(
              buildDocsEnvelope(
                resolvedAction,
                { input: resolvedInput, result },
                t("rag.findByNameSuccess"),
              ),
            );
          }

          if (resolvedAction === "readDoc") {
            const resolvedDocPath = requireStringParam(
              docPath,
              "docPath",
              resolvedAction,
            );
            const markdownPath = resolveDocsMarkdownPath(resolvedDocPath);
            const markdown = await docsManager.readDoc(markdownPath);
            // 站点对没有 markdown 的路径也返回 200 + HTML 外壳，必须显式判失败，
            // 否则会把整页 HTML 当成文档正文交给模型（旧行为就是这样静默出错的）。
            if (isDocsHtmlFallback(markdown)) {
              throw new Error(
                t("rag.readDocNotMarkdown", {
                  docPath: markdownPath,
                  pageUrl: markdownPath.replace(/\.md(?=#|$)/i, ""),
                }),
              );
            }
            return jsonContent(
              buildDocsEnvelope(
                resolvedAction,
                { docPath: resolvedDocPath, markdownPath, content: markdown },
                t("rag.readDocSuccess"),
              ),
            );
          }

          const resolvedQuery = requireStringParam(
            query,
            "query",
            resolvedAction,
          );
          const results = await docsManager.searchDocs(resolvedQuery);
          return jsonContent(
            buildDocsEnvelope(
              resolvedAction,
              { query: resolvedQuery, results },
              t("rag.searchDocsSuccess"),
            ),
          );
        } catch (error) {
          return jsonContent(buildDocsErrorEnvelope(error));
        }
      }

      if (mode === "skill") {
        // 不传 skillName：返回带适用场景的完整目录，让调用方按需发现后再取正文
        if (!skillName?.trim()) {
          return jsonContent(
            [
              t("rag.skillCatalogHeader", { count: skillNames.length }),
              ...skills.map((item) =>
                t("rag.skillListItem", {
                  name: path.basename(path.dirname(item.absolutePath)),
                  description: item.description,
                }),
              ),
            ].join("\n"),
          );
        }

        const skill = skills.find((item) =>
          item.absolutePath.includes(skillName!),
        );

        if (!skill) {
          const remoteHint =
            skillName?.trim()
              ? t("rag.skillRemoteHint", {
                  url: buildSkillRawUrl(skillName.trim(), "SKILL.md"),
                })
              : "";
          return {
            content: [
              {
                type: "text",
                text: t("rag.skillNotFound", {
                  skillName,
                  available: skillNames.join(", ") || "none",
                  remoteHint,
                }),
              },
            ],
          };
        }

        const skillDir = path.dirname(skill.absolutePath);
        const remoteSkillName = path.basename(skillDir);
        const markdownFiles = await collectSkillMarkdownFiles(skillDir);
        const remoteState = await getRemoteSkillState(remoteSkillName);
        const localContent = (await fs.readFile(skill.absolutePath)).toString();
        const sections: string[] = [];

        if (remoteState === "available") {
          sections.push(
            buildSkillRemoteFileList(remoteSkillName, markdownFiles),
          );
        } else if (remoteState === "missing") {
          sections.push(
            t("rag.skillRemoteMissing", { skillName: remoteSkillName }),
          );
        } else {
          sections.push(
            t("rag.skillRemoteProbeFailed", { skillName: remoteSkillName }),
          );
        }

        // 云端（hosted）模式：客户端读不到服务端本地路径，改返回正文（相对链接改写为绝对地址）
        if (isCloudMode()) {
          const body =
            remoteState === "available"
              ? rewriteRelativeLinks(localContent, remoteSkillName)
              : localContent;
          sections.push(t("rag.skillContentHeading", { body }));
          return { content: [{ type: "text", text: sections.join("\n\n") }] };
        }

        sections.push(
          t("rag.skillLocal", {
            path: skill.absolutePath,
            content: t("rag.skillContentHeading", { body: localContent }),
          }),
        );
        return { content: [{ type: "text", text: sections.join("\n\n") }] };
      }

      if (mode === "openapi") {
        if (!apiName?.trim()) {
          return jsonContent(
            [
              t("rag.openapiCatalogHeader", { count: openapiNames.length }),
              ...openapis.map((api) =>
                t("rag.openapiListItem", {
                  name: api.name,
                  description: api.description,
                }),
              ),
            ].join("\n"),
          );
        }

        const api = openapis.find((api) => api.name === apiName);
        if (!api) {
          return {
            content: [
              {
                type: "text",
                text: t("rag.openapiNotFound", {
                  apiName,
                  available: openapiNames.join(", ") || "none",
                }),
              },
            ],
          };
        }

        // 云端（hosted）模式：返回远程 URL，不下载/不返回服务端本地文件
        if (isCloudMode() && api.url) {
          return {
            content: [
              {
                type: "text",
                text: t("rag.openapiRemote", {
                  name: api.name,
                  description: api.description,
                  url: api.url,
                }),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: t("rag.openapiLocal", {
                name: api.name,
                description: api.description,
                path: api.absolutePath ?? "-",
                content: (await fs.readFile(api.absolutePath!)).toString(),
              }),
            },
          ],
        };
      }

      // mode 是枚举，docs / skill / openapi 三个分支已在上面全部返回，这里不可达
      throw new Error(t("rag.unsupportedMode", { mode: String(mode) }));
    },
  );
}

function extractDescriptionFromFrontMatter(content: string): string | null {
  const lines = content.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return null;
  const fm: string[] = [];
  for (let i = 1; i < lines.length && lines[i].trim() !== "---"; i++)
    fm.push(lines[i]);
  const match = fm
    .join("\n")
    .match(/^description\s*:\s*(.*)$/m);
  return match ? match[1].trim() : null;
}

type SkillInfo = { description: string; absolutePath: string };

async function collectSkillDescriptions(rootDir: string): Promise<SkillInfo[]> {
  const result: SkillInfo[] = [];
  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(fullPath);
      else if (entry.isFile() && entry.name === "SKILL.md") {
        const desc = extractDescriptionFromFrontMatter(
          await fs.readFile(fullPath, "utf8"),
        );
        if (desc) result.push({ description: desc, absolutePath: fullPath });
      }
    }
  }
  await walk(rootDir);
  return result;
}

// ============ 远端 skill 地址 ============

/** 逐段编码路径（保留 `/` 分隔符），避免 skill 名/文件名中的特殊字符破坏 URL。 */
function encodeRawPath(relativePath: string): string {
  return relativePath
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

/** 拼接聚合仓中某个 skill 文件的可直接抓取的 raw 地址。 */
export function buildSkillRawUrl(skillName: string, relativePath: string): string {
  return `${SKILL_REMOTE_BASE_URL}/${encodeURIComponent(skillName)}/${encodeRawPath(relativePath)}`;
}

/**
 * 收集 skill 目录下所有 `.md`（递归，含 `references/` 及更深层），返回相对 skill 根目录的
 * posix 路径，`SKILL.md` 排在最前，其余按字典序。非 `.md` 文件不纳入清单：它们不是可读文档
 * （如远端聚合仓根部的 `activation-map.yaml` 也不在任何单个 skill 目录内），列出反而会诱导 AI
 * 去抓取无法解析的资产。
 */
export async function collectSkillMarkdownFiles(skillDir: string): Promise<string[]> {
  const files: string[] = [];
  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
        files.push(path.relative(skillDir, fullPath).split(path.sep).join("/"));
      }
    }
  }
  await walk(skillDir);
  return files.sort((a, b) => {
    if (a === "SKILL.md") return -1;
    if (b === "SKILL.md") return 1;
    return a.localeCompare(b);
  });
}

/**
 * 把 SKILL.md 正文里「代码栅栏之外」的相对链接改写为聚合仓 raw 绝对地址。
 *
 * 实现思路来自 `scripts/generate-prompts.mjs` 的 rewriteRelativeLinks（栅栏感知、只改写栅栏外
 * 链接、保留锚点、跳过绝对地址/站内绝对路径/纯锚点）。考虑到 `scripts/` 是 .mjs、`mcp/src/`
 * 会编译到 `mcp/dist`，跨目录 import 会破坏构建，这里按本文件的远端基址重写一份，不共享实现。
 *
 * 栅栏判定：按行扫描，某行 trim 后以 ``` 开头就翻转栅栏状态；栅栏内的内容原样保留（其中可能是
 * 示例代码，改写会改变语义）。相对链接以 skill 目录为基准解析 —— `../sibling/SKILL.md` 在聚合仓
 * 中同样成立；一旦解析结果越出聚合 references 根（以 `..` 开头）就保持原样。
 */
export function rewriteRelativeLinks(content: string, skillName: string): string {
  let fencing = false;

  return content
    .split("\n")
    .map((line) => {
      if (line.trim().startsWith("```")) {
        fencing = !fencing;
        return line;
      }
      if (fencing) return line;

      return line.replace(/\]\(([^)\s]+)\)/g, (whole, target: string) => {
        // 带协议（http:、https:、mailto: 等）、站内绝对路径、纯锚点一律不改写
        if (
          /^[a-z][a-z0-9+.-]*:/i.test(target) ||
          target.startsWith("/") ||
          target.startsWith("#")
        ) {
          return whole;
        }

        const hashIndex = target.indexOf("#");
        const pathPart = hashIndex === -1 ? target : target.slice(0, hashIndex);
        const anchor = hashIndex === -1 ? "" : target.slice(hashIndex);
        if (!pathPart) return whole;

        const resolved = path.posix.normalize(
          path.posix.join(skillName, pathPart),
        );
        // 越出聚合 references 根说明目标不在本仓，保持原样
        if (resolved.startsWith("..")) return whole;

        return `](${SKILL_REMOTE_BASE_URL}/${encodeRawPath(resolved)}${anchor})`;
      });
    })
    .join("\n");
}

type RemoteSkillState = "available" | "missing" | "unknown";

// 每个 skill 名只探测一次；聚合仓是 skill 的权威远端镜像，本地/缓存可能领先或落后于它。
const remoteSkillStateCache = new Map<string, Promise<RemoteSkillState>>();

/**
 * 探测 skill 在聚合仓中是否存在（HEAD `<base>/<skillName>/SKILL.md`）。
 * 404 => 明确不存在（用于避免返回死链）；其余状态或网络异常 => 无法确认。
 */
function getRemoteSkillState(skillName: string): Promise<RemoteSkillState> {
  const cached = remoteSkillStateCache.get(skillName);
  if (cached) return cached;

  const probe = (async (): Promise<RemoteSkillState> => {
    try {
      const response = await fetch(buildSkillRawUrl(skillName, "SKILL.md"), {
        method: "HEAD",
      });
      return response.status === 404 ? "missing" : "available";
    } catch {
      return "unknown";
    }
  })();

  remoteSkillStateCache.set(skillName, probe);
  return probe;
}

/** 生成「该 skill 的所有 md 文件 raw 地址」清单，供 AI 按需抓取。 */
function buildSkillRemoteFileList(
  skillName: string,
  markdownFiles: string[],
): string {
  const lines = markdownFiles.map(
    (file) => `- ${file}: ${buildSkillRawUrl(skillName, file)}`,
  );
  return [
    t("rag.skillRemoteFileListHeader", { skillName }),
    ...lines,
  ].join("\n");
}
