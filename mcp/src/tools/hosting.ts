import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { getCloudBaseManager, getEnvId, logCloudBaseResult } from '../cloudbase-manager.js';
import { ExtendedMcpServer } from '../server.js';
import { t } from '../i18n/index.js';
import { isCloudMode } from '../utils/cloud-mode.js';
import {
  flattenHttpServiceRoutes,
  isDomainPathReachableViaGateway,
  preferGatewayOrFallback,
  resolveAllGatewayRoutes,
  resolveGatewayAccessUrls,
  type GatewayRouteUrlCandidate,
} from '../utils/gateway-access-urls.js';
import { sendDeployNotification } from '../utils/notification.js';
import { getConsoleDevUrl } from '../utils/site-map.js';
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

const HOSTING_CDN_SWITCH_VALUES = ['on', 'off'] as const;
const HOSTING_REFERER_TYPES = ['blacklist', 'whitelist'] as const;
const HOSTING_CACHE_RULE_TYPES = ['fileType', 'path'] as const;
const HOSTING_IP_FILTER_TYPES = ['blacklist', 'whitelist'] as const;

const routingRuleSchema = z.object({
  keyPrefixEquals: z.string().optional().describe('匹配前缀规则，例如 app/ 或 assets/。与 httpErrorCodeReturnedEquals 二选一或按 CloudBase 规则组合使用。'),
  httpErrorCodeReturnedEquals: z.string().optional().describe('匹配 HTTP 错误码，例如 404。SPA 回退常用 404。'),
  replaceKeyWith: z.string().optional().describe('把匹配结果替换为固定文件路径，例如 index.html。'),
  replaceKeyPrefixWith: z.string().optional().describe('把匹配前缀替换成新的前缀路径。'),
});

const domainConfigSchema = z.object({
  Refer: z.object({
    Switch: z.enum(HOSTING_CDN_SWITCH_VALUES).describe('Referer 防盗链开关：on=开启，off=关闭。'),
    RefererRules: z.array(z.object({
      RefererType: z.enum(HOSTING_REFERER_TYPES).describe('Referer 规则类型：blacklist=黑名单，whitelist=白名单。'),
      Referers: z.array(z.string()).describe('Referer 规则值列表。'),
      AllowEmpty: z.boolean().describe('是否允许空 Referer。'),
    })).optional().describe('Referer 规则列表。'),
  }).optional().describe('Referer 防盗链配置。'),
  Cache: z.array(z.object({
    RuleType: z.enum(HOSTING_CACHE_RULE_TYPES).describe('缓存规则类型：fileType=文件类型，path=路径。'),
    RuleValue: z.string().describe('规则匹配值。'),
    CacheTtl: z.number().describe('缓存 TTL，单位秒。'),
  })).optional().describe('CDN 缓存规则列表。'),
  IpFilter: z.object({
    Switch: z.enum(HOSTING_CDN_SWITCH_VALUES).describe('IP 访问控制开关：on=开启，off=关闭。'),
    FilterType: z.enum(HOSTING_IP_FILTER_TYPES).optional().describe('过滤类型：blacklist=黑名单，whitelist=白名单。'),
    Filters: z.array(z.string()).optional().describe('IP 规则列表。'),
  }).optional().describe('IP 访问控制配置。'),
  IpFreqLimit: z.object({
    Switch: z.enum(HOSTING_CDN_SWITCH_VALUES).describe('IP 频控开关：on=开启，off=关闭。'),
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

function hostingAccessPathname(cloudPath?: string, localPath?: string): string {
  const normalizedCloudPath = (cloudPath ?? '').trim().replace(/^\/+|\/+$/g, '');
  const isDirectory = isDirectoryUploadTarget(localPath, cloudPath);

  if (!normalizedCloudPath) {
    return '/';
  }

  const pathname = isDirectory ? `${normalizedCloudPath}/` : normalizedCloudPath;
  return `/${pathname}`;
}

function buildHostingAccessUrl(staticDomain?: string, cloudPath?: string, localPath?: string): string {
  if (!staticDomain) return '';
  return `https://${staticDomain}${hostingAccessPathname(cloudPath, localPath)}`;
}

function buildUploadErrorMessage(error: unknown, localPath?: string): string {
  const baseMessage = error instanceof Error ? error.message : String(error);
  const suggestions: string[] = [];

  if (/路径不存在|无读写权限/i.test(baseMessage)) {
    if (localPath) {
      suggestions.push(t('hosting.uploadErrorPathSuggestion', { localPath }));
    }
    suggestions.push(t('hosting.uploadErrorAssetSuggestion'));
    suggestions.push(t('hosting.uploadErrorPublicPathSuggestion'));
  }

  if (suggestions.length === 0) {
    suggestions.push(t('hosting.uploadErrorDefaultSuggestion'));
  }

  return t('hosting.uploadErrorWrapper', {
    message: baseMessage,
    suggestions: suggestions.join(' '),
  });
}

/**
 * TCB 管控面 DescribeStaticStore 接口 QPS 限流（20 次/秒）。
 * Manager SDK 的 hosting.deleteFiles / uploadFiles / findFiles 等每次调用
 * 都会先 checkStatus() → getInfo() → DescribeStaticStore（无缓存），
 * AI 连续快速删除多个文件或失败后立即重试时极易触发该限流。
 */
const DESCRIBE_STATIC_STORE_RATE_LIMIT_RE =
  /\[DescribeStaticStore\][\s\S]*exceeds the frequency limit `20` for a second/i;

function buildDeleteErrorMessage(error: unknown): string {
  const baseMessage = error instanceof Error ? error.message : String(error);

  if (DESCRIBE_STATIC_STORE_RATE_LIMIT_RE.test(baseMessage)) {
    return t('hosting.deleteRateLimitGuidance', { message: baseMessage });
  }

  return t('hosting.deleteErrorWrapper', { message: baseMessage });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Manager SDK hosting.deleteFiles 对 COS 删除失败不抛异常，返回
 * { Deleted: [], Error: [e] }；此处提取 Error 数组为可读字符串列表，
 * 供 delete 路径做失败判定与引导。
 */
function extractDeleteErrors(result: unknown): string[] {
  if (!isRecord(result)) {
    return [];
  }

  const rawErrors = result.Error ?? result.error;
  if (!Array.isArray(rawErrors)) {
    return [];
  }

  return rawErrors
    .map((item) => {
      if (typeof item === 'string' && item.trim()) {
        return item.trim();
      }
      if (isRecord(item) && typeof item.message === 'string') {
        return item.message;
      }
      return JSON.stringify(item);
    })
    .filter(Boolean);
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
    throw new Error(t('hosting.commonServiceUnsupported', { action }));
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
      ? t('hosting.domainActionBind')
      : action === 'unbindDomain'
        ? t('hosting.domainActionUnbind')
        : t('hosting.domainActionUpdate');
  const successIndicator =
    action === 'bindDomain'
      ? t('hosting.domainSuccessIndicatorBind', { domain })
      : action === 'unbindDomain'
        ? t('hosting.domainSuccessIndicatorUnbind', { domain })
        : t('hosting.domainSuccessIndicatorUpdate', { domain });

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
    message: t('hosting.domainMutationSubmitted', { actionLabel }),
  };
}

async function getHostingWebsiteConfig(
  cloudbase: any,
  logger?: ExtendedMcpServer['logger'],
  cloudBaseOptions?: { envId?: string },
) {
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

  try {
    const cdnDomain =
      typeof hostingResult.CdnDomain === 'string' ? hostingResult.CdnDomain : '';
    if (cdnDomain && typeof cloudbase.env?.describeHttpServiceRoute === 'function') {
      const envId = await getEnvId(cloudBaseOptions);
      const routeResult = await cloudbase.env.describeHttpServiceRoute({
        EnvId: envId,
        Limit: 1000,
      });
      const routes = flattenHttpServiceRoutes(routeResult);
      const reachable = isDomainPathReachableViaGateway(routes, cdnDomain, '/');
      hostingResult.staticDomainRouteEnabled = reachable;
      hostingResult.accessUrlReachable = reachable !== false;
      if (reachable === false) {
        hostingResult.routeDisabled = true;
        hostingResult.disabledAccessUrls = [`https://${cdnDomain}/`];
      }
    }
  } catch {
    // Gateway route lookup is best-effort enrichment only.
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

// Returns the first hosting store record from DescribeStaticStore, which is
// the authoritative source for Mini Program-sourced environments (those envs
// do not populate StaticStorages in DescribeEnvs / getEnvInfo).
// Throws when no valid store is found so upload can fail fast with a clear msg.
async function getHostingStoreOrThrow(
  cloudbase: any,
  cloudBaseOptions?: { envId?: string },
  logger?: ExtendedMcpServer['logger'],
): Promise<Record<string, unknown>> {
  const envId = await getEnvId(cloudBaseOptions);
  const result = await callTcbHostingAction(cloudbase, 'DescribeStaticStore', { EnvId: envId }, logger);
  const hostingInfo = extractStaticStores(result);

  if (hostingInfo.length > 0 && hostingInfo[0].Bucket) {
    return hostingInfo[0];
  }

  throw new Error(t('hosting.hostingStoreMissing', { envId }));
}

function enrichRateLimitMessage(message: string): string {
  // delete 路径已由 buildDeleteErrorMessage 提供完整引导，避免重复追加。
  // 中英文引导文本特征均参与判断（zh: "QPS 限制"/"等待 1-2 秒后重试"；en: "QPS limit"/"wait 1-2 seconds"）
  if (
    message.includes('QPS 限制') ||
    message.includes('等待 1-2 秒后重试') ||
    message.includes('QPS limit') ||
    message.includes('wait 1-2 seconds')
  ) {
    return message;
  }
  if (DESCRIBE_STATIC_STORE_RATE_LIMIT_RE.test(message)) {
    return t('hosting.queryRateLimitGuidance', { message });
  }
  return message;
}

function buildFailureResult(action: string, error: unknown) {
  return buildJsonToolResult({
    success: false,
    errorCode: `HOSTING_${action.toUpperCase()}_FAILED`,
    message: enrichRateLimitMessage(error instanceof Error ? error.message : String(error)),
  });
}

function extractFileList(files: unknown): unknown[] {
  // hosting.listFiles 直接返回文件数组
  if (Array.isArray(files)) return files;

  // hosting.findFiles 返回 COS 风格对象，文件列表在 Contents 里
  if (typeof files === 'object' && files !== null) {
    const record = files as Record<string, unknown>;
    if (Array.isArray(record.Contents)) return record.Contents;
    if (Array.isArray(record.contents)) return record.contents;
  }

  return [];
}

function extractFilePagination(result: unknown): { isTruncated?: boolean; nextMarker?: string } {
  if (typeof result !== 'object' || result === null) return {};

  const record = result as Record<string, unknown>;
  const isTruncated = record.IsTruncated ?? record.isTruncated;
  const nextMarker = record.NextMarker ?? record.nextMarker;

  return {
    isTruncated: typeof isTruncated === 'boolean' ? isTruncated : undefined,
    nextMarker: typeof nextMarker === 'string' && nextMarker.length > 0 ? nextMarker : undefined,
  };
}

function normalizeFileFields(files: unknown): Array<Record<string, unknown>> {
  return extractFileList(files).map((file): Record<string, unknown> => {
    if (typeof file !== 'object' || file === null) return file as Record<string, unknown>;

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
    throw new Error(t('hosting.cloudModeLocalActionUnavailable', { action: input.action }));
  }
}

export function registerHostingTools(server: ExtendedMcpServer) {
  const cloudBaseOptions = server.cloudBaseOptions;
  const getManager = () => getCloudBaseManager({ cloudBaseOptions });

  server.registerTool(
    'queryHosting',
    {
      title: 'hosting.queryTitle',
      description: 'hosting.queryDescription',
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
            const websiteConfig = await getHostingWebsiteConfig(
              cloudbase,
              server.logger,
              cloudBaseOptions,
            );
            return buildJsonToolResult({
              success: true,
              data: {
                action: 'websiteConfig',
                websiteConfig,
              },
              message: t('hosting.websiteConfigSuccess'),
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
                ? t('hosting.statusEnabled')
                : t('hosting.statusNotEnabled'),
            });
          }

          case 'findFiles': {
            if (!input.prefix) {
              throw new Error(t('hosting.findFilesPrefixRequired'));
            }
            const result = await cloudbase.hosting.findFiles({
              prefix: input.prefix,
              marker: input.marker,
              maxKeys: input.maxKeys,
            });
            logCloudBaseResult(server.logger, result);
            const normalizedFiles = normalizeFileFields(result);
            // findFiles 的 marker 是 COS 游标字符串，与 listFiles 的数字 offset 语义不同，此处只透传不做解析
            const { isTruncated, nextMarker } = extractFilePagination(result);
            return buildJsonToolResult({
              success: true,
              data: {
                action: 'findFiles',
                prefix: input.prefix,
                marker: input.marker,
                maxKeys: input.maxKeys,
                files: normalizedFiles,
                nextMarker,
                isTruncated,
                result,
              },
              message: t('hosting.findFilesSuccess', {
                prefix: input.prefix,
                count: normalizedFiles.length,
                more: nextMarker ? t('hosting.findFilesMore') : '',
              }),
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
              message: t('hosting.listFilesSuccess', {
                start: start + 1,
                end: start + paginatedFiles.length,
                count: normalizedFiles.length,
                more: nextMarker ? t('hosting.findFilesMore') : '',
              }),
            });
          }

          case 'domainStatus': {
            if (!input.domains || input.domains.length === 0) {
              throw new Error(t('hosting.domainStatusDomainsRequired'));
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
                        successIndicator: t('hosting.domainStatusSuccessIndicator'),
                      },
                      nextActions: [buildDomainStatusNextStep(summary.missingDomains)],
                    }),
                result,
              },
              message: allMatched
                ? t('hosting.domainStatusAllMatched')
                : t('hosting.domainStatusPending'),
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
      title: 'hosting.manageTitle',
      description: 'hosting.manageDescription',
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
              throw new Error(t('hosting.uploadArgsRequired'));
            }

            let result: unknown;
            let store: Record<string, unknown>;
            try {
              store = await getHostingStoreOrThrow(cloudbase, cloudBaseOptions, server.logger);
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
            // Prefer CdnDomain from the DescribeStaticStore result we already
            // fetched; fall back to getEnvInfo for environments that populate
            // StaticDomain there but not in DescribeStaticStore.
            const cdnFromStore = (store.CdnDomain ?? store.StaticDomain) as string | undefined;
            const staticDomain = cdnFromStore || await resolveHostingStaticDomain(cloudbase, server.logger);
            const fallbackAccessUrl = buildHostingAccessUrl(staticDomain, input.cloudPath, input.localPath);
            const accessPathname = hostingAccessPathname(input.cloudPath, input.localPath);
            const envId = await getEnvId(cloudBaseOptions);
            const getGatewayManager = async () => {
              const manager = await getManager();
              if (!manager) {
                throw new Error(t('hosting.managerUnavailable'));
              }
              return manager as any;
            };
            const allGatewayRoutes: GatewayRouteUrlCandidate[] =
              await resolveAllGatewayRoutes({
                envId,
                getManager: getGatewayManager,
              });
            const staticDomainRouteEnabled =
              staticDomain
                ? isDomainPathReachableViaGateway(
                    allGatewayRoutes,
                    staticDomain,
                    accessPathname,
                  )
                : null;
            // null = no matching gateway route info → keep legacy fallback.
            const fallbackReachable = staticDomainRouteEnabled !== false;
            const gatewayCandidates = Array.from(
              new Set(
                [
                  store.StaticStoreName,
                  store.Name,
                  store.StoreName,
                  store.Bucket,
                  "staticstore",
                ]
                  .map((item) => (typeof item === "string" ? item.trim() : ""))
                  .filter(Boolean),
              ),
            );
            let accessUrl = fallbackReachable ? fallbackAccessUrl : "";
            let accessUrls = accessUrl ? [accessUrl] : [];
            let accessUrlSource: string | undefined = accessUrl
              ? "hosting.staticDomain"
              : undefined;
            let accessUrlReachable = Boolean(accessUrl);
            let disabledAccessUrls: string[] = [];
            if (fallbackAccessUrl && !fallbackReachable) {
              disabledAccessUrls.push(fallbackAccessUrl);
            }

            for (const upstreamName of gatewayCandidates) {
              const gateway = await resolveGatewayAccessUrls({
                envId,
                upstreamResourceName: upstreamName,
                upstreamResourceTypes: ["STATIC_STORE"],
                getManager: getGatewayManager,
              });
              const preferred = preferGatewayOrFallback({
                gateway,
                fallbackUrl: fallbackAccessUrl || undefined,
                fallbackSource: "hosting.staticDomain",
                fallbackReachable,
              });
              if (preferred.accessUrl || preferred.disabledAccessUrls.length > 0) {
                accessUrl = preferred.accessUrl ?? "";
                accessUrls = preferred.accessUrls;
                accessUrlSource = preferred.accessUrlSource;
                accessUrlReachable = preferred.accessUrlReachable;
                disabledAccessUrls = preferred.disabledAccessUrls;
                if (preferred.accessUrl) {
                  break;
                }
              }
            }

            try {
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

              // sendDeployNotification requires a concrete url; skip when no reachable accessUrl
              if (accessUrl) {
                await sendDeployNotification(server, {
                  deployType: 'hosting',
                  url: accessUrl,
                  projectId: envId,
                  projectName,
                  consoleUrl: getConsoleDevUrl(envId, 'static-hosting'),
                });
              }
            } catch {
              // Notification failure should not block uploads.
            }

            const uploadPrefix = input.cloudPath ?? input.files?.[0]?.cloudPath ?? '';
            const routeDisabled = staticDomainRouteEnabled === false;
            let message = t('hosting.uploadSuccess');
            if (routeDisabled && accessUrlReachable) {
              message = t('hosting.uploadRouteDisabledWithFallback');
            } else if (routeDisabled && !accessUrlReachable) {
              message = t('hosting.uploadRouteDisabledNoAccess');
            }

            return buildJsonToolResult({
              success: true,
              data: {
                action: 'upload',
                localPath: input.localPath,
                cloudPath: input.cloudPath,
                files: input.files ?? [],
                ignore: input.ignore,
                staticDomain,
                staticDomainRouteEnabled,
                accessUrl: accessUrl || undefined,
                accessUrls,
                accessUrlSource,
                accessUrlReachable,
                ...(disabledAccessUrls.length > 0
                  ? { disabledAccessUrls }
                  : {}),
                ...(routeDisabled ? { routeDisabled: true } : {}),
                result,
                nextActions: uploadPrefix ? [buildFindFilesNextStep(uploadPrefix.replace(/^\/+/, ''))] : undefined,
              },
              message,
            });
          }

          case 'delete': {
            if (!input.cloudPath) {
              throw new Error(t('hosting.deleteCloudPathRequired'));
            }
            if (!input.confirm) {
              throw new Error(t('hosting.deleteConfirmRequired'));
            }
            let result: unknown;
            try {
              result = await cloudbase.hosting.deleteFiles({
                cloudPath: input.cloudPath,
                isDir: input.isDir ?? false,
              });
            } catch (error) {
              throw new Error(buildDeleteErrorMessage(error));
            }
            logCloudBaseResult(server.logger, result);

            // Manager SDK 的 deleteFiles 对 COS 单文件删除失败不抛异常，
            // 而是返回 { Deleted: [], Error: [e] }，需要显式检查 Error 数组。
            const deleteErrors = extractDeleteErrors(result);

            // Post-validation: verify deletion was successful
            let deleteVerified = true;
            let verificationError: string | undefined;
            if (deleteErrors.length > 0) {
              deleteVerified = false;
              verificationError = t('hosting.deleteVerificationIncomplete', {
                errors: deleteErrors.join('；'),
              });
            }
            try {
              const checkResult = await cloudbase.hosting.findFiles({
                prefix: input.cloudPath,
                maxKeys: 1,
              });
              
              if (Array.isArray(checkResult) && checkResult.length > 0) {
                deleteVerified = false;
                verificationError = verificationError ?? t('hosting.deleteVerifyFailed');
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
                ? t('hosting.deleteSuccess', {
                    type: input.isDir ? t('hosting.typeDirectory') : t('hosting.typeFile'),
                    cloudPath: input.cloudPath,
                  })
                : t('hosting.deleteUnverified', { cloudPath: input.cloudPath }),
            });
          }

          case 'setWebsiteDocument': {
            if (!input.indexDocument) {
              throw new Error(t('hosting.setWebsiteDocumentIndexRequired'));
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
              message: t('hosting.setWebsiteDocumentSuccess'),
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
              message: t('hosting.enableServiceSuccess'),
            });
          }

          case 'bindDomain': {
            if (!input.domain || !input.certId) {
              throw new Error(t('hosting.bindDomainArgsRequired'));
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
              throw new Error(t('hosting.unbindDomainArgsRequired'));
            }
            if (!input.confirm) {
              throw new Error(t('hosting.unbindDomainConfirmRequired'));
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
              throw new Error(t('hosting.updateDomainArgsRequired'));
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
              throw new Error(t('hosting.downloadFileArgsRequired'));
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
              message: t('hosting.downloadFileSuccess', {
                cloudPath: input.cloudPath,
                localPath: input.localPath,
              }),
            });
          }

          case 'downloadDirectory': {
            if (!input.cloudPath || !input.localPath) {
              throw new Error(t('hosting.downloadDirectoryArgsRequired'));
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
              message: t('hosting.downloadDirectorySuccess', {
                cloudPath: input.cloudPath,
                localPath: input.localPath,
              }),
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
