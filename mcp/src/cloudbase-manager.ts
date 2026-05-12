import CloudBase from "@cloudbase/manager-node";
import {
    buildDeviceAuthChallengePayload,
    getAuthProgressState,
    peekLoginState,
    getLoginState,
} from './auth.js';
import { CloudBaseOptions, Logger } from './types.js';
import { debug, error } from './utils/logger.js';
import { buildAuthNextStep, throwToolPayloadError } from './utils/tool-result.js';

// Timeout for envId auto-resolution flow.
// 10 minutes (600 seconds) - matches InteractiveServer timeout
const ENV_ID_TIMEOUT = 600000;

export type EnvCandidate = {
    envId: string;
    alias?: string;
    region?: string;
    status?: string;
    env_type?: string;
};

function toEnvCandidates(envList: any[]): EnvCandidate[] {
    if (!Array.isArray(envList)) {
        return [];
    }

    return envList
        .filter((item) => item?.EnvId)
        .map((item) => ({
            envId: item.EnvId,
            alias: item.Alias,
            region: item.Region,
            status: item.Status,
            env_type: item.EnvType,
        }));
}

function createManagerFromLoginState(loginState: any, region?: string): CloudBase {
    return new CloudBase({
        secretId: loginState.secretId,
        secretKey: loginState.secretKey,
        envId: loginState.envId,
        token: loginState.token,
        proxy: process.env.http_proxy,
        region: region ?? process.env.TCB_REGION ?? 'ap-shanghai',
    });
}

export async function listAvailableEnvCandidates(options?: {
    cloudBaseOptions?: CloudBaseOptions;
    loginState?: any;
}): Promise<EnvCandidate[]> {
    const { cloudBaseOptions, loginState: providedLoginState } = options ?? {};

    if (cloudBaseOptions?.envId) {
        return [{
            envId: cloudBaseOptions.envId,
        }];
    }

    let cloudbase: CloudBase | undefined;
    if (cloudBaseOptions?.secretId && cloudBaseOptions?.secretKey) {
        cloudbase = createCloudBaseManagerWithOptions(cloudBaseOptions);
    } else {
        const loginState = providedLoginState ?? await peekLoginState();
        if (!loginState?.secretId || !loginState?.secretKey) {
            return [];
        }
        const region = cloudBaseOptions?.region ?? process.env.TCB_REGION ?? 'ap-shanghai';
        cloudbase = createManagerFromLoginState(loginState, region);
    }

    try {
        const result = await cloudbase.commonService("tcb", "2018-06-08").call({
            Action: "DescribeEnvs",
            Param: {
                EnvTypes: ["weda", "baas"],
                IsVisible: false,
                Channels: ["dcloud", "iotenable", "tem", "scene_module"],
            },
        });
        const envList = result?.EnvList || result?.Data?.EnvList || [];
        return toEnvCandidates(envList);
    } catch {
        try {
            const fallback = await cloudbase.env.listEnvs();
            return toEnvCandidates(fallback?.EnvList || []);
        } catch {
            return [];
        }
    }
}

function throwAuthRequiredError() {
    throwToolPayloadError({
        ok: false,
        code: "AUTH_REQUIRED",
        message: "当前未登录，请先调用 auth 工具完成认证。",
        next_step: buildAuthNextStep("start_auth", {
            suggestedArgs: {
                action: "start_auth",
                authMode: "device",
            },
        }),
    });
}

async function throwPendingAuthError() {
    const authState = await getAuthProgressState();
    throwToolPayloadError({
        ok: false,
        code: "AUTH_PENDING",
        message: authState.lastError || "设备码授权进行中，请先完成登录后再重试当前工具。",
        auth_challenge: buildDeviceAuthChallengePayload(authState.authChallenge),
        next_step: buildAuthNextStep("status", {
            suggestedArgs: {
                action: "status",
            },
        }),
    });
}

async function throwEnvRequiredError(options?: {
    cloudBaseOptions?: CloudBaseOptions;
    loginState?: any;
    envCandidates?: EnvCandidate[];
}) {
    const envCandidates =
        options?.envCandidates ?? (await listAvailableEnvCandidates(options));
    const singleEnvId = envCandidates.length === 1 ? envCandidates[0].envId : undefined;
    throwToolPayloadError({
        ok: false,
        code: "ENV_REQUIRED",
        message: envCandidates.length === 0
            ? "当前已登录，但还没有可用环境，请先调用 auth 工具完成环境选择或创建环境。"
            : envCandidates.length === 1
                ? `当前已登录，但尚未绑定环境。可直接选择环境 ${singleEnvId}。`
                : "当前已登录，但尚未绑定环境，请先调用 auth 工具选择环境。",
        env_candidates: envCandidates,
        next_step: buildAuthNextStep("set_env", {
            requiredParams: singleEnvId ? undefined : ["envId"],
            suggestedArgs: singleEnvId
                ? {
                    action: "set_env",
                    envId: singleEnvId,
                }
                : {
                    action: "set_env",
                },
        }),
    });
}

// 统一的环境ID管理类
class EnvironmentManager {
    private cachedEnvId: string | null = null;
    private envIdPromise: Promise<string> | null = null;

    // 重置缓存
    reset() {
        this.cachedEnvId = null;
        this.envIdPromise = null;
        delete process.env.CLOUDBASE_ENV_ID;
    }

    // 获取环境ID的核心逻辑
    async getEnvId(): Promise<string> {
        // 1. 优先使用内存缓存
        if (this.cachedEnvId) {
            debug('使用内存缓存的环境ID:', { envId: this.cachedEnvId });
            return this.cachedEnvId;
        }

        // 2. 如果正在获取中，等待结果
        if (this.envIdPromise) {
            return this.envIdPromise;
        }

        // 3. 开始获取环境ID
        this.envIdPromise = this._fetchEnvId();

        try {
            const result = await this.envIdPromise;
            return result;
        } catch (err) {
            this.envIdPromise = null;
            throw err;
        }
    }

    private async _fetchEnvId(): Promise<string> {
        try {
            // 1. 检查进程环境变量
            if (process.env.CLOUDBASE_ENV_ID) {
                debug('使用进程环境变量的环境ID:', { envId: process.env.CLOUDBASE_ENV_ID });
                this.cachedEnvId = process.env.CLOUDBASE_ENV_ID;
                return this.cachedEnvId;
            }

            // 2. 如果登录态里已有 envId，直接复用
            const loginState = await peekLoginState();
            if (typeof loginState?.envId === 'string' && loginState.envId.length > 0) {
                debug('使用登录态中的环境ID:', { envId: loginState.envId });
                this._setCachedEnvId(loginState.envId);
                return loginState.envId;
            }

            // 3. 单环境自动绑定；多环境时返回结构化引导，不再触发交互弹窗
            const envCandidates = await listAvailableEnvCandidates({ loginState });
            if (envCandidates.length === 1) {
                const singleEnvId = envCandidates[0].envId;
                debug('自动绑定唯一环境:', { envId: singleEnvId });
                this._setCachedEnvId(singleEnvId);
                return singleEnvId;
            }

            await throwEnvRequiredError({ loginState, envCandidates });
            throw new Error('Unreachable after throwEnvRequiredError');

        } catch (err) {
            // Log the error with full context before re-throwing
            const errorObj = err instanceof Error ? err : new Error(String(err));
            error('获取环境ID失败:', {
                message: errorObj.message,
                stack: errorObj.stack,
                name: errorObj.name,
                failureInfo: (errorObj as any).failureInfo,
                originalError: (errorObj as any).originalError,
            });
            throw errorObj;
        } finally {
            this.envIdPromise = null;
        }
    }

    // 统一设置缓存的方法
    private _setCachedEnvId(envId: string) {
        this.cachedEnvId = envId;
        process.env.CLOUDBASE_ENV_ID = envId;
        debug('已更新环境ID缓存:', { envId });
    }

    // 手动设置环境ID（用于外部调用）
    async setEnvId(envId: string) {
        this._setCachedEnvId(envId);
        debug('手动设置环境ID并更新缓存:', { envId });
    }

    // Get cached envId without triggering fetch (for optimization)
    getCachedEnvId(): string | null {
        return this.cachedEnvId;
    }
}

// 全局实例
const envManager = new EnvironmentManager();

// 导出环境ID获取函数
export async function getEnvId(cloudBaseOptions?: CloudBaseOptions): Promise<string> {
    // 如果传入了 cloudBaseOptions 且包含 envId，直接返回
    if (cloudBaseOptions?.envId) {
        debug('使用传入的 envId:', { envId: cloudBaseOptions.envId });
        return cloudBaseOptions.envId;
    }

    const cachedEnvId = envManager.getCachedEnvId() || process.env.CLOUDBASE_ENV_ID;
    if (cachedEnvId) {
        debug('使用缓存中的 envId:', { envId: cachedEnvId });
        return cachedEnvId;
    }

    const loginState = await peekLoginState();
    if (typeof loginState?.envId === 'string' && loginState.envId.length > 0) {
        debug('使用登录态中的 envId:', { envId: loginState.envId });
        return loginState.envId;
    }

    // 否则使用默认逻辑
    return envManager.getEnvId();
}

// 导出函数保持兼容性
export function resetCloudBaseManagerCache() {
    envManager.reset();
}

// 导出获取缓存环境ID的函数，供遥测模块使用
export function getCachedEnvId(): string | null {
    return envManager.getCachedEnvId();
}

export interface GetManagerOptions {
    requireEnvId?: boolean;
    cloudBaseOptions?: CloudBaseOptions;
    mcpServer?: any; // Reserved for backward compatibility
    authStrategy?: 'fail_fast' | 'ensure';
}

type DatabaseInstanceIdResolution = {
    instanceId: string;
    source: 'input' | 'cache' | 'envInfo';
    cacheKey?: string;
};

type DatabaseInstanceIdCacheEntry = {
    instanceId?: string;
    inflightPromise?: Promise<string>;
};

const databaseInstanceIdCache = new Map<string, DatabaseInstanceIdCacheEntry>();

function buildDatabaseInstanceIdCacheKey(options?: {
    envId?: string;
    region?: string;
    cloudBaseOptions?: CloudBaseOptions;
}) {
    const envId = options?.envId ?? options?.cloudBaseOptions?.envId ?? process.env.CLOUDBASE_ENV_ID ?? 'unknown';
    const region = options?.region ?? options?.cloudBaseOptions?.region ?? process.env.TCB_REGION ?? 'ap-shanghai';
    return `${region}:${envId}`;
}

export function resetDatabaseInstanceIdCache() {
    databaseInstanceIdCache.clear();
}

export function invalidateDatabaseInstanceIdCache(options?: {
    cacheKey?: string;
    envId?: string;
    region?: string;
    cloudBaseOptions?: CloudBaseOptions;
}) {
    const cacheKey = options?.cacheKey ?? buildDatabaseInstanceIdCacheKey(options);
    databaseInstanceIdCache.delete(cacheKey);
}

export async function getDatabaseInstanceId(options?: {
    instanceId?: string;
    cloudBaseOptions?: CloudBaseOptions;
    cloudbase?: CloudBase;
}): Promise<DatabaseInstanceIdResolution> {
    if (options?.instanceId) {
        return {
            instanceId: options.instanceId,
            source: 'input',
        };
    }

    const envId = await getEnvId(options?.cloudBaseOptions);
    const cacheKey = buildDatabaseInstanceIdCacheKey({
        envId,
        cloudBaseOptions: options?.cloudBaseOptions,
    });

    const cachedEntry = databaseInstanceIdCache.get(cacheKey);
    if (cachedEntry?.instanceId) {
        return {
            instanceId: cachedEntry.instanceId,
            source: 'cache',
            cacheKey,
        };
    }

    if (cachedEntry?.inflightPromise) {
        const instanceId = await cachedEntry.inflightPromise;
        return {
            instanceId,
            source: 'cache',
            cacheKey,
        };
    }

    const inflightPromise = (async () => {
        const cloudbase =
            options?.cloudbase ?? (await getCloudBaseManager({ cloudBaseOptions: options?.cloudBaseOptions }));
        const { EnvInfo } = await cloudbase.env.getEnvInfo();
        if (!EnvInfo?.Databases?.[0]?.InstanceId) {
            throw new Error("无法获取数据库实例ID");
        }
        return EnvInfo.Databases[0].InstanceId;
    })();

    databaseInstanceIdCache.set(cacheKey, {
        inflightPromise,
    });

    try {
        const instanceId = await inflightPromise;
        databaseInstanceIdCache.set(cacheKey, {
            instanceId,
        });
        return {
            instanceId,
            source: 'envInfo',
            cacheKey,
        };
    } catch (error) {
        databaseInstanceIdCache.delete(cacheKey);
        throw error;
    }
}

/**
 * 每次都实时获取最新的 token/secretId/secretKey
 */
export async function getCloudBaseManager(options: GetManagerOptions = {}): Promise<CloudBase> {
    const {
        requireEnvId = true,
        cloudBaseOptions,
        authStrategy = 'fail_fast',
    } = options;

    const hasDirectCredentials = !!(cloudBaseOptions?.secretId && cloudBaseOptions?.secretKey);

    // 如果传入了完整凭据，优先使用显式 CloudBase 配置
    if (cloudBaseOptions && hasDirectCredentials) {
        let resolvedEnvId = cloudBaseOptions.envId;
        if (requireEnvId && !resolvedEnvId) {
            const envCandidates = await listAvailableEnvCandidates({ cloudBaseOptions });
            if (envCandidates.length === 1) {
                const singleEnvId = envCandidates[0].envId;
                cloudBaseOptions.envId = singleEnvId;
                resolvedEnvId = singleEnvId;
                debug('自动绑定唯一环境(显式配置):', { envId: singleEnvId });
            } else if (authStrategy === 'fail_fast') {
                await throwEnvRequiredError({ cloudBaseOptions, envCandidates });
            } else {
                throwToolPayloadError({
                    ok: false,
                    code: "ENV_REQUIRED",
                    message: "当前显式 CloudBase 凭据未绑定环境，请补充 envId 或先选择环境。",
                    env_candidates: envCandidates,
                    next_step: buildAuthNextStep("set_env", {
                        suggestedArgs: { action: "set_env" },
                        requiredParams: ["envId"],
                    }),
                });
            }
        }

        debug('使用传入的 CloudBase 配置');
        return createCloudBaseManagerWithOptions({
            ...cloudBaseOptions,
            envId: resolvedEnvId,
        });
    }

    try {
        // Region priority: explicit option > env var > ap-shanghai default
        const fallbackRegion = cloudBaseOptions?.region ?? process.env.TCB_REGION ?? 'ap-shanghai';
        const loginState = authStrategy === 'ensure'
            ? await getLoginState({ region: fallbackRegion })
            : await peekLoginState();

        if (!loginState) {
            const authState = await getAuthProgressState();
            if (authState.status === 'PENDING') {
                await throwPendingAuthError();
            }
            throwAuthRequiredError();
        }
        const {
            envId: loginEnvId,
            secretId,
            secretKey,
            token
        } = loginState;

        let finalEnvId: string | undefined = cloudBaseOptions?.envId;
        if (requireEnvId) {
            if (!finalEnvId) {
                // Optimize: Check if envManager has cached envId first (fast path)
                // If cached, use it directly; otherwise check loginEnvId before calling getEnvId()
                // This avoids unnecessary async calls when we have a valid envId available
                const cachedEnvId = envManager.getCachedEnvId() || process.env.CLOUDBASE_ENV_ID;
                if (cachedEnvId) {
                    debug('使用 envManager 缓存的环境ID:', { cachedEnvId });
                    finalEnvId = cachedEnvId;
                } else if (loginEnvId) {
                    // If no cache but loginState has envId, use it directly
                    debug('使用 loginState 中的环境ID:', { loginEnvId });
                    finalEnvId = loginEnvId;
                } else {
                    if (authStrategy === 'fail_fast') {
                        const envCandidates = await listAvailableEnvCandidates({ loginState });
                        if (envCandidates.length === 1) {
                            const singleEnvId = envCandidates[0].envId;
                            await envManager.setEnvId(singleEnvId);
                            finalEnvId = singleEnvId;
                            debug('自动绑定唯一环境:', { envId: singleEnvId });
                        } else {
                            await throwEnvRequiredError({ loginState, envCandidates });
                        }
                    } else {
                        // ensure 模式下也保持非交互：单环境自动绑定，多环境返回 ENV_REQUIRED
                        finalEnvId = await envManager.getEnvId();
                    }
                }
            }
        }

        // envId priority: explicit option > envManager cache > loginState.envId
        const resolvedEnvId = finalEnvId || loginEnvId;
        // region 直接使用 fallbackRegion（来自 cloudBaseOptions?.region ?? TCB_REGION ?? 'ap-shanghai'）
        // 不再通过 DescribeEnvs 查询 region，以兼容 STS 临时密钥场景
        const region = fallbackRegion;

        const manager = new CloudBase({
            secretId,
            secretKey,
            envId: resolvedEnvId,
            token,
            proxy: process.env.http_proxy,
            region,
            // REGION 国际站需要指定 region
        });
        return manager;
    } catch (err) {
        error('Failed to initialize CloudBase Manager:', err instanceof Error ? err : new Error(String(err)));
        throw err;
    }
}

/**
 * Create a manager with the provided CloudBase options, without using cache
 * @param cloudBaseOptions Provided CloudBase options
 * @returns CloudBase manager instance
 */
export function createCloudBaseManagerWithOptions(cloudBaseOptions: CloudBaseOptions): CloudBase {
    debug('Create manager with provided CloudBase options:', {
        envId: cloudBaseOptions.envId,
        region: cloudBaseOptions.region,
        hasSecretId: !!cloudBaseOptions.secretId,
        hasSecretKey: !!cloudBaseOptions.secretKey,
        hasToken: !!cloudBaseOptions.token,
    });

    // Region priority: explicit option > env var > ap-shanghai default
    const region = cloudBaseOptions.region ?? process.env.TCB_REGION ?? 'ap-shanghai';
    const manager = new CloudBase({
        ...cloudBaseOptions,
        proxy: cloudBaseOptions.proxy || process.env.http_proxy,
        region
    });

    return manager;
}

/**
 * Extract RequestId from result object
 */
export function extractRequestId(result: any): string | undefined {
    if (!result || typeof result !== 'object') {
        return undefined;
    }

    // Try common RequestId field names
    if ('RequestId' in result && result.RequestId) {
        return String(result.RequestId);
    }
    if ('requestId' in result && result.requestId) {
        return String(result.requestId);
    }
    if ('request_id' in result && result.request_id) {
        return String(result.request_id);
    }

    return undefined;
}

/**
 * Log CloudBase manager call result with RequestId
 */
export function logCloudBaseResult(logger: Logger | undefined, result: any): void {
    if (!logger) {
        return;
    }

    const requestId = extractRequestId(result);
    logger({
        type: 'capiResult',
        requestId,
        result,
    });
}

// 导出环境管理器实例供其他地方使用
export { envManager };
