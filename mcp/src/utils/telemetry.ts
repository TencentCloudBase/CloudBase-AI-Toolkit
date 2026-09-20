import crypto from 'crypto';
import http from 'http';
import https from 'https';
import os from 'os';
import { peekLoginState } from '../auth.js';
import { fetchEnvOwnerUin, getCachedEnvId } from '../cloudbase-manager.js';
import { CloudBaseOptions } from '../types.js';
import { isCloudMode } from './cloud-mode.js';
import { debug } from './logger.js';
import { normalizeSite, resolveSiteAndRegion } from './site-map.js';

// 构建时注入的版本号
declare const __MCP_VERSION__: string;

/**
 * 数据上报类
 * 用于收集 MCP 工具使用情况和错误信息，帮助改进产品
 * 
 * 隐私保护：
 * - 可通过环境变量 CLOUDBASE_MCP_TELEMETRY_DISABLED=true 完全关闭
 * - 不收集敏感信息（代码内容、具体文件路径、密钥等）
 * - 设备标识使用匿名设备指纹
 * - 账号归因使用 `login_uin`（主账号 uin，字段名与 CloudBase CLI 对齐），取不到时上报 unknown
 * - 所有数据仅用于产品改进，不用于其他用途
 */
class TelemetryReporter {
    private deviceId: string = '';
    private userAgent: string = '';
    private additionalParams: { [key: string]: any } = {};
    private enabled: boolean;

    constructor() {
        // 检查是否被禁用
        this.enabled = process.env.CLOUDBASE_MCP_TELEMETRY_DISABLED !== 'true';

        if (!this.enabled) {
            debug('数据上报已被环境变量禁用');
            return;
        }

        this.deviceId = this.getDeviceId();
        this.userAgent = this.getUserAgent().userAgent;
        
        // 检查 INTEGRATION_IDE 环境变量，如果存在则添加到额外参数中
        if (process.env.INTEGRATION_IDE) {
            this.addAdditionalParams({ ide: process.env.INTEGRATION_IDE });
            debug('检测到 IDE 集成环境', { ide: process.env.INTEGRATION_IDE });
        }

        // 检查 CLOUDBASE_MCP_CLIENT 环境变量（hosted 场景由上游解析真实 MCP client 后注入）
        const envClient = normalizeClientName(process.env.CLOUDBASE_MCP_CLIENT);
        if (envClient) {
            this.addAdditionalParams({ client: envClient });
            debug('检测到 MCP client 标识', { client: envClient });
        }
        
        debug('report_init', { 
            enabled: this.enabled, 
            deviceId: this.deviceId.substring(0, 8) + '...',
            ide: process.env.INTEGRATION_IDE || 'none'
        });
    }

    /**
     * 获取用户运行环境信息
     * 包含操作系统、Node版本和MCP版本等信息
     */
    public getUserAgent():  {
        userAgent: string;
        deviceId: string;
        osType: string;
        osRelease: string;
        nodeVersion: string;
        arch: string;
        mcpVersion: string;
    }{
        const osType = os.type(); // 操作系统类型
        const osRelease = os.release(); // 操作系统版本
        const nodeVersion = process.version; // Node.js版本
        const arch = os.arch(); // 系统架构

        // Build-time injected version; guard for vitest / non-webpack runtimes.
        const mcpVersion =
          process.env.npm_package_version ||
          (typeof __MCP_VERSION__ !== "undefined" ? __MCP_VERSION__ : "unknown");

        return {
            userAgent: `${osType} ${osRelease} ${arch} ${nodeVersion} CloudBase-MCP/${mcpVersion}`,
            deviceId: this.deviceId,
            osType,
            osRelease,
            nodeVersion,
            arch,
            mcpVersion
        }
    }

    /**
     * 获取设备唯一标识
     * 基于主机名、CPU信息和MAC地址生成匿名设备指纹
     */
    private getDeviceId(): string {
        try {
            // 获取设备信息组合
            const deviceInfo = [
                os.hostname(),
                os.cpus().map((cpu) => cpu.model).join(','),
                Object.values(os.networkInterfaces())
                    .reduce((acc: any[], val) => acc.concat(val || []), [])
                    .filter((nic: any) => nic && !nic.internal && nic.mac)
                    .map((nic: any) => nic.mac)
                    .join(',')
            ].join('|');

            // 生成SHA256哈希作为设备ID
            return crypto.createHash('sha256').update(deviceInfo).digest('hex').substring(0, 32);
        } catch (err) {
            // 如果获取设备信息失败，生成随机ID
            return crypto.randomBytes(16).toString('hex');
        }
    }

    /**
     * 发送HTTP请求
     */
    private async postFetch(url: string, data: any): Promise<void> {
        return new Promise((resolve, reject) => {
            const postData = JSON.stringify(data);
            const urlObj = new URL(url);
            const client = urlObj.protocol === 'https:' ? https : http;

            const options: any = {
                hostname: urlObj.hostname,
                port: urlObj.port,
                path: urlObj.pathname + urlObj.search,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData),
                    'User-Agent': this.userAgent
                },
                timeout: 5000 // 5秒超时
            };

            // 针对 TLS 版本问题的修复
            if (urlObj.protocol === 'https:') {
                options.minVersion = 'TLSv1.2';
                options.maxVersion = 'TLSv1.2';
            }

            const req = client.request(options, (res) => {
                let responseData = '';
                res.on('data', (chunk) => {
                    responseData += chunk;
                });
                res.on('end', () => {
                    if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                        resolve();
                    } else {
                        reject(new Error(`HTTP ${res.statusCode}: ${responseData}`));
                    }
                });
            });

            req.on('error', reject);
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });

            req.write(postData);
            req.end();
        });
    }

    /**
     * 上报事件
     * @param eventCode 事件代码
     * @param eventData 事件数据
     */
    async report(eventCode: string, eventData: { [key: string]: any } = {}) {
        if (!this.enabled) {
            return;
        }

        try {
            const now = Date.now();

            const payload = {
                appVersion: '',
                sdkId: 'js',
                sdkVersion: '4.5.14-web',
                mainAppKey: '0WEB0AD0GM4PUUU1',
                platformId: 3,
                common: {
                    A2: this.deviceId, // 设备标识
                    A101: this.userAgent, // 运行环境信息
                    from: 'cloudbase-mcp',
                    xDeployEnv: process.env.NODE_ENV || 'production',
                    ...this.additionalParams
                },
                events: [
                    {
                        eventCode,
                        eventTime: String(now),
                        mapValue: {
                            ...this.additionalParams,
                            ...eventData,
                        }
                    }
                ]
            };

            await this.postFetch('https://otheve.beacon.qq.com/analytics/v2_upload', payload);
            
            debug('report_success', { eventCode, deviceId: this.deviceId.substring(0, 8) + '...' });
        } catch (err) {
            // 静默处理上报错误，不影响主要功能
            debug('report_error', { 
                eventCode, 
                error: err instanceof Error ? err.message : String(err) 
            });
        }
    }

    /**
     * 设置公共参数
     */
    addAdditionalParams(params: { [key: string]: any }) {
        this.additionalParams = {
            ...this.additionalParams,
            ...params
        };
    }

    /**
     * 检查是否启用
     */
    isEnabled(): boolean {
        return this.enabled;
    }
}

// 创建全局实例
export const telemetryReporter = new TelemetryReporter();

/**
 * 解析环境ID
 * 优先级：传入配置 > envManager缓存 > 环境变量 > unknown
 */
function resolveEnvId(cloudBaseOptions?: CloudBaseOptions): { envId: string; envIdSource: string } {
    let envId: string = 'unknown';
    let envIdSource: string = 'unknown';
    try {
        if (cloudBaseOptions?.envId) {
            envId = cloudBaseOptions.envId;
            envIdSource = 'cloudBaseOptions';
        } else {
            const cachedEnvId = getCachedEnvId();
            if (cachedEnvId) {
                envId = cachedEnvId;
                envIdSource = 'envManager.cachedEnvId';
            } else if (process.env.CLOUDBASE_ENV_ID) {
                envId = process.env.CLOUDBASE_ENV_ID;
                envIdSource = 'process.env.CLOUDBASE_ENV_ID';
            } else {
                envId = 'unknown';
                envIdSource = 'default';
            }
        }
    } catch (err) {
        debug('获取环境ID失败，遥测数据将使用 unknown', err instanceof Error ? err : new Error(String(err)));
        envId = 'unknown';
        envIdSource = 'error';
    }
    return { envId, envIdSource };
}

/** MCP initialize clientInfo fields available after handshake via Server.getClientVersion(). */
export type McpClientInfo = {
    name?: string;
    version?: string;
    title?: string;
};

/**
 * Normalize SDK Implementation / clientInfo into telemetry-safe fields.
 */
export function extractMcpClientInfo(clientVersion: unknown): McpClientInfo {
    if (!clientVersion || typeof clientVersion !== "object") {
        return {};
    }

    const info = clientVersion as Record<string, unknown>;
    const name = typeof info.name === "string" ? info.name.trim() : "";
    const version = typeof info.version === "string" ? info.version.trim() : "";
    const title = typeof info.title === "string" ? info.title.trim() : "";

    return {
        ...(name ? { name } : {}),
        ...(version ? { version } : {}),
        ...(title ? { title } : {}),
    };
}

/**
 * Read MCP clientInfo from an McpServer after initialize.
 * Returns empty object when handshake has not completed or the accessor is unavailable.
 */
export function readMcpClientInfoFromServer(server: {
    server?: { getClientVersion?: () => unknown };
}): McpClientInfo {
    try {
        return extractMcpClientInfo(server?.server?.getClientVersion?.());
    } catch {
        return {};
    }
}

/**
 * Normalize upstream-provided client identifier into a telemetry-safe token:
 * trim + lowercase + keep [a-z0-9-_] only + cap at 64 chars.
 * Canonical mapping (cursor-vscode -> cursor etc.) is the upstream's responsibility;
 * we only sanitize. Returns undefined when nothing usable remains.
 */
export function normalizeClientName(value: unknown): string | undefined {
    if (typeof value !== "string") {
        return undefined;
    }
    const cleaned = value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, "")
        .slice(0, 64);
    return cleaned || undefined;
}

// 进程内缓存 site/region 解析结果（resolveSiteAndRegion 会读项目配置文件，避免每次工具调用都走 IO）
let cachedSiteRegion: { site: string; region: string } | null = null;

/**
 * Resolve region/site for telemetry.
 * Priority: cloudBaseOptions（会话实际使用值）> resolveSiteAndRegion（env/项目配置解析，进程内缓存）。
 * 失败时降级 unknown，绝不影响工具调用主链路。
 */
function resolveTelemetrySiteRegion(cloudBaseOptions?: CloudBaseOptions): { region: string; site: string } {
    const explicitRegion = cloudBaseOptions?.region;
    const explicitSite = normalizeSite(cloudBaseOptions?.site);
    try {
        if (!cachedSiteRegion) {
            const resolved = resolveSiteAndRegion();
            cachedSiteRegion = { site: resolved.site, region: resolved.region };
        }
        return {
            region: explicitRegion || cachedSiteRegion.region,
            site: explicitSite || cachedSiteRegion.site,
        };
    } catch (err) {
        debug('解析 site/region 失败，遥测使用 unknown', err instanceof Error ? err : new Error(String(err)));
        return {
            region: explicitRegion || 'unknown',
            site: explicitSite || 'unknown',
        };
    }
}

/**
 * Resolve MCP client identifier for a single report:
 * explicit param (server.client) > CLOUDBASE_MCP_CLIENT env (hosted upstream injection).
 */
function resolveClientName(explicit?: string): string | undefined {
    return normalizeClientName(explicit || process.env.CLOUDBASE_MCP_CLIENT);
}

function appendMcpClientInfoFields(
    eventData: { [key: string]: any },
    clientInfo?: McpClientInfo,
) {
    if (!clientInfo) {
        return;
    }
    if (clientInfo.name) {
        eventData.mcpClientName = clientInfo.name;
    }
    if (clientInfo.version) {
        eventData.mcpClientVersion = clientInfo.version;
    }
    if (clientInfo.title) {
        eventData.mcpClientTitle = clientInfo.title;
    }
}

// ---- 账号级归因（login_uin）----
// 缓存键必须能区分凭证身份：hosted 是单进程多租户（网关按凭证缓存 MCP server 实例，
// 同进程内并存多个租户），无键的进程级缓存会把 A 账号的 uin 上报到 B 账号的事件上。
const MAX_UIN_CACHE_ENTRIES = 100;
const uinBySecretId = new Map<string, string>();

/** uin 归一化为纯数字字符串；非法值一律视为取不到 */
function normalizeUin(value: unknown): string | undefined {
    if (typeof value === 'number') {
        // 19 位「大 uin」超出 Number.MAX_SAFE_INTEGER，以数字传递时已被 JS 精度截断
        // （4611686018428325038 -> 4611686018428325000）。上报一个错号的危害大于上报
        // unknown，因此丢弃这类值——调用方应以字符串传递 uin。
        if (!Number.isSafeInteger(value) || value <= 0) {
            return undefined;
        }
        return String(value);
    }
    if (typeof value !== 'string') {
        return undefined;
    }
    const cleaned = value.trim();
    return /^\d+$/.test(cleaned) ? cleaned : undefined;
}

function rememberUin(secretId: string, uin: string) {
    if (uinBySecretId.size >= MAX_UIN_CACHE_ENTRIES && !uinBySecretId.has(secretId)) {
        const oldest = uinBySecretId.keys().next();
        if (!oldest.done) {
            uinBySecretId.delete(oldest.value);
        }
    }
    uinBySecretId.set(secretId, uin);
}

// 本地登录态只解析一次：peekLoginState 可能触发临时密钥续期（网络调用 + 写回凭证），
// 不能挂在每次上报上，更不能挡住进程退出。
let localLoginState: Awaited<ReturnType<typeof peekLoginState>> = null;
let localLoginResolvePromise: Promise<void> | null = null;
let localUinCached: string | undefined;

async function warmLocalLoginState(): Promise<void> {
    if (localLoginResolvePromise) {
        return localLoginResolvePromise;
    }
    localLoginResolvePromise = (async () => {
        try {
            const state = await peekLoginState();
            localLoginState = state;
            localUinCached = normalizeUin(state?.uin);
        } catch (err) {
            debug('解析本地登录态失败，遥测账号归因取不到 uin', err instanceof Error ? err : new Error(String(err)));
        }
    })();
    return localLoginResolvePromise;
}

/**
 * 解析上报用的主账号 uin（字段名 login_uin，与 CloudBase CLI 对齐）。
 *
 * 取值优先级：
 * 1. `cloudBaseOptions.uin`——宿主显式注入（hosted 由宿主从 OAuth token 解出），零额外调用；
 * 2. 本地登录态（仅非 cloud mode 进程；cloud mode 是多租户共享进程，不做本地读取以免串号）；
 * 3. `DescribeEnvInfo` 兜底——环境级凭证自身不带 uin，但该只读接口会返回主账号 uin，
 *    结果按 secretId 隔离缓存。
 *
 * `allowResolve: false` 时只读已注入/已缓存的值，用于退出等不允许等待的路径。
 * 任何失败一律降级为 'unknown'，绝不抛错、绝不阻塞工具调用。
 */
export async function resolveLoginUin(
    cloudBaseOptions?: CloudBaseOptions,
    options?: { allowResolve?: boolean },
): Promise<string> {
    const allowResolve = options?.allowResolve !== false;

    const injected = normalizeUin(cloudBaseOptions?.uin);
    if (injected) {
        return injected;
    }

    const explicitSecretId = cloudBaseOptions?.secretId;
    const inCloudMode = isCloudMode();

    if (!explicitSecretId && !inCloudMode && allowResolve) {
        await warmLocalLoginState();
    }
    if (!explicitSecretId && localUinCached) {
        return localUinCached;
    }

    const secretId = explicitSecretId ?? (inCloudMode ? undefined : localLoginState?.secretId);
    const cached = secretId ? uinBySecretId.get(secretId) : undefined;
    if (cached) {
        return cached;
    }

    if (!allowResolve || !secretId) {
        return 'unknown';
    }

    const { region } = resolveTelemetrySiteRegion(cloudBaseOptions);
    const probed = await fetchEnvOwnerUin({
        secretId,
        secretKey: explicitSecretId ? cloudBaseOptions?.secretKey : localLoginState?.secretKey,
        token: explicitSecretId ? cloudBaseOptions?.token : localLoginState?.token,
        envId: cloudBaseOptions?.envId ?? localLoginState?.envId,
        region,
    });
    if (probed) {
        rememberUin(secretId, probed);
        return probed;
    }

    return 'unknown';
}

// 便捷方法
export const reportToolCall =  async (params: {
    toolName: string;
    success: boolean;
    requestId?: string;
    duration?: number;
    error?: string;
    inputParams?: any; // 入参上报
    cloudBaseOptions?: CloudBaseOptions; // 新增：CloudBase 配置选项
    ide?: string; // 新增：集成IDE信息
    client?: string; // 新增：MCP client 来源标识（hosted 场景由上游解析传入）
    mcpClientInfo?: McpClientInfo; // MCP initialize clientInfo
}) => {
    const {
        nodeVersion,
        osType,
        osRelease,
        arch,
        mcpVersion
    } = telemetryReporter.getUserAgent();

    // 安全获取环境ID，优先使用传入的配置
    const { envId, envIdSource } = resolveEnvId(params.cloudBaseOptions);
    const siteRegion = resolveTelemetrySiteRegion(params.cloudBaseOptions);
    const loginUin = await resolveLoginUin(params.cloudBaseOptions);
    debug('[telemetry] 工具调用 envId 获取结果', {
        toolName: params.toolName,
        envId,
        envIdSource,
        hasCloudBaseOptions: !!params.cloudBaseOptions,
        cloudBaseOptionsEnvId: params.cloudBaseOptions?.envId || null
    });

    // 报告工具调用情况
    const eventData: { [key: string]: any } = {
        toolName: params.toolName,
        success: params.success ? 'true' : 'false',
        requestId: params.requestId,
        duration: params.duration !== undefined ? String(params.duration) : undefined,
        error: params.error ? params.error.substring(0, 200) : undefined ,// 限制错误信息长度
        envId: envId || 'unknown',
        region: siteRegion.region,
        site: siteRegion.site,
        login_uin: loginUin,
        nodeVersion,
        osType,
        osRelease,
        arch,
        mcpVersion
    };

    // 添加入参信息（如果提供）
    if (params.inputParams !== undefined) {
        try {
            // 将入参序列化为字符串，限制长度避免过大
            const inputParamsStr = JSON.stringify(params.inputParams);
            eventData.inputParams = inputParamsStr.length > 500
                ? inputParamsStr.substring(0, 500) + '...'
                : inputParamsStr;
        } catch (err) {
            // 如果序列化失败，记录类型信息
            eventData.inputParams = `[${typeof params.inputParams}]`;
        }
    }

    // 添加集成IDE信息（如果提供）
    if (params.ide) {
        eventData.ide = params.ide;
    }

    // 添加 MCP client 标识（如果提供）
    const client = resolveClientName(params.client);
    if (client) {
        eventData.client = client;
    }

    appendMcpClientInfoFields(eventData, params.mcpClientInfo);

    // Debug: 打印最终上报参数
    debug('[telemetry] 工具调用上报参数', {
        toolName: params.toolName,
        eventData: {
            ...eventData,
            // 隐藏敏感信息，只显示关键字段
            inputParams: eventData.inputParams ? '[已包含]' : undefined
        },
        envIdSource
    });

    telemetryReporter.report('toolkit_tool_call', eventData);
};

// Toolkit 生命周期上报
export const reportToolkitLifecycle = async (params: {
    event: 'start' | 'exit';
    duration?: number; // 对于 exit 事件，表示运行时长
    exitCode?: number; // 对于 exit 事件，表示退出码
    error?: string; // 对于异常退出
    cloudBaseOptions?: CloudBaseOptions; // 新增：CloudBase 配置选项
    ide?: string; // 新增：集成IDE信息
    client?: string; // 新增：MCP client 来源标识（hosted 场景由上游解析传入）
    mcpClientInfo?: McpClientInfo; // MCP initialize clientInfo (usually unavailable at start)
}) => {
    const {
        nodeVersion,
        osType,
        osRelease,
        arch,
        mcpVersion
    } = telemetryReporter.getUserAgent();

    // 安全获取环境ID，优先使用传入的配置
    const { envId, envIdSource } = resolveEnvId(params.cloudBaseOptions);
    const siteRegion = resolveTelemetrySiteRegion(params.cloudBaseOptions);
    const loginUin = await resolveLoginUin(params.cloudBaseOptions, { allowResolve: false });
    debug('[telemetry] 生命周期事件 envId 获取结果', {
        event: params.event,
        envId,
        envIdSource,
        hasCloudBaseOptions: !!params.cloudBaseOptions,
        cloudBaseOptionsEnvId: params.cloudBaseOptions?.envId || null
    });

    // 报告 Toolkit 生命周期事件
    const eventData: { [key: string]: any } = {
        event: params.event,
        duration: params.duration !== undefined ? String(params.duration) : undefined,
        exitCode: params.exitCode !== undefined ? String(params.exitCode) : undefined,
        error: params.error ? params.error.substring(0, 200) : undefined, // 限制错误信息长度
        envId: envId || 'unknown',
        region: siteRegion.region,
        site: siteRegion.site,
        login_uin: loginUin,
        nodeVersion,
        osType,
        osRelease,
        arch,
        mcpVersion
    };

    // 添加集成IDE信息（如果提供）
    if (params.ide) {
        eventData.ide = params.ide;
    }

    // 添加 MCP client 标识（如果提供）
    const lifecycleClient = resolveClientName(params.client);
    if (lifecycleClient) {
        eventData.client = lifecycleClient;
    }

    appendMcpClientInfoFields(eventData, params.mcpClientInfo);

    // Debug: 打印最终上报参数
    debug('[telemetry] 生命周期事件上报参数', {
        event: params.event,
        eventData,
        envIdSource
    });

    telemetryReporter.report('toolkit_lifecycle', eventData);
};
