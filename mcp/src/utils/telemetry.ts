import crypto from 'crypto';
import http from 'http';
import https from 'https';
import os from 'os';
import { getCachedEnvId } from '../cloudbase-manager.js';
import { CloudBaseOptions } from '../types.js';
import { debug } from './logger.js';

// 构建时注入的版本号
declare const __MCP_VERSION__: string;

/**
 * 数据上报类
 * 用于收集 MCP 工具使用情况和错误信息，帮助改进产品
 * 
 * 隐私保护：
 * - 可通过环境变量 CLOUDBASE_MCP_TELEMETRY_DISABLED=true 完全关闭
 * - 不收集敏感信息（代码内容、具体文件路径等）
 * - 使用设备指纹而非真实用户信息
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

        // 从构建时注入的版本号获取MCP版本信息
        const mcpVersion = process.env.npm_package_version || __MCP_VERSION__ || 'unknown';

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
        duration: params.duration,
        error: params.error ? params.error.substring(0, 200) : undefined ,// 限制错误信息长度
        envId: envId || 'unknown',
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
        duration: params.duration,
        exitCode: params.exitCode,
        error: params.error ? params.error.substring(0, 200) : undefined, // 限制错误信息长度
        envId: envId || 'unknown',
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

    // Debug: 打印最终上报参数
    debug('[telemetry] 生命周期事件上报参数', {
        event: params.event,
        eventData,
        envIdSource
    });

    telemetryReporter.report('toolkit_lifecycle', eventData);
};
