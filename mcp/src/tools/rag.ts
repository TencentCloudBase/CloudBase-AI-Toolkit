import AdmZip from "adm-zip";
import * as fs from "fs/promises";
import lockfile, { Options as LockfileOptions } from "lockfile";
import * as os from "os";
import * as path from "path";
import { z } from "zod";
import { createCloudBaseManagerWithOptions } from "../cloudbase-manager.js";
import { ExtendedMcpServer } from "../server.js";
import { jsonContent } from "../utils/json-content.js";
import { debug, warn } from "../utils/logger.js";

// 1. 枚举定义
const KnowledgeBaseEnum = z.enum(["cloudbase", "scf", "miniprogram"]);
const SearchKnowledgeModeEnum = z.enum(["vector", "skill", "openapi", "docs"]);
const CloudBaseDocsActionEnum = z.enum([
  "listModules",
  "listModuleDocs",
  "findByName",
  "readDoc",
  "searchDocs",
]);
// 2. 枚举到后端 id 的映射
const KnowledgeBaseIdMap: Record<z.infer<typeof KnowledgeBaseEnum>, string> = {
  cloudbase: "ykfzskv4_ad28",
  scf: "scfsczskzyws_4bdc",
  miniprogram: "xcxzskws_25d8",
};

// ============ 缓存配置 ============
const CACHE_BASE_DIR = path.join(os.homedir(), ".cloudbase-mcp");
const CACHE_META_FILE = path.join(CACHE_BASE_DIR, "cache-meta.json");
const LOCK_FILE = path.join(CACHE_BASE_DIR, ".download.lock");
const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 默认 24 小时

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
type OpenAPIInfo = { name: string; description: string; absolutePath: string };

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

// 安全 JSON.parse
function safeParse(str: string) {
  try {
    return JSON.parse(str);
  } catch (e) {
    return {};
  }
}

// 安全 JSON.stringify，处理循环引用
function safeStringify(obj: any) {
  const seen = new WeakSet();
  try {
    return JSON.stringify(obj, function (key, value) {
      if (typeof value === "object" && value !== null) {
        if (seen.has(value)) return;
        seen.add(value);
      }
      return value;
    });
  } catch (e) {
    return "";
  }
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
    throw new Error(`action=${action} 时必须提供 ${fieldName}`);
  }
  return value.trim();
}

function buildOptionalStringEnum(values: string[], description: string) {
  const uniqueValues = [...new Set(values.filter((value) => value.trim()))];

  if (uniqueValues.length > 0) {
    return z
      .enum(uniqueValues as [string, ...string[]])
      .optional()
      .describe(description);
  }

  return z
    .string()
    .optional()
    .describe(
      `${description} 当前暂时无法枚举可选值；如需查看当前可用项，可直接传入字符串，工具会在执行时返回可用列表。`,
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
      description: "关系型数据库 RESTful API (MySQL/PostgreSQL) - 云开发关系型数据库 HTTP API",
      url: "https://docs.cloudbase.net/openapi/mysqldb.v1.openapi.yaml",
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
    throw new Error(`下载模板失败，状态码: ${response.status}`);
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

  const results: OpenAPIInfo[] = [];
  await Promise.all(
    OPENAPI_SOURCES.map(async (source) => {
      try {
        const response = await fetch(source.url);
        if (!response.ok) {
          warn(`[downloadOpenAPI] Failed to download ${source.name}`, {
            status: response.status,
          });
          return;
        }
        const content = await response.text();
        const filePath = path.join(baseDir, `${source.name}.openapi.yaml`);
        await fs.writeFile(filePath, content, "utf8");
        results.push({
          name: source.name,
          description: source.description,
          absolutePath: filePath,
        });
      } catch (error) {
        warn(`[downloadOpenAPI] Failed to download ${source.name}`, {
          error,
        });
      }
    }),
  );

  debug("[downloadOpenAPI] openAPIDocs 下载完成", {
    successCount: results.length,
    total: OPENAPI_SOURCES.length,
  });
  return results;
}

// 实际执行下载所有资源的函数（webTemplate 和 openAPI 并发下载）
async function _doDownloadResources(): Promise<DownloadResult> {
  // 并发下载 webTemplate 和 openAPIDocs
  const [webTemplateDir, openAPIDocs] = await Promise.all([
    // 下载 web 模板
    downloadWebTemplate(),

    // 并发下载所有 OpenAPI 文档
    downloadOpenAPI(),
  ]);

  debug("[downloadResources] 所有资源下载完成");
  return { webTemplateDir, openAPIDocs };
}

// 下载所有资源（带缓存和共享 Promise 机制）
async function downloadResources(): Promise<DownloadResult> {
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
      // 检查两个目录都存在
      await Promise.all([fs.access(webTemplateDir), fs.access(openAPIDir)]);
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
      const result = await _doDownloadResources();
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

export async function registerRagTools(server: ExtendedMcpServer) {
  // 联网搜索
  server.registerTool?.(
    "searchWeb",
    {
      title: "联网搜索",
      description:
        "使用联网来进行信息检索，如查询最新的新闻、文章、股价、天气等。支持自然语言查询，也可以直接输入网址获取网页内容",
      inputSchema: {
        query: z.string().describe("搜索关键词、问题或网址，支持自然语言"),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
        category: "web",
      },
    },
    async ({ query }: { query: string }) => {
      try {
        // 使用混元进行联网搜索
        const signInRes = await fetch(
          "https://tcb-advanced-a656fc.api.tcloudbasegateway.com/auth/v1/signin/anonymously",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
              "x-device-id": "cloudbase-ai-toolkit",
            },
            body: safeStringify({}),
          },
        );
        const { access_token } = await signInRes.json();

        // 调用混元API进行联网搜索
        const searchRes = await fetch(
          "https://tcb-advanced-a656fc.api.tcloudbasegateway.com/v1/ai/hunyuan-beta/openapi/v1/chat/completions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${access_token}`,
            },
            body: safeStringify({
              model: "hunyuan",
              messages: [
                {
                  role: "user",
                  content: `你好，你将扮演一个知识库的角色，联网查询到问题的答案之后回答给我`,
                },
                {
                  role: "assistant",
                  content: "好的",
                },
                {
                  role: "user",
                  content: query,
                },
              ],
              enable_enhancement: true,
              search_info: true,
              enable_speed_search: true,
              force_search_enhancement: true,
            }),
          },
        );

        const result = await searchRes.json();

        if (result.error) {
          throw new Error(result.error.message || "联网搜索失败");
        }

        const content = result.choices?.[0]?.message?.content || "";
        const searchResults = result.search_info?.search_results || [];

        return {
          content: [
            {
              type: "text",
              text: safeStringify({
                type: "web_search",
                content: content,
                search_results: searchResults.map((item: any) => ({
                  title: item.title,
                  url: item.url,
                  snippet: item.snippet,
                })),
                status: "success",
              }),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: safeStringify({
                type: "error",
                message:
                  error instanceof Error ? error.message : "联网搜索失败",
                status: "error",
              }),
            },
          ],
        };
      }
    },
  );

  let openapis: OpenAPIInfo[] = [];
  let skills: SkillInfo[] = [];
  let fallbackSkillsRoot: string | undefined;

  try {
    const { webTemplateDir, openAPIDocs } = await downloadResources();
    openapis = openAPIDocs;
    fallbackSkillsRoot = path.join(webTemplateDir, ".claude", "skills");
  } catch (error) {
    warn("[downloadResources] Failed to download resources", {
      error,
    });
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
      title: "云开发知识库检索",
      description: `云开发知识库智能检索工具，支持向量查询 (vector)、固定技能文档 (skill)、OpenAPI 文档 (openapi) 和 CloudBase 官方文档 (docs) 查询。

      强烈推荐始终优先使用固定技能文档 (skill)、OpenAPI 文档 (openapi) 或 CloudBase 官方文档 (docs) 模式进行检索，仅当固定文档无法覆盖你的问题时，再使用向量查询 (vector) 模式。

      ⚠️ 重要：当 CloudBase skills 处于禁用状态或当前 IDE 不支持 skill 文件读取时，必须使用 searchKnowledgeBase(mode=skill, skillName=...) 来获取 CloudBase 技能文档内容，而不是尝试直接读取 skill 文件。直接读取可能返回 400 错误。示例：
      - 需要 auth-tool 指南时：searchKnowledgeBase(mode=skill, skillName=auth-tool)
      - 需要 auth-web 指南时：searchKnowledgeBase(mode=skill, skillName=auth-web)
      - 需要 cloudbase-agent 指南时：searchKnowledgeBase(mode=skill, skillName=cloudbase-agent)

      固定技能文档 (skill) 查询当前支持 ${skills.length} 个固定文档，分别是：
      ${skills
          .map(
            (skill) =>
              `文档名：${path.basename(path.dirname(skill.absolutePath))} 文档介绍：${skill.description
              }`,
          )
          .join("\n")}

      OpenAPI 文档 (openapi) 查询当前支持 ${openapis.length} 个 API 文档，分别是：
      ${openapis
          .map((api) => `API名：${api.name} API介绍：${api.description}`)
          .join("\n")}`,
      inputSchema: {
        mode: SearchKnowledgeModeEnum,
        skillName: buildOptionalStringEnum(
          skillNames,
          "mode=skill 时指定。技能名称。",
        ),
        apiName: buildOptionalStringEnum(
          openapiNames,
          "mode=openapi 时指定。API 名称。",
        ),
        action: CloudBaseDocsActionEnum.optional().describe(
          "mode=docs 时指定。CloudBase 文档操作类型：listModules=列出所有文档模块，listModuleDocs=获取指定模块的目录结构，findByName=按名称/路径/URL 智能查找，readDoc=读取指定文档 Markdown，searchDocs=全文搜索官方文档。",
        ),
        moduleName: z
          .string()
          .optional()
          .describe("mode=docs 且 action=listModuleDocs 时指定。模块名称。"),
        input: z
          .string()
          .optional()
          .describe("mode=docs 且 action=findByName 时指定。支持模块名、文档标题、层级路径或 URL。"),
        docPath: z
          .string()
          .optional()
          .describe("mode=docs 且 action=readDoc 时指定。文档相对路径或完整 URL。"),
        query: z
          .string()
          .optional()
          .describe("mode=docs 且 action=searchDocs 时指定。全文检索关键词。"),
        threshold: z
          .number()
          .default(0.5)
          .optional()
          .describe("mode=vector 时指定。相似性检索阈值"),
        id: KnowledgeBaseEnum.default("cloudbase").optional().describe(
          "mode=vector 时指定。知识库范围，默认 cloudbase。cloudbase=云开发全量知识，scf=云开发的云函数知识, miniprogram=小程序知识（不包含云开发与云函数知识）",
        ),
        content: z.string().describe("mode=vector 时指定。检索内容").optional(),
        options: z
          .object({
            chunkExpand: z
              .array(z.number())
              .min(2)
              .max(2)
              .default([3, 3])
              .describe(
                "指定返回的文档内容的展开长度,例如 [3,3]代表前后展开长度",
              ),
          })
          .optional()
          .describe("mode=vector 时指定。其他选项"),
        limit: z
          .number()
          .default(5)
          .optional()
          .describe("mode=vector 时指定。指定返回最相似的 Top K 的 K 的值"),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
        category: "rag",
      },
    },
    async ({
      id,
      content,
      options,
      limit = 5,
      threshold = 0.5,
      mode,
      skillName,
      apiName,
      action,
      moduleName,
      input,
      docPath,
      query,
    }) => {
      const chunkExpand = options?.chunkExpand ?? [3, 3];
      if (mode === "docs") {
        try {
          const resolvedAction = action;
          if (!resolvedAction) {
            throw new Error("mode=docs 时必须提供 action");
          }

          const docsManager = getDocsManager();

          if (!docsManager) {
            throw new Error(
              "当前 @cloudbase/manager-node 实例不支持 app.docs，请确认版本 >= 5.0.0。",
            );
          }

          if (resolvedAction === "listModules") {
            const modules = await docsManager.listModules();
            return jsonContent(
              buildDocsEnvelope(
                resolvedAction,
                { modules },
                "CloudBase 文档模块列表获取成功",
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
                "CloudBase 模块文档目录获取成功",
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
                "CloudBase 文档查找成功",
              ),
            );
          }

          if (resolvedAction === "readDoc") {
            const resolvedDocPath = requireStringParam(
              docPath,
              "docPath",
              resolvedAction,
            );
            const markdown = await docsManager.readDoc(resolvedDocPath);
            return jsonContent(
              buildDocsEnvelope(
                resolvedAction,
                { docPath: resolvedDocPath, content: markdown },
                "CloudBase 文档读取成功",
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
              "CloudBase 文档搜索成功",
            ),
          );
        } catch (error) {
          return jsonContent(buildDocsErrorEnvelope(error));
        }
      }

      if (mode === "skill") {
        const skill = skills.find((item) =>
          item.absolutePath.includes(skillName!),
        );

        if (!skill) {
          return {
            content: [
              {
                type: "text",
                text: `Skill document "${skillName}" not found. Available skill docs: ${skillNames.join(", ") || "none"}`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: `The skill doc's absolute path is: ${skill.absolutePath}. ${(await fs.readFile(skill.absolutePath)).toString()}`,
            },
          ],
        };
      }

      if (mode === "openapi") {
        const api = openapis.find((api) => api.name === apiName);
        if (!api) {
          return {
            content: [
              {
                type: "text",
                text: `OpenAPI document "${apiName}" not found. Available APIs: ${openapiNames.join(", ") || "none"}`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: `OpenAPI document: ${api.name}\nDescription: ${api.description}\nPath: ${api.absolutePath}\n\n${(await fs.readFile(api.absolutePath)).toString()}`,
            },
          ],
        };
      }

      // 向量检索模式下必须提供 id 和 content，避免后端报「知识库名称不能为空」
      const vectorKnowledgeBaseId = id ?? "cloudbase";

      if (mode === "vector") {
        if (!content || !content.trim()) {
          throw new Error(
            "检索内容不能为空: please provide non-empty `content` when mode=vector.",
          );
        }
      }

      // 枚举到后端 id 映射
      const backendId =
        KnowledgeBaseIdMap[vectorKnowledgeBaseId as keyof typeof KnowledgeBaseIdMap] ||
        vectorKnowledgeBaseId;
      const signInRes = await fetch(
        "https://tcb-advanced-a656fc.api.tcloudbasegateway.com/auth/v1/signin/anonymously",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "x-device-id": "cloudbase-ai-toolkit",
          },
          body: safeStringify({
            collectionView: backendId,
            options: {
              chunkExpand,
            },
            search: {
              content: content,
              limit,
            },
          }),
        },
      );
      const token = (await signInRes.json()).access_token;
      const res = await fetch(
        `https://tcb-advanced-a656fc.api.tcloudbasegateway.com/v1/knowledge/search`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: safeStringify({
            collectionView: backendId,
            options: {
              chunkExpand,
            },
            search: {
              content: content,
              limit,
            },
          }),
        },
      );
      const result = await res.json();

      if (result.code) {
        throw new Error(result.message);
      }

      return {
        content: [
          {
            type: "text",
            text: safeStringify(
              result.data.documents
                .filter((item: any) => item.score >= threshold)
                .map((item: any) => {
                  return {
                    score: item.score,
                    fileTile: item.documentSet.fileTitle,
                    url: safeParse(item.documentSet.fileMetaData).url,
                    paragraphTitle: item.data.paragraphTitle,
                    text: `${item.data.pre?.join("\n") || ""}
    ${item.data.text}
    ${item.data.next?.join("\n") || ""}`,
                  };
                }),
            ),
          },
        ],
      };
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
    .match(/^(?:decsription|description)\s*:\s*(.*)$/m);
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
