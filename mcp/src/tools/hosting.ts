import fs from 'fs';
import path from 'path';
import { z } from "zod";
import { getCloudBaseManager, getEnvId, logCloudBaseResult } from '../cloudbase-manager.js';
import { ExtendedMcpServer } from '../server.js';
import { sendDeployNotification } from '../utils/notification.js';
import { buildJsonToolResult, toolPayloadErrorToResult } from '../utils/tool-result.js';


// 定义扩展的EnvInfo接口，包含StaticStorages属性
interface ExtendedEnvInfo {
  EnvInfo: {
    StaticStorages?: Array<{
      StaticDomain: string;
      [key: string]: any;
    }>;
    [key: string]: any;
  };
  [key: string]: any;
}

function isDirectoryUploadTarget(localPath?: string, cloudPath?: string): boolean {
  if (localPath) {
    try {
      if (fs.statSync(localPath).isDirectory()) {
        return true;
      }
    } catch {
      // Fall back to cloudPath heuristics when local path can't be inspected.
    }
  }

  const normalizedCloudPath = (cloudPath ?? '').trim();
  if (!normalizedCloudPath) return true;
  if (normalizedCloudPath.endsWith('/')) return true;

  return path.posix.extname(normalizedCloudPath) === '';
}

function buildHostingAccessUrl(staticDomain?: string, cloudPath?: string, localPath?: string): string {
  if (!staticDomain) return '';

  const normalizedCloudPath = (cloudPath ?? '').trim().replace(/^\/+|\/+$/g, '');
  const isDirectory = isDirectoryUploadTarget(localPath, cloudPath);

  if (!normalizedCloudPath) {
    return `https://${staticDomain}/`;
  }

  const pathname = isDirectory ? `${normalizedCloudPath}/` : normalizedCloudPath;
  return `https://${staticDomain}/${pathname}`;
}

function buildUploadFilesErrorMessage(error: unknown, localPath?: string): string {
  const baseMessage = error instanceof Error ? error.message : String(error);
  const suggestions: string[] = [];

  if (/路径不存在|无读写权限/i.test(baseMessage)) {
    if (localPath) {
      suggestions.push(`请先确认本地路径 \`${localPath}\` 存在且当前进程有读取权限。`);
    }
    suggestions.push("如果报错的是构建产物中的某个静态资源文件，请检查构建后的资源引用路径是否正确。");
    suggestions.push("若站点部署到子路径，请确认 `publicPath`、`base`、`assetPrefix` 等配置没有把资源指向不存在的位置。");
  }

  if (suggestions.length === 0) {
    suggestions.push("请检查上传目录、文件权限和构建产物完整性后重试。");
  }

  return `[uploadFiles] ${baseMessage}\n建议：${suggestions.join(" ")}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getRecordString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  return undefined;
}

function collectDomainRecords(
  value: unknown,
  seen = new Set<unknown>(),
  depth = 0,
): Array<Record<string, unknown>> {
  if (depth > 5 || !value || typeof value !== "object" || seen.has(value)) {
    return [];
  }

  seen.add(value);

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectDomainRecords(item, seen, depth + 1));
  }

  const record = value as Record<string, unknown>;
  const current = getRecordString(record, ["Domain", "domain"])
    ? [record]
    : [];

  return current.concat(
    Object.values(record).flatMap((item) => collectDomainRecords(item, seen, depth + 1)),
  );
}

function summarizeHostingDomainCheck(domains: string[], result: unknown) {
  const targetSet = new Set(domains);
  const matchedRecords = collectDomainRecords(result).filter((record) => {
    const domain = getRecordString(record, ["Domain", "domain"]);
    return domain ? targetSet.has(domain) : false;
  });
  const matchedDomains = Array.from(
    new Set(
      matchedRecords
        .map((record) => getRecordString(record, ["Domain", "domain"]))
        .filter((domain): domain is string => Boolean(domain)),
    ),
  );

  return {
    matchedDomains,
    missingDomains: domains.filter((domain) => !matchedDomains.includes(domain)),
    domainDetails: matchedRecords,
  };
}

function extractTaskStatus(result: unknown): string | undefined {
  const candidates: unknown[] = [result];

  if (isRecord(result)) {
    candidates.push(result.Data, result.Task, result.Result);
  }

  for (const candidate of candidates) {
    if (!isRecord(candidate)) {
      continue;
    }

    const value = getRecordString(candidate, ["Status", "status", "TaskStatus", "State"]);
    if (value) {
      return value;
    }
  }

  return undefined;
}

function buildHostingDomainNextStep(domains: string[]) {
  return {
    tool: "domainManagement",
    action: "check",
    suggested_args: {
      action: "check",
      domains,
    },
  };
}

async function describeHostingDomainTask(
  cloudbase: any,
  cloudBaseOptions?: { envId?: string },
  logger?: ExtendedMcpServer["logger"],
) {
  try {
    const envId = await getEnvId(cloudBaseOptions);
    const service = cloudbase.commonService?.("tcb", "2018-06-08");

    if (!service?.call) {
      return undefined;
    }

    const result = await service.call({
      Action: "DescribeHostingDomainTask",
      Param: { EnvId: envId },
    });
    logCloudBaseResult(logger, result);

    return {
      rawStatus: extractTaskStatus(result),
      raw: result,
    };
  } catch {
    return undefined;
  }
}

function buildHostingDomainMutationResult(params: {
  action: "create" | "delete" | "modify";
  domain: string;
  certId?: string;
  domainId?: number;
  domainConfig?: unknown;
  result: unknown;
  taskStatus?: {
    rawStatus?: string;
    raw: unknown;
  };
}) {
  const { action, domain, certId, domainId, domainConfig, result, taskStatus } = params;
  const actionLabel =
    action === "create"
      ? "绑定"
      : action === "delete"
        ? "解绑"
        : "修改";
  const successIndicator =
    action === "create"
      ? `继续调用 domainManagement(action=\"check\", domains=[\"${domain}\"])，直到返回中出现该域名，并且相关状态字段显示为已生效。`
      : action === "delete"
        ? `继续调用 domainManagement(action=\"check\", domains=[\"${domain}\"])，直到返回中不再出现该域名。`
        : `继续调用 domainManagement(action=\"check\", domains=[\"${domain}\"])，确认返回中的配置字段已更新为最新值。`;

  return {
    ok: true,
    code: `HOSTING_DOMAIN_${action.toUpperCase()}_PENDING`,
    action,
    targetDomains: [domain],
    ...(certId ? { certId } : {}),
    ...(domainId !== undefined ? { domainId } : {}),
    ...(domainConfig ? { domainConfig } : {}),
    asyncState: "PENDING",
    message:
      `静态托管域名${actionLabel}请求已提交。域名配置、证书校验和边缘侧传播通常需要 30 秒到 10 分钟，请继续轮询 domainManagement(action=\"check\") 再确认最终结果。`,
    propagation: {
      requiresPolling: true,
      pollTool: "domainManagement",
      pollAction: "check",
      pollIntervalSuggestionSeconds: 30,
      timeoutSuggestionSeconds: 600,
      successIndicator,
    },
    ...(taskStatus
      ? {
          taskStatus,
        }
      : {}),
    next_step: buildHostingDomainNextStep([domain]),
    result,
  };
}

export function registerHostingTools(server: ExtendedMcpServer) {
  // 获取 cloudBaseOptions，如果没有则为 undefined
  const cloudBaseOptions = server.cloudBaseOptions;

  // 创建闭包函数来获取 CloudBase Manager
  const getManager = () => getCloudBaseManager({ cloudBaseOptions });

  // uploadFiles - 上传文件到静态网站托管 (cloud-incompatible)
  server.registerTool(
    "uploadFiles",
    {
      title: "上传静态文件",
      description: "上传文件到静态网站托管，仅用于 Web 站点部署，不用于云存储对象上传。部署前请先完成构建；如果站点会部署到子路径，请检查构建配置中的 publicPath、base、assetPrefix 等是否使用相对路径，避免静态资源加载失败。若需要上传 COS 云存储文件，请使用 manageStorage。对于本地评测、现有脚手架补全或仅需本地开发服务器验证的任务，通常不需要调用此工具，除非用户明确要求部署站点。",
      inputSchema: {
        localPath: z.string().optional().describe("本地文件或文件夹路径，需要是绝对路径，例如 /tmp/files/data.txt。"),
        cloudPath: z.string().optional().describe("静态托管云端文件或文件夹路径，例如 files/data.txt。不要以斜杠开头（如 /files），除非确实需要绝对路径；上传到根目录时可传空字符串或省略此参数。若部署到子路径，请同时检查构建配置中的 publicPath、base、assetPrefix 等是否为相对路径。云存储对象路径请改用 manageStorage。"),
        files: z.array(z.object({
          localPath: z.string(),
          cloudPath: z.string()
        })).default([]).describe("多文件上传配置"),
        ignore: z.union([z.string(), z.array(z.string())]).optional().describe("忽略文件模式")
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
        category: "hosting"
      }
    },
    async ({ localPath, cloudPath: rawCloudPath, files = [], ignore }: {
      localPath?: string;
      cloudPath?: string;
      files?: Array<{ localPath: string; cloudPath: string }>;
      ignore?: string | string[]
    }) => {
      const cloudbase = await getManager()
      // Normalize cloudPath: remove leading/trailing slashes to avoid double slashes in uploaded file keys
      const cloudPath = rawCloudPath ? rawCloudPath.trim().replace(/^\/+|\/+$/g, '') : '';
      // localPath and files are alternative upload modes in the underlying SDK; only forward
      // `files` when it actually contains entries, otherwise an empty array can shadow the
      // localPath-based folder upload and result in 0 files being uploaded.
      const normalizedFiles = files.map(f => ({
        localPath: f.localPath,
        cloudPath: f.cloudPath.trim().replace(/^\/+|\/+$/g, '')
      }));
      if (!localPath && normalizedFiles.length === 0) {
        throw new Error(
          "[uploadFiles] 缺少上传目标：请提供 localPath（单文件或目录的绝对路径），或提供非空的 files 列表。"
        );
      }
      let result: unknown;
      try {
        if (normalizedFiles.length > 0) {
          result = await cloudbase.hosting.uploadFiles({
            localPath,
            cloudPath: cloudPath || undefined,
            files: normalizedFiles,
            ignore,
          });
        } else {
          // Use single-file/folder upload mode. The underlying SDK treats `files`
          // and `localPath` as alternative upload modes; passing an empty `files`
          // array silently short-circuits the localPath-based folder walk and
          // results in 0 files being uploaded, leaving static hosting empty.
          result = await cloudbase.hosting.uploadFiles({
            localPath,
            cloudPath: cloudPath || undefined,
            ignore,
          } as Parameters<typeof cloudbase.hosting.uploadFiles>[0]);
        }
      } catch (error) {
        throw new Error(buildUploadFilesErrorMessage(error, localPath));
      }
      logCloudBaseResult(server.logger, result);
      const uploadResult = result as Record<string, unknown>;

      // 获取环境信息
      const envInfo = await cloudbase.env.getEnvInfo() as ExtendedEnvInfo;
      logCloudBaseResult(server.logger, envInfo);
      const staticDomain = envInfo.EnvInfo?.StaticStorages?.[0]?.StaticDomain;
      const accessUrl = buildHostingAccessUrl(staticDomain, cloudPath, localPath);

      // Send deployment notification to CodeBuddy IDE
      try {
        const envId = await getEnvId(cloudBaseOptions);

        // Extract project name from localPath
        let projectName = "unknown";
        if (localPath) {
          try {
            // If localPath is a file, get parent directory name; if it's a directory, get directory name
            const stats = fs.statSync(localPath);
            if (stats.isFile()) {
              projectName = path.basename(path.dirname(localPath));
            } else {
              projectName = path.basename(localPath);
            }
          } catch (statErr) {
            // If stat fails, try to extract from path directly
            projectName = path.basename(localPath);
          }
        }

        // Build console URL
        const consoleUrl = `https://tcb.cloud.tencent.com/dev?envId=${envId}#/static-hosting`;

        // Send notification
        await sendDeployNotification(server, {
          deployType: 'hosting',
          url: accessUrl,
          projectId: envId,
          projectName: projectName,
          consoleUrl: consoleUrl
        });
      } catch (notifyErr) {
        // Notification failure should not affect deployment flow
        // Error is already logged in sendDeployNotification
      }

      // Build deployment status summary
      const uploadedFiles = (uploadResult.files as Array<{ options?: { Key?: string } }>) || [];
      const fileCount = uploadedFiles.length;
      const deploymentTarget = cloudPath ? `/${cloudPath}/` : '根目录';
      const deploymentSucceeded = fileCount > 0;
      const message = deploymentSucceeded
        ? `部署成功：已上传 ${fileCount} 个文件到 ${deploymentTarget}`
        : `未上传任何文件到 ${deploymentTarget}。请确认 localPath 指向存在的非空目录或文件，或传入非空的 files 列表，然后重试。`;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              ...uploadResult,
              staticDomain,
              message,
              accessUrl: accessUrl,
              deploymentStatus: {
                filesUploaded: fileCount,
                targetPath: cloudPath || '/',
                staticDomain: staticDomain,
                isReady: deploymentSucceeded,
                note: deploymentSucceeded
                  ? "CDN 缓存可能需要 1-3 分钟生效，如无法立即访问请稍后再试"
                  : "没有文件被上传，静态托管上不会出现新资源；请修复 localPath/files 后重新调用 uploadFiles。"
              }
            }, null, 2)
          }
        ]
      };
    }
  );



  // deleteFiles - 删除静态网站托管文件
  server.registerTool?.(
    "deleteFiles",
    {
      title: "删除静态文件",
      description: "删除静态网站托管的文件或文件夹",
      inputSchema: {
        cloudPath: z.string().describe("云端文件或文件夹路径"),
        isDir: z.boolean().default(false).describe("是否为文件夹")
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
        category: "hosting"
      }
    },
    async ({ cloudPath, isDir = false }: { cloudPath: string; isDir?: boolean }) => {
      const cloudbase = await getManager()
      const result = await cloudbase.hosting.deleteFiles({
        cloudPath,
        isDir
      });
      logCloudBaseResult(server.logger, result);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    }
  );

  // findFiles - 搜索文件
  server.registerTool?.(
    "findFiles",
    {
      title: "搜索静态文件",
      description: "搜索静态网站托管的文件",
      inputSchema: {
        prefix: z.string().describe("匹配前缀"),
        marker: z.string().optional().describe("起始对象键标记"),
        maxKeys: z.number().optional().describe("单次返回最大条目数")
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
        category: "hosting"
      }
    },
    async ({ prefix, marker, maxKeys }: { prefix: string; marker?: string; maxKeys?: number }) => {
      const cloudbase = await getManager()
      const result = await cloudbase.hosting.findFiles({
        prefix,
        marker,
        maxKeys
      });
      logCloudBaseResult(server.logger, result);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    }
  );

  // domainManagement - 统一的域名管理工具
  server.registerTool?.(
    "domainManagement",
    {
      title: "静态托管域名管理",
      description: "统一的域名管理工具，支持绑定、解绑、查询和修改域名配置。绑定、解绑和修改通常是异步传播流程，调用后应继续使用 action=check 轮询确认域名是否已出现、已删除或配置已收敛。",
      inputSchema: {
        action: z.enum(["create", "delete", "check", "modify"]).describe("操作类型: create=绑定域名, delete=解绑域名, check=查询域名配置, modify=修改域名配置"),
        // 绑定域名参数
        domain: z.string().optional().describe("域名"),
        certId: z.string().optional().describe("证书ID（绑定域名时必需）"),

        domains: z.array(z.string()).optional().describe("域名列表（查询配置时使用）"),
        // 修改域名参数
        domainId: z.number().optional().describe("域名ID（修改配置时必需）"),
        domainConfig: z.object({
          Refer: z.object({
            Switch: z.string(),
            RefererRules: z.array(z.object({
              RefererType: z.string(),
              Referers: z.array(z.string()),
              AllowEmpty: z.boolean()
            })).optional()
          }).optional(),
          Cache: z.array(z.object({
            RuleType: z.string(),
            RuleValue: z.string(),
            CacheTtl: z.number()
          })).optional(),
          IpFilter: z.object({
            Switch: z.string(),
            FilterType: z.string().optional(),
            Filters: z.array(z.string()).optional()
          }).optional(),
          IpFreqLimit: z.object({
            Switch: z.string(),
            Qps: z.number().optional()
          }).optional()
        }).optional().describe("域名配置（修改配置时使用）")
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
        category: "hosting"
      }
    },
    async ({ action, domain, certId, domains, domainId, domainConfig }: {
      action: "create" | "delete" | "check" | "modify";
      domain?: string;
      certId?: string;
      domains?: string[];
      domainId?: number;
      domainConfig?: any;
    }) => {
      try {
        const cloudbase = await getManager();
        let result;

        switch (action) {
          case "create": {
            if (!domain || !certId) {
              throw new Error("绑定域名需要提供域名和证书ID");
            }
            result = await cloudbase.hosting.CreateHostingDomain({
              domain,
              certId
            });
            logCloudBaseResult(server.logger, result);

            const taskStatus = await describeHostingDomainTask(cloudbase, cloudBaseOptions, server.logger);
            return buildJsonToolResult(
              buildHostingDomainMutationResult({
                action,
                domain,
                certId,
                result,
                taskStatus,
              }),
            );
          }

          case "delete": {
            if (!domain) {
              throw new Error("解绑域名需要提供域名");
            }
            result = await cloudbase.hosting.deleteHostingDomain({
              domain
            });
            logCloudBaseResult(server.logger, result);

            const taskStatus = await describeHostingDomainTask(cloudbase, cloudBaseOptions, server.logger);
            return buildJsonToolResult(
              buildHostingDomainMutationResult({
                action,
                domain,
                result,
                taskStatus,
              }),
            );
          }

          case "check": {
            if (!domains || domains.length === 0) {
              throw new Error("查询域名配置需要提供域名列表");
            }
            result = await cloudbase.hosting.tcbCheckResource({
              domains
            });
            logCloudBaseResult(server.logger, result);

            const summary = summarizeHostingDomainCheck(domains, result);
            const allMatched = summary.missingDomains.length === 0;

            return buildJsonToolResult({
              ok: true,
              code: allMatched ? "HOSTING_DOMAIN_CHECK_READY" : "HOSTING_DOMAIN_CHECK_PENDING",
              action,
              queriedDomains: domains,
              matchedDomains: summary.matchedDomains,
              missingDomains: summary.missingDomains,
              domainDetails: summary.domainDetails,
              message: allMatched
                ? "已查询到目标静态托管域名配置。若这是绑定或修改后的确认步骤，请继续核对返回中的状态字段、证书信息和配置内容是否符合预期。"
                : "部分目标静态托管域名尚未在查询结果中出现。若这是绑定后的确认步骤，请继续轮询 domainManagement(action=\"check\") 直到结果收敛或达到超时。",
              ...(allMatched
                ? {}
                : {
                    next_step: buildHostingDomainNextStep(summary.missingDomains),
                    propagation: {
                      requiresPolling: true,
                      pollTool: "domainManagement",
                      pollAction: "check",
                      pollIntervalSuggestionSeconds: 30,
                      timeoutSuggestionSeconds: 600,
                      successIndicator: "目标域名出现在返回结果中，并且相关状态字段显示为已生效。",
                    },
                  }),
              result,
            });
          }

          case "modify": {
            if (!domain || domainId === undefined || !domainConfig) {
              throw new Error("修改域名配置需要提供域名、域名ID和配置信息");
            }
            result = await cloudbase.hosting.tcbModifyAttribute({
              domain,
              domainId,
              domainConfig
            });
            logCloudBaseResult(server.logger, result);

            const taskStatus = await describeHostingDomainTask(cloudbase, cloudBaseOptions, server.logger);
            return buildJsonToolResult(
              buildHostingDomainMutationResult({
                action,
                domain,
                domainId,
                domainConfig,
                result,
                taskStatus,
              }),
            );
          }

          default:
            throw new Error(`不支持的操作类型: ${action}`);
        }
      } catch (error) {
        const toolPayloadResult = toolPayloadErrorToResult(error);
        if (toolPayloadResult) {
          return toolPayloadResult;
        }
        return {
          content: [
            {
              type: "text",
              text: `域名管理操作失败: ${error instanceof Error ? error.message : String(error)}`,
            }
          ]
        };
      }
    }
  );
}
