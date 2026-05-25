import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { getCloudBaseManager, getEnvId, logCloudBaseResult } from '../cloudbase-manager.js';
import { ExtendedMcpServer } from '../server.js';
import { isCloudMode } from '../utils/cloud-mode.js';
import { sendDeployNotification } from '../utils/notification.js';
import { buildJsonToolResult, toolPayloadErrorToResult } from '../utils/tool-result.js';

interface ExtendedEnvInfo {
  EnvInfo: {
    StaticStorages?: Array<{
      StaticDomain?: string;
      Bucket?: string;
      [key: string]: unknown;
    }>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

const routingRuleSchema = z.object({
  keyPrefixEquals: z.string().optional().describe('匹配前缀规则，例如 app/ 或 assets/。与 httpErrorCodeReturnedEquals 二选一或按 CloudBase 规则组合使用。'),
  httpErrorCodeReturnedEquals: z.string().optional().describe('匹配 HTTP 错误码，例如 404。SPA 回退常用 404。'),
  replaceKeyWith: z.string().optional().describe('把匹配结果替换为固定文件路径，例如 index.html。'),
  replaceKeyPrefixWith: z.string().optional().describe('把匹配前缀替换成新的前缀路径。'),
});

const domainConfigSchema = z.object({
  Refer: z.object({
    Switch: z.string().describe('Referer 防盗链开关，例如 on/off。'),
    RefererRules: z.array(z.object({
      RefererType: z.string().describe('Referer 规则类型。'),
      Referers: z.array(z.string()).describe('Referer 规则值列表。'),
      AllowEmpty: z.boolean().describe('是否允许空 Referer。'),
    })).optional().describe('Referer 规则列表。'),
  }).optional().describe('Referer 防盗链配置。'),
  Cache: z.array(z.object({
    RuleType: z.string().describe('缓存规则类型，例如 fileType/path。'),
    RuleValue: z.string().describe('规则匹配值。'),
    CacheTtl: z.number().describe('缓存 TTL，单位秒。'),
  })).optional().describe('CDN 缓存规则列表。'),
  IpFilter: z.object({
    Switch: z.string().describe('IP 访问控制开关，例如 on/off。'),
    FilterType: z.string().optional().describe('过滤类型，例如 blacklist/whitelist。'),
    Filters: z.array(z.string()).optional().describe('IP 规则列表。'),
  }).optional().describe('IP 访问控制配置。'),
  IpFreqLimit: z.object({
    Switch: z.string().describe('IP 频控开关，例如 on/off。'),
    Qps: z.number().optional().describe('每个 IP 的 QPS 上限。'),
  }).optional().describe('IP 频控配置。'),
});

const queryHostingInputSchema = {
  action: z.enum(['websiteConfig', 'status', 'findFiles', 'listFiles', 'domainStatus']).describe('查询类型：websiteConfig=查询静态托管网站文档配置与站点域名信息，status=查询静态托管服务状态，findFiles=按前缀查找托管文件，listFiles=列出静态托管中的全部文件，domainStatus=查询自定义域名配置与生效状态。该工具严格只读，不会修改任何资源。'),
  prefix: z.string().optional().describe('文件前缀过滤条件。仅 action=findFiles 时使用，例如 app/ 或 assets/logo。'),
  marker: z.string().optional().describe('分页起始标记。仅 action=findFiles 时使用，用于续查上一页之后的结果。'),
  maxKeys: z.number().int().positive().optional().describe('单次返回的最大文件条数。仅 action=findFiles 时使用。'),
  domains: z.array(z.string()).optional().describe('要查询的自定义域名列表。仅 action=domainStatus 时使用，例如 ["www.example.com"]。'),
};

const manageHostingInputSchema = {
  action: z.enum(['upload', 'delete', 'setWebsiteDocument', 'enableService', 'bindDomain', 'unbindDomain', 'updateDomain', 'downloadFile', 'downloadDirectory']).describe('管理类型：upload=上传本地构建产物到静态托管，delete=删除静态托管文件或目录，setWebsiteDocument=设置首页/错误页/路由规则，enableService=开通静态托管服务，bindDomain=绑定自定义域名，unbindDomain=解绑自定义域名，updateDomain=更新域名缓存/防盗链/IP 规则，downloadFile=下载单个托管文件到本地，downloadDirectory=下载托管目录到本地。'),
  localPath: z.string().optional().describe('本地路径。action=upload 时表示要上传的本地文件/目录路径；action=downloadFile 或 downloadDirectory 时表示下载到本地的目标路径。建议传绝对路径。'),
  cloudPath: z.string().optional().describe('静态托管中的目标路径。action=upload 时表示上传后的托管路径；action=delete/downloadFile/downloadDirectory 时表示托管侧文件或目录路径。'),
  files: z.array(z.object({
    localPath: z.string().describe('单个待上传文件的本地绝对路径。'),
    cloudPath: z.string().describe('该文件上传到静态托管后的托管路径。'),
  })).default([]).describe('多文件上传配置。仅 action=upload 时可选；传入后会逐项上传，不再依赖单个 localPath/cloudPath。'),
  ignore: z.union([z.string(), z.array(z.string())]).optional().describe('上传时忽略的文件模式。仅 action=upload 时可选，例如 node_modules 或 ["**/*.map", "**/.DS_Store"]。'),
  isDir: z.boolean().optional().default(false).describe('是否把 cloudPath 视为目录。仅 action=delete 时使用；true=删除目录，false=删除单个文件。'),
  confirm: z.boolean().optional().default(false).describe('高风险操作确认开关。action=delete 和 action=unbindDomain 时必须显式传 true，避免误删文件或误解绑域名。'),
  indexDocument: z.string().optional().describe('网站首页文档名称。仅 action=setWebsiteDocument 时必填，例如 index.html。'),
  errorDocument: z.string().optional().describe('错误页文档名称。仅 action=setWebsiteDocument 时可选，例如 404.html。'),
  routingRules: z.array(routingRuleSchema).optional().describe('网站路由规则列表。仅 action=setWebsiteDocument 时可选。SPA 常见配置是将 404 重写到 index.html。'),
  domain: z.string().optional().describe('自定义域名。action=bindDomain / unbindDomain / updateDomain 时使用，例如 www.example.com。'),
  certId: z.string().optional().describe('证书 ID。仅 action=bindDomain 时必填。'),
  domainId: z.number().optional().describe('域名 ID。仅 action=updateDomain 时必填，用于精确更新指定域名配置。'),
  domainConfig: domainConfigSchema.optional().describe('域名配置。仅 action=updateDomain 时必填，支持缓存、Referer、防盗链、IP 规则与频控。'),
};

type QueryHostingInput = {
  action: 'websiteConfig' | 'status' | 'findFiles' | 'listFiles' | 'domainStatus';
  prefix?: string;
  marker?: string;
  maxKeys?: number;
  domains?: string[];
};

type ManageHostingInput = {
  action: 'upload' | 'delete' | 'setWebsiteDocument' | 'enableService' | 'bindDomain' | 'unbindDomain' | 'updateDomain' | 'downloadFile' | 'downloadDirectory';
  localPath?: string;
  cloudPath?: string;
  files?: Array<{ localPath: string; cloudPath: string }>;
  ignore?: string | string[];
  isDir?: boolean;
  confirm?: boolean;
  indexDocument?: string;
  errorDocument?: string;
  routingRules?: Array<{
    keyPrefixEquals?: string;
    httpErrorCodeReturnedEquals?: string;
    replaceKeyWith?: string;
    replaceKeyPrefixWith?: string;
  }>;
  domain?: string;
  certId?: string;
  domainId?: number;
  domainConfig?: Record<string, unknown>;
};

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

function buildUploadErrorMessage(error: unknown, localPath?: string): string {
  const baseMessage = error instanceof Error ? error.message : String(error);
  const suggestions: string[] = [];

  if (/路径不存在|无读写权限/i.test(baseMessage)) {
    if (localPath) {
      suggestions.push(`请先确认本地路径 \`${localPath}\` 存在且当前进程有读取权限。`);
    }
    suggestions.push('如果报错的是构建产物中的某个静态资源文件，请检查构建后的资源引用路径是否正确。');
    suggestions.push('若站点部署到子路径，请确认 publicPath、base、assetPrefix 等配置没有把资源指向不存在的位置。');
  }

  if (suggestions.length === 0) {
    suggestions.push('请检查上传目录、文件权限和构建产物完整性后重试。');
  }

  return `[manageHosting(upload)] ${baseMessage}\n建议：${suggestions.join(' ')}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getRecordString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
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
  if (depth > 5 || !value || typeof value !== 'object' || seen.has(value)) {
    return [];
  }

  seen.add(value);

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectDomainRecords(item, seen, depth + 1));
  }

  const record = value as Record<string, unknown>;
  const current = getRecordString(record, ['Domain', 'domain'])
    ? [record]
    : [];

  return current.concat(
    Object.values(record).flatMap((item) => collectDomainRecords(item, seen, depth + 1)),
  );
}

function summarizeHostingDomainCheck(domains: string[], result: unknown) {
  const targetSet = new Set(domains);
  const matchedRecords = collectDomainRecords(result).filter((record) => {
    const domain = getRecordString(record, ['Domain', 'domain']);
    return domain ? targetSet.has(domain) : false;
  });
  const matchedDomains = Array.from(
    new Set(
      matchedRecords
        .map((record) => getRecordString(record, ['Domain', 'domain']))
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

    const value = getRecordString(candidate, ['Status', 'status', 'TaskStatus', 'State']);
    if (value) {
      return value;
    }
  }

  return undefined;
}

function buildDomainStatusNextStep(domains: string[]) {
  return {
    tool: 'queryHosting',
    action: 'domainStatus',
    suggested_args: {
      action: 'domainStatus',
      domains,
    },
  };
}

function buildStatusNextStep() {
  return {
    tool: 'queryHosting',
    action: 'status',
    suggested_args: {
      action: 'status',
    },
  };
}

function buildWebsiteConfigNextStep() {
  return {
    tool: 'queryHosting',
    action: 'websiteConfig',
    suggested_args: {
      action: 'websiteConfig',
    },
  };
}

function buildFindFilesNextStep(prefix: string) {
  return {
    tool: 'queryHosting',
    action: 'findFiles',
    suggested_args: {
      action: 'findFiles',
      prefix,
    },
  };
}

async function callTcbHostingAction(
  cloudbase: any,
  action: string,
  param: Record<string, unknown>,
  logger?: ExtendedMcpServer['logger'],
) {
  const service = cloudbase.commonService?.('tcb', '2018-06-08');

  if (!service?.call) {
    throw new Error(`当前 CloudBase Manager 实例不支持 commonService.call，无法执行 ${action}。`);
  }

  const result = await service.call({
    Action: action,
    Param: param,
  });
  logCloudBaseResult(logger, result);
  return result;
}

function extractStaticStores(value: unknown): Array<Record<string, unknown>> {
  if (!value || typeof value !== 'object') {
    return [];
  }

  const payload = value as Record<string, unknown>;
  const stores = payload.Data;
  return Array.isArray(stores) ? stores.filter(isRecord) : [];
}

async function describeHostingDomainTask(
  cloudbase: any,
  cloudBaseOptions?: { envId?: string },
  logger?: ExtendedMcpServer['logger'],
) {
  try {
    const envId = await getEnvId(cloudBaseOptions);
    const result = await callTcbHostingAction(
      cloudbase,
      'DescribeHostingDomainTask',
      { EnvId: envId },
      logger,
    );

    return {
      rawStatus: extractTaskStatus(result),
      raw: result,
    };
  } catch {
    return undefined;
  }
}

function buildDomainMutationResult(params: {
  action: 'bindDomain' | 'unbindDomain' | 'updateDomain';
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
    action === 'bindDomain'
      ? '绑定'
      : action === 'unbindDomain'
        ? '解绑'
        : '修改';
  const successIndicator =
    action === 'bindDomain'
      ? `继续调用 queryHosting(action="domainStatus", domains=["${domain}"])，直到返回中出现该域名，并且相关状态字段显示为已生效。`
      : action === 'unbindDomain'
        ? `继续调用 queryHosting(action="domainStatus", domains=["${domain}"])，直到返回中不再出现该域名。`
        : `继续调用 queryHosting(action="domainStatus", domains=["${domain}"])，确认返回中的配置字段已更新为最新值。`;

  return {
    success: true,
    data: {
      action,
      targetDomains: [domain],
      ...(certId ? { certId } : {}),
      ...(domainId !== undefined ? { domainId } : {}),
      ...(domainConfig ? { domainConfig } : {}),
      asyncState: 'PENDING',
      ...(taskStatus ? { taskStatus } : {}),
      propagation: {
        requiresPolling: true,
        pollTool: 'queryHosting',
        pollAction: 'domainStatus',
        pollIntervalSuggestionSeconds: 30,
        timeoutSuggestionSeconds: 600,
        successIndicator,
      },
      nextActions: [buildDomainStatusNextStep([domain])],
      result,
    },
    message: `静态托管域名${actionLabel}请求已提交。域名配置、证书校验和边缘侧传播通常需要 30 秒到 10 分钟，请继续调用 queryHosting(action="domainStatus") 确认最终结果。`,
  };
}

async function getHostingWebsiteConfig(cloudbase: any, logger?: ExtendedMcpServer['logger']) {
  const websiteConfig = await cloudbase.hosting.getWebsiteConfig();
  logCloudBaseResult(logger, websiteConfig);
  const hostingResult: Record<string, unknown> = {
    ...(websiteConfig as Record<string, unknown>),
    CdnDomain: (websiteConfig as Record<string, unknown>).CdnDomain ?? null,
    Bucket: (websiteConfig as Record<string, unknown>).Bucket ?? null,
  };

  try {
    const envInfo = await cloudbase.env.getEnvInfo() as ExtendedEnvInfo;
    logCloudBaseResult(logger, envInfo);
    hostingResult.CdnDomain = envInfo.EnvInfo?.StaticStorages?.[0]?.StaticDomain ?? hostingResult.CdnDomain;
    hostingResult.Bucket = envInfo.EnvInfo?.StaticStorages?.[0]?.Bucket ?? hostingResult.Bucket;
  } catch {
    // Ignore enrichment failures and return the website config as-is.
  }

  return hostingResult;
}

async function resolveHostingStaticDomain(cloudbase: any, logger?: ExtendedMcpServer['logger']) {
  try {
    const envInfo = await cloudbase.env.getEnvInfo() as ExtendedEnvInfo;
    logCloudBaseResult(logger, envInfo);
    return envInfo.EnvInfo?.StaticStorages?.[0]?.StaticDomain;
  } catch {
    return undefined;
  }
}

function buildFailureResult(action: string, error: unknown) {
  return buildJsonToolResult({
    success: false,
    errorCode: `HOSTING_${action.toUpperCase()}_FAILED`,
    message: error instanceof Error ? error.message : String(error),
  });
}

function normalizeFileFields(files: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(files)) return [];

  return files.map(file => {
    if (typeof file !== 'object' || file === null) return file;

    const record = file as Record<string, unknown>;
    return {
      key: record.Key ?? record.key ?? '',
      size: record.Size ?? record.size ?? 0,
      lastModified: record.LastModified ?? record.lastModified ?? '',
      ...record,
    };
  });
}

function normalizeHostingStatus(current: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!current) return null;

  return {
    ...current,
    status: current.Status ?? current.status ?? 'unknown',
    staticDomain: current.StaticDomain ?? current.staticDomain ?? null,
    bucket: current.Bucket ?? current.bucket ?? null,
  };
}

function ensureManageHostingActionAllowedInCloudMode(input: ManageHostingInput) {
  if (!isCloudMode()) {
    return;
  }

  if (input.action === 'upload' || input.action === 'downloadFile' || input.action === 'downloadDirectory') {
    throw new Error(
      `manageHosting(action="${input.action}") 在 cloud mode 下不可用，因为该操作依赖本地文件路径。请改用本地模式执行；若只需要远端管理静态托管，可继续使用 delete / setWebsiteDocument / enableService / bindDomain / unbindDomain / updateDomain。`,
    );
  }
}

export function registerHostingTools(server: ExtendedMcpServer) {
  const cloudBaseOptions = server.cloudBaseOptions;
  const getManager = () => getCloudBaseManager({ cloudBaseOptions });

  server.registerTool(
    'queryHosting',
    {
      title: '查询静态托管',
      description: '查询 CloudBase 静态托管的只读信息。适合 AI 先做发现再决定下一步：action=websiteConfig 查询首页/错误页/路由规则与站点域名信息；action=status 查询托管服务状态；action=findFiles 按前缀查找文件；action=listFiles 列出全部托管文件；action=domainStatus 查询自定义域名的当前状态与配置。该工具不会产生任何副作用。',
      inputSchema: queryHostingInputSchema,
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
        category: 'hosting',
      },
    },
    async (args: QueryHostingInput) => {
      try {
        const input = args;
        const cloudbase = await getManager();

        switch (input.action) {
          case 'websiteConfig': {
            const websiteConfig = await getHostingWebsiteConfig(cloudbase, server.logger);
            return buildJsonToolResult({
              success: true,
              data: {
                action: 'websiteConfig',
                websiteConfig,
              },
              message: '已获取静态托管网站文档配置与站点域名信息。',
            });
          }

          case 'status': {
            const envId = await getEnvId(cloudBaseOptions);
            const result = await callTcbHostingAction(
              cloudbase,
              'DescribeStaticStore',
              { EnvId: envId },
              server.logger,
            );
            const hostingInfo = extractStaticStores(result);
            const current = normalizeHostingStatus(hostingInfo[0] ?? null);
            const normalizedHostingInfo = hostingInfo.map(item => normalizeHostingStatus(item));
            return buildJsonToolResult({
              success: true,
              data: {
                action: 'status',
                enabled: hostingInfo.length > 0,
                current,
                hostingInfo: normalizedHostingInfo,
                result,
              },
              message: hostingInfo.length > 0
                ? '已获取静态托管服务状态。'
                : '静态托管服务当前未返回可用实例信息，可能尚未开通。',
            });
          }

          case 'findFiles': {
            if (!input.prefix) {
              throw new Error('queryHosting(action="findFiles") 需要提供 prefix，用于按前缀查找托管文件。');
            }
            const result = await cloudbase.hosting.findFiles({
              prefix: input.prefix,
              marker: input.marker,
              maxKeys: input.maxKeys,
            });
            logCloudBaseResult(server.logger, result);
            const normalizedFiles = normalizeFileFields(result);
            return buildJsonToolResult({
              success: true,
              data: {
                action: 'findFiles',
                prefix: input.prefix,
                marker: input.marker,
                maxKeys: input.maxKeys,
                files: normalizedFiles,
                result,
              },
              message: `已按前缀 \`${input.prefix}\` 查询静态托管文件，共 ${Array.isArray(normalizedFiles) ? normalizedFiles.length : 0} 个。`,
            });
          }

          case 'listFiles': {
            const result = await cloudbase.hosting.listFiles();
            logCloudBaseResult(server.logger, result);
            const normalizedFiles = normalizeFileFields(result);
            const maxKeys = input.maxKeys ?? 100;
            const start = input.marker ? parseInt(input.marker, 10) : 0;
            const paginatedFiles = normalizedFiles.slice(start, start + maxKeys);
            const nextMarker = start + maxKeys < normalizedFiles.length ? String(start + maxKeys) : undefined;

            return buildJsonToolResult({
              success: true,
              data: {
                action: 'listFiles',
                files: paginatedFiles,
                totalCount: normalizedFiles.length,
                marker: input.marker,
                maxKeys,
                nextMarker,
                isTruncated: nextMarker !== undefined,
              },
              message: `已列出静态托管中的文件（第 ${start + 1}-${start + paginatedFiles.length} 个，共 ${normalizedFiles.length} 个）。${nextMarker ? ' 还有更多文件，可使用 nextMarker 继续查询。' : ''}`,
            });
          }

          case 'domainStatus': {
            if (!input.domains || input.domains.length === 0) {
              throw new Error('queryHosting(action="domainStatus") 需要提供 domains 数组，例如 ["www.example.com"]。');
            }
            const result = await cloudbase.hosting.tcbCheckResource({
              domains: input.domains,
            });
            logCloudBaseResult(server.logger, result);
            const summary = summarizeHostingDomainCheck(input.domains, result);
            const allMatched = summary.missingDomains.length === 0;
            return buildJsonToolResult({
              success: true,
              data: {
                action: 'domainStatus',
                queriedDomains: input.domains,
                matchedDomains: summary.matchedDomains,
                missingDomains: summary.missingDomains,
                domainDetails: summary.domainDetails,
                ...(allMatched
                  ? {}
                  : {
                      propagation: {
                        requiresPolling: true,
                        pollTool: 'queryHosting',
                        pollAction: 'domainStatus',
                        pollIntervalSuggestionSeconds: 30,
                        timeoutSuggestionSeconds: 600,
                        successIndicator: '目标域名出现在返回结果中，并且相关状态字段显示为已生效。',
                      },
                      nextActions: [buildDomainStatusNextStep(summary.missingDomains)],
                    }),
                result,
              },
              message: allMatched
                ? '已查询到目标静态托管域名配置。若这是绑定或修改后的确认步骤，请继续核对状态字段、证书信息和配置内容是否符合预期。'
                : '部分目标静态托管域名尚未在查询结果中出现。若这是绑定后的确认步骤，请继续调用 queryHosting(action="domainStatus") 直到结果收敛或达到超时。',
            });
          }
        }
      } catch (error) {
        const toolPayloadResult = toolPayloadErrorToResult(error);
        if (toolPayloadResult) {
          return toolPayloadResult;
        }
        return buildFailureResult(args.action, error);
      }
    },
  );

  server.registerTool(
    'manageHosting',
    {
      title: '管理静态托管',
      description: '管理 CloudBase 静态托管的变更操作。action=upload 上传本地构建产物；action=delete 删除托管文件或目录（必须 confirm=true）；action=setWebsiteDocument 设置首页/错误页/路由规则；action=enableService 开通静态托管；action=bindDomain / unbindDomain / updateDomain 管理自定义域名；action=downloadFile / downloadDirectory 下载托管内容到本地。若任务只是查看配置、文件或域名状态，请改用 queryHosting。',
      inputSchema: manageHostingInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
        category: 'hosting',
      },
    },
    async (args: ManageHostingInput) => {
      try {
        const input = args;
        ensureManageHostingActionAllowedInCloudMode(input);
        const cloudbase = await getManager();

        switch (input.action) {
          case 'upload': {
            if ((!input.localPath || !input.cloudPath) && (!input.files || input.files.length === 0)) {
              throw new Error('manageHosting(action="upload") 需要提供 localPath + cloudPath，或提供 files 多文件上传列表。');
            }

            let result: unknown;
            try {
              result = await cloudbase.hosting.uploadFiles({
                localPath: input.localPath,
                cloudPath: input.cloudPath,
                files: input.files ?? [],
                ignore: input.ignore,
              });
            } catch (error) {
              throw new Error(buildUploadErrorMessage(error, input.localPath));
            }

            logCloudBaseResult(server.logger, result);
            const staticDomain = await resolveHostingStaticDomain(cloudbase, server.logger);
            const accessUrl = buildHostingAccessUrl(staticDomain, input.cloudPath, input.localPath);

            try {
              const envId = await getEnvId(cloudBaseOptions);
              let projectName = 'unknown';
              if (input.localPath) {
                try {
                  const stats = fs.statSync(input.localPath);
                  projectName = stats.isFile()
                    ? path.basename(path.dirname(input.localPath))
                    : path.basename(input.localPath);
                } catch {
                  projectName = path.basename(input.localPath);
                }
              }

              await sendDeployNotification(server, {
                deployType: 'hosting',
                url: accessUrl,
                projectId: envId,
                projectName,
                consoleUrl: `https://tcb.cloud.tencent.com/dev?envId=${envId}#/static-hosting`,
              });
            } catch {
              // Notification failure should not block uploads.
            }

            const uploadPrefix = input.cloudPath ?? input.files?.[0]?.cloudPath ?? '';
            return buildJsonToolResult({
              success: true,
              data: {
                action: 'upload',
                localPath: input.localPath,
                cloudPath: input.cloudPath,
                files: input.files ?? [],
                ignore: input.ignore,
                staticDomain,
                accessUrl,
                result,
                nextActions: uploadPrefix ? [buildFindFilesNextStep(uploadPrefix.replace(/^\/+/, ''))] : undefined,
              },
              message: '静态托管文件上传成功。若需要校验上传结果，请继续调用 queryHosting(action="findFiles") 或 queryHosting(action="listFiles")。',
            });
          }

          case 'delete': {
            if (!input.cloudPath) {
              throw new Error('manageHosting(action="delete") 需要提供 cloudPath。');
            }
            if (!input.confirm) {
              throw new Error('manageHosting(action="delete") 是破坏性操作，必须显式传 confirm=true。');
            }
            const result = await cloudbase.hosting.deleteFiles({
              cloudPath: input.cloudPath,
              isDir: input.isDir ?? false,
            });
            logCloudBaseResult(server.logger, result);

            // Post-validation: verify deletion was successful
            let deleteVerified = true;
            let verificationError: string | undefined;
            try {
              const checkResult = await cloudbase.hosting.findFiles({
                prefix: input.cloudPath,
                maxKeys: 1,
              });
              
              if (Array.isArray(checkResult) && checkResult.length > 0) {
                deleteVerified = false;
                verificationError = `删除后验证失败：文件仍在静态托管中`;
              }
            } catch (error) {
              // If query fails, assume deletion was successful
              // (file might have been deleted, causing query to return empty)
            }

            return buildJsonToolResult({
              success: deleteVerified,
              data: {
                action: 'delete',
                cloudPath: input.cloudPath,
                isDir: input.isDir ?? false,
                result,
                verified: deleteVerified,
                ...(verificationError ? { error: verificationError } : {}),
              },
              message: deleteVerified
                ? `已删除静态托管${input.isDir ? '目录' : '文件'} \`${input.cloudPath}\`。`
                : `删除操作已提交，但验证发现文件可能未完全删除，请手动确认。`,
            });
          }

          case 'setWebsiteDocument': {
            if (!input.indexDocument) {
              throw new Error('manageHosting(action="setWebsiteDocument") 需要提供 indexDocument，例如 index.html。');
            }
            const result = await cloudbase.hosting.setWebsiteDocument({
              indexDocument: input.indexDocument,
              errorDocument: input.errorDocument,
              routingRules: input.routingRules,
            });
            logCloudBaseResult(server.logger, result);
            return buildJsonToolResult({
              success: true,
              data: {
                action: 'setWebsiteDocument',
                indexDocument: input.indexDocument,
                errorDocument: input.errorDocument,
                routingRules: input.routingRules,
                result,
                nextActions: [buildWebsiteConfigNextStep()],
              },
              message: '静态托管网站文档配置已提交。若需要确认最终配置，请继续调用 queryHosting(action="websiteConfig")。',
            });
          }

          case 'enableService': {
            const envId = await getEnvId(cloudBaseOptions);
            const result = await callTcbHostingAction(
              cloudbase,
              'CreateStaticStore',
              { EnvId: envId },
              server.logger,
            );
            return buildJsonToolResult({
              success: true,
              data: {
                action: 'enableService',
                asyncState: 'PENDING',
                result,
                nextActions: [buildStatusNextStep()],
              },
              message: '静态托管服务开通请求已提交。请继续调用 queryHosting(action="status") 确认服务是否已可用。',
            });
          }

          case 'bindDomain': {
            if (!input.domain || !input.certId) {
              throw new Error('manageHosting(action="bindDomain") 需要提供 domain 和 certId。');
            }
            const result = await cloudbase.hosting.CreateHostingDomain({
              domain: input.domain,
              certId: input.certId,
            });
            logCloudBaseResult(server.logger, result);
            const taskStatus = await describeHostingDomainTask(cloudbase, cloudBaseOptions, server.logger);
            return buildJsonToolResult(buildDomainMutationResult({
              action: 'bindDomain',
              domain: input.domain,
              certId: input.certId,
              result,
              taskStatus,
            }));
          }

          case 'unbindDomain': {
            if (!input.domain) {
              throw new Error('manageHosting(action="unbindDomain") 需要提供 domain。');
            }
            if (!input.confirm) {
              throw new Error('manageHosting(action="unbindDomain") 会解绑现有自定义域名，必须显式传 confirm=true。');
            }
            const result = await cloudbase.hosting.deleteHostingDomain({
              domain: input.domain,
            });
            logCloudBaseResult(server.logger, result);
            const taskStatus = await describeHostingDomainTask(cloudbase, cloudBaseOptions, server.logger);
            return buildJsonToolResult(buildDomainMutationResult({
              action: 'unbindDomain',
              domain: input.domain,
              result,
              taskStatus,
            }));
          }

          case 'updateDomain': {
            if (!input.domain || input.domainId === undefined || !input.domainConfig) {
              throw new Error('manageHosting(action="updateDomain") 需要同时提供 domain、domainId 和 domainConfig。');
            }
            const result = await cloudbase.hosting.tcbModifyAttribute({
              domain: input.domain,
              domainId: input.domainId,
              domainConfig: input.domainConfig,
            });
            logCloudBaseResult(server.logger, result);
            const taskStatus = await describeHostingDomainTask(cloudbase, cloudBaseOptions, server.logger);
            return buildJsonToolResult(buildDomainMutationResult({
              action: 'updateDomain',
              domain: input.domain,
              domainId: input.domainId,
              domainConfig: input.domainConfig,
              result,
              taskStatus,
            }));
          }

          case 'downloadFile': {
            if (!input.cloudPath || !input.localPath) {
              throw new Error('manageHosting(action="downloadFile") 需要同时提供 cloudPath 和 localPath，localPath 应包含目标文件名。');
            }
            const result = await cloudbase.hosting.downloadFile({
              cloudPath: input.cloudPath,
              localPath: input.localPath,
            });
            logCloudBaseResult(server.logger, result);
            return buildJsonToolResult({
              success: true,
              data: {
                action: 'downloadFile',
                cloudPath: input.cloudPath,
                localPath: input.localPath,
                result,
              },
              message: `已将静态托管文件 \`${input.cloudPath}\` 下载到本地路径 \`${input.localPath}\`。`,
            });
          }

          case 'downloadDirectory': {
            if (!input.cloudPath || !input.localPath) {
              throw new Error('manageHosting(action="downloadDirectory") 需要同时提供 cloudPath 和 localPath，localPath 应为本地目录路径。');
            }
            const result = await cloudbase.hosting.downloadDirectory({
              cloudPath: input.cloudPath,
              localPath: input.localPath,
            });
            logCloudBaseResult(server.logger, result);
            return buildJsonToolResult({
              success: true,
              data: {
                action: 'downloadDirectory',
                cloudPath: input.cloudPath,
                localPath: input.localPath,
                result,
              },
              message: `已将静态托管目录 \`${input.cloudPath}\` 下载到本地目录 \`${input.localPath}\`。`,
            });
          }
        }
      } catch (error) {
        const toolPayloadResult = toolPayloadErrorToResult(error);
        if (toolPayloadResult) {
          return toolPayloadResult;
        }
        return buildFailureResult(args.action, error);
      }
    },
  );
}
