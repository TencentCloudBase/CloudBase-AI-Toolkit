import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { z } from "zod";
import { getCloudBaseManager, getEnvId } from '../cloudbase-manager.js';
import { ExtendedMcpServer } from '../server.js';
import { debug } from '../utils/logger.js';
import { sendDeployNotification } from '../utils/notification.js';

// CloudRun service types
export const CLOUDRUN_SERVICE_TYPES = ['function', 'container'] as const;
export type CloudRunServiceType = typeof CLOUDRUN_SERVICE_TYPES[number];

// CloudRun access types
export const CLOUDRUN_ACCESS_TYPES = ['OA', 'PUBLIC', 'MINIAPP', 'VPC'] as const;
export type CloudRunAccessType = typeof CLOUDRUN_ACCESS_TYPES[number];

// Input schema for queryCloudRun tool
const queryCloudRunInputSchema = {
  action: z.enum(['list', 'detail', 'templates', 'getDeployLog']).describe('查询操作类型：list=获取云托管服务列表（支持分页和筛选），detail=查询指定服务的详细信息（包含服务配置和最新部署状态），templates=获取可用的项目模板列表（用于初始化新项目），getDeployLog=获取指定服务最近一次或指定构建的部署日志'),

  // List operation parameters
  pageSize: z.number().min(1).max(100).optional().default(10).describe('分页大小，控制每页返回的服务数量。取值范围：1-100，默认值：10。建议根据网络性能和显示需求调整'),
  pageNum: z.number().min(1).optional().default(1).describe('页码，用于分页查询。从1开始，默认值：1。配合pageSize使用可实现分页浏览'),
  serverName: z.string().optional().describe('服务名称筛选条件，支持模糊匹配。例如：输入"test"可匹配"test-service"、"my-test-app"等服务名称。留空则查询所有服务'),
  serverType: z.enum(CLOUDRUN_SERVICE_TYPES).optional().describe('服务类型筛选条件：function=函数型云托管（仅支持Node.js，有特殊的开发要求和限制，适合简单的API服务），container=容器型服务（推荐使用，支持任意语言和框架如Java/Go/Python/PHP/.NET等，适合大多数应用场景）'),

  // Detail and log operation parameters
  detailServerName: z.string().optional().describe('要查询详细信息或部署日志的服务名称。当action为detail或getDeployLog时建议提供，必须是已存在的服务名称。可通过list操作获取可用的服务名称列表'),
  buildId: z.number().optional().describe('构建ID，仅在action=getDeployLog时使用。不传时默认返回最近一次部署的构建日志'),
};

// Input schema for manageCloudRun tool
const ManageCloudRunInputSchema = {
  action: z.enum(['init', 'download', 'run', 'deploy', 'delete', 'createAgent']).describe('云托管服务管理操作类型：init=从模板初始化新的云托管项目代码（在targetPath目录下创建以serverName命名的子目录，支持多种语言和框架模板），download=从云端下载现有服务的代码到本地进行开发，run=在本地运行函数型云托管服务（用于开发和调试，仅支持函数型服务），deploy=将本地代码部署到云端云托管服务（支持函数型和容器型），delete=删除指定的云托管服务（不可恢复，需要确认），createAgent=创建函数型Agent（基于函数型云托管开发AI智能体）'),
  serverName: z.string().describe('云托管服务名称，用于标识和管理服务。命名规则：支持大小写字母、数字、连字符和下划线，必须以字母开头，长度3-45个字符。在init操作中会作为在targetPath下创建的子目录名，在其他操作中作为目标服务名'),

  // Deploy operation parameters
  targetPath: z.string().optional().describe('本地代码路径，必须是绝对路径。在deploy操作中指定要部署的代码目录，在download操作中指定下载目标目录，在init操作中指定云托管服务的上级目录（会在该目录下创建以serverName命名的子目录）。建议约定：项目根目录下的cloudrun/目录，例如：/Users/username/projects/my-project/cloudrun'),
  serverConfig: z.object({
    OpenAccessTypes: z.array(z.enum(CLOUDRUN_ACCESS_TYPES)).optional().describe('公网访问类型配置，控制服务的访问权限：OA=办公网访问，PUBLIC=公网访问（默认，可通过HTTPS域名访问），MINIAPP=小程序访问，VPC=VPC访问（仅同VPC内可访问）。可配置多个类型'),
    Cpu: z.number().positive().optional().describe('CPU规格配置，单位为核。可选值：0.25、0.5、1、2、4、8等。注意：内存规格必须是CPU规格的2倍（如CPU=0.25时内存=0.5，CPU=1时内存=2）。影响服务性能和计费'),
    Mem: z.number().positive().optional().describe('内存规格配置，单位为GB。可选值：0.5、1、2、4、8、16等。注意：必须是CPU规格的2倍。影响服务性能和计费'),
    MinNum: z.number().min(0).optional().describe('最小实例数配置，控制服务的最小运行实例数量。设置为0时支持缩容到0（无请求时不产生费用），设置为大于0时始终保持指定数量的实例运行（确保快速响应但会增加成本）。建议设置为1以降低冷启动延迟，提升用户体验'),
    MaxNum: z.number().min(1).optional().describe('最大实例数配置，控制服务的最大运行实例数量。当请求量增加时，服务最多可以扩展到指定数量的实例，超过此数量后将拒绝新的请求。建议根据业务峰值设置'),
    PolicyDetails: z.array(z.object({
      PolicyType: z.enum(['cpu', 'mem', 'cpu/mem']).describe('扩缩容类型：cpu=基于CPU使用率扩缩容，mem=基于内存使用率扩缩容，cpu/mem=基于CPU和内存使用率扩缩容'),
      PolicyThreshold: z.number().min(1).max(100).describe('扩缩容阈值，单位为百分比。如60表示当资源使用率达到60%时触发扩缩容')
    })).optional().describe('扩缩容配置数组，用于配置服务的自动扩缩容策略。可配置多个扩缩容策略'),
    CustomLogs: z.string().optional().describe('自定义日志配置，用于配置服务的日志收集和存储策略'),
    Port: z.number().min(1).max(65535).optional().describe('服务监听端口配置。函数型服务固定为3000，容器型服务可自定义。服务代码必须监听此端口才能正常接收请求'),
    EnvParams: z.string().optional().describe('环境变量配置，JSON字符串格式。用于传递配置信息给服务代码，如\'{"DATABASE_URL":"mysql://...","NODE_ENV":"production"}\'。敏感信息建议使用环境变量而非硬编码'),
    Dockerfile: z.string().optional().describe('Dockerfile文件名配置，仅容器型服务需要。指定用于构建容器镜像的Dockerfile文件路径，默认为项目根目录下的Dockerfile'),
    BuildDir: z.string().optional().describe('构建目录配置，指定代码构建的目录路径。当代码结构与标准不同时使用，默认为项目根目录'),
    InternalAccess: z.string().optional().describe('内网访问开关配置，控制是否启用内网访问。true=启用内网访问（可通过云开发SDK直接调用），false=关闭内网访问（仅公网访问）'),
    InternalDomain: z.string().optional().describe('内网域名配置，用于配置服务的内网访问域名。仅在启用内网访问时有效'),
    EntryPoint: z.array(z.string()).optional().describe('Dockerfile EntryPoint参数配置，仅容器型服务需要。指定容器启动时的入口程序数组，如["node","app.js"]'),
    Cmd: z.array(z.string()).optional().describe('Dockerfile Cmd参数配置，仅容器型服务需要。指定容器启动时的默认命令数组，如["npm","start"]'),
  }).optional().describe('服务配置项，用于部署时设置服务的运行参数。包括资源规格、访问权限、环境变量等配置。不提供时使用默认配置'),

  // Init operation parameters
  template: z.string().optional().default('helloworld').describe('项目模板标识符，用于指定初始化项目时使用的模板。可通过queryCloudRun的templates操作获取可用模板列表。常用模板：helloworld=Hello World示例，nodejs=Node.js项目模板，python=Python项目模板等'),

  // Run operation parameters (function services only)
  runOptions: z.object({
    port: z.number().min(1).max(65535).optional().default(3000).describe('本地运行端口配置，仅函数型服务有效。指定服务在本地运行时监听的端口号，默认3000。确保端口未被其他程序占用'),
    envParams: z.record(z.string()).optional().describe('本地运行时的附加环境变量配置，用于本地开发和调试。格式为键值对，如{"DEBUG":"true","LOG_LEVEL":"debug"}。这些变量仅在本地运行时生效'),
    runMode: z.enum(['normal', 'agent']).optional().default('normal').describe('运行模式：normal=普通函数模式，agent=Agent模式（用于AI智能体开发）'),
    agentId: z.string().optional().describe('Agent ID，在agent模式下使用，用于标识特定的Agent实例')
  }).optional().describe('本地运行参数配置，仅函数型云托管服务支持。用于配置本地开发环境的运行参数，不影响云端部署'),

  // Agent creation parameters
  agentConfig: z.object({
    agentName: z.string().describe('Agent名称，用于生成BotId'),
    botTag: z.string().optional().describe('Bot标签，用于生成BotId，不提供时自动生成'),
    description: z.string().optional().describe('Agent描述信息'),
    template: z.string().optional().default('blank').describe('Agent模板类型，默认为blank（空白模板）')
  }).optional().describe('Agent配置项，仅在createAgent操作时使用'),

  // Common parameters
  force: z.boolean().optional().default(false).describe('强制操作开关，用于跳过确认提示。默认false（需要确认），设置为true时跳过所有确认步骤。删除操作时强烈建议设置为true以避免误操作'),
  serverType: z.enum(CLOUDRUN_SERVICE_TYPES).optional().describe('服务类型配置：function=函数型云托管（仅支持Node.js，有特殊的开发要求和限制，适合简单的API服务），container=容器型服务（推荐使用，支持任意语言和框架如Java/Go/Python/PHP/.NET等，适合大多数应用场景）。不提供时自动检测：1)现有服务类型 2)有Dockerfile→container 3)有@cloudbase/aiagent-framework依赖→function 4)其他情况→container'),
};

type queryCloudRunInput = {
  action: 'list' | 'detail' | 'templates' | 'getDeployLog';
  pageSize?: number;
  pageNum?: number;
  serverName?: string;
  serverType?: CloudRunServiceType;
  detailServerName?: string;
  buildId?: number;
};

type ManageCloudRunInput = {
  action: 'init' | 'download' | 'run' | 'deploy' | 'delete' | 'createAgent';
  serverName: string;
  targetPath?: string;
  serverConfig?: any;
  template?: string;
  force?: boolean;
  serverType?: CloudRunServiceType;
  runOptions?: {
    port?: number;
    envParams?: Record<string, string>;
    runMode?: 'normal' | 'agent';
    agentId?: string;
  };
  agentConfig?: {
    agentName: string;
    botTag?: string;
    description?: string;
    template?: string;
  };
};

/**
 * Check if a project is an Agent project
 * @param projectPath Project directory path
 * @returns true if it's an Agent project
 */
function checkIfAgentProject(projectPath: string): boolean {
  try {
    // Check if package.json exists and contains @cloudbase/aiagent-framework dependency
    const packageJsonPath = path.join(projectPath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
      if (dependencies['@cloudbase/aiagent-framework']) {
        return true;
      }
    }

    // Check if index.js contains Agent-related code
    const indexJsPath = path.join(projectPath, 'index.js');
    if (fs.existsSync(indexJsPath)) {
      const content = fs.readFileSync(indexJsPath, 'utf8');
      if (content.includes('@cloudbase/aiagent-framework') ||
        content.includes('BotRunner') ||
        content.includes('IBot') ||
        content.includes('BotCore')) {
        return true;
      }
    }

    return false;
  } catch (error) {
    return false;
  }
}

/**
 * Validate and normalize file path
 * @param inputPath User provided path
 * @returns Absolute path
 */
function validateAndNormalizePath(inputPath: string): string {
  let normalizedPath = path.resolve(inputPath);

  // Security check - ensure path is within current working directory
  const cwd = process.cwd();
  const prefix = cwd.endsWith(path.sep) ? cwd : cwd + path.sep;
  if (!normalizedPath.startsWith(prefix) && normalizedPath !== cwd) {
    throw new Error(`Path must be within current working directory: ${cwd}`);
  }

  return normalizedPath;
}

function buildManageCloudRunErrorMessage(action: ManageCloudRunInput["action"], serverName: string, error: unknown): string {
  const baseMessage = error instanceof Error ? error.message : String(error);
  const suggestions: string[] = [];

  if (/已有部署发布任务运行中|部署发布任务运行中/i.test(baseMessage)) {
    suggestions.push(`服务 \`${serverName}\` 当前已有部署任务在执行，请等待现有任务完成后再重试。`);
    suggestions.push("如果你确认要覆盖当前流程，可在合适时机使用 `force=true` 再次发起。");
  }

  if (suggestions.length === 0) {
    suggestions.push("请检查服务状态、部署参数和目标目录后重试。");
  }

  return `[manageCloudRun/${action}] ${baseMessage}\n建议：${suggestions.join(" ")}`;
}

function getCloudRunQueryServerName(input: queryCloudRunInput): string | undefined {
  return input.detailServerName || input.serverName;
}

function normalizeProcessLogText(logs: unknown[]): string {
  return logs
    .map((log) => {
      if (typeof log === "string") {
        return log;
      }

      if (log && typeof log === "object") {
        if ("Log" in log && typeof log.Log === "string") {
          return log.Log;
        }

        if ("Text" in log && typeof log.Text === "string") {
          return log.Text;
        }

        return JSON.stringify(log);
      }

      return String(log);
    })
    .join("\n");
}

/**
 * Format CloudRun service info for display
 */


/**
 * Register CloudRun tools with the MCP server
 */
export function registerCloudRunTools(server: ExtendedMcpServer) {
  // 获取 cloudBaseOptions，如果没有则为 undefined
  const cloudBaseOptions = server.cloudBaseOptions;

  // 创建闭包函数来获取 CloudBase Manager
  const getManager = () => getCloudBaseManager({ cloudBaseOptions });

  // Tool 1: Get CloudRun service information (read operations)
  server.registerTool(
    "queryCloudRun",
    {
      title: "查询 CloudRun 服务信息",
      description: "查询云托管服务信息，支持获取服务列表、查询服务详情、获取可用模板列表和部署日志。返回的服务信息包括服务名称、状态、访问类型、配置详情以及最近部署上下文。",
      inputSchema: queryCloudRunInputSchema,
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
        category: "cloudrun"
      }
    },
    async (args: queryCloudRunInput) => {
      const input = args;
      const manager = await getManager();

      if (!manager) {
        throw new Error("Failed to initialize CloudBase manager. Please check your credentials and environment configuration.");
      }

      const cloudrunService = manager.cloudrun;

      switch (input.action) {
        case 'list': {
            const listParams: any = {
              pageSize: input.pageSize,
              pageNum: input.pageNum,
            };

            if (input.serverName) {
              listParams.serverName = input.serverName;
            }

            if (input.serverType) {
              listParams.serverType = input.serverType;
            }

            const result = await cloudrunService.list(listParams);

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    success: true,
                    data: {
                      services: result.ServerList || [],
                      pagination: {
                        total: result.Total || 0,
                        pageSize: input.pageSize,
                        pageNum: input.pageNum,
                        totalPages: Math.ceil((result.Total || 0) / (input.pageSize || 10))
                      }
                    },
                    message: `Found ${result.ServerList?.length || 0} CloudRun services`
                  }, null, 2)
                }
              ]
            };
          }

          case 'detail': {
            const serverName = getCloudRunQueryServerName(input);

            if (!serverName) {
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify({
                      success: false,
                      error: "detailServerName or serverName is required for detail action",
                      message: "Please provide detailServerName or serverName."
                    }, null, 2)
                  }
                ]
              };
            }

            const result = await cloudrunService.detail({ serverName });

            if (!result) {
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify({
                      success: false,
                      error: `Service '${serverName}' not found`,
                      message: "Please check the service name and try again."
                    }, null, 2)
                  }
                ]
              };
            }

            let latestDeploy: any = null;
            let deployRecordsWarning: string | undefined;
            let message: string;

            try {
              const deployRecords: any = await cloudrunService.getDeployRecords({ serverName });
              latestDeploy = deployRecords?.DeployRecords?.[0] ?? null;

              if (!latestDeploy) {
                message = `Retrieved details for service '${serverName}'. No deploy records found yet.`;
              } else if (typeof latestDeploy.Status === 'string' && latestDeploy.Status.includes('failed')) {
                message = `Service '${serverName}' latest deploy failed. Please use queryCloudRun(action="getDeployLog") for details.`;
              } else if (typeof latestDeploy.Status === 'string' && latestDeploy.Status.includes('creating')) {
                message = `Service '${serverName}' latest deploy is still running. Please check again later or query the deploy log for progress.`;
              } else {
                message = `Retrieved details for service '${serverName}'. Latest service status: ${result.BaseInfo?.Status || 'unknown'}, latest deploy status: ${latestDeploy.Status || 'unknown'}.`;
              }
            } catch (error) {
              const baseMessage = error instanceof Error ? error.message : String(error);
              deployRecordsWarning = `Failed to fetch deploy records: ${baseMessage}`;
              message = `Retrieved details for service '${serverName}', but deploy records are currently unavailable.`;
            }

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    success: true,
                    data: {
                      service: result,
                      latestDeploy,
                      ...(deployRecordsWarning ? { deployRecordsWarning } : {})
                    },
                    message
                  }, null, 2)
                }
              ]
            };
          }

          case 'templates': {
            const result = await cloudrunService.getTemplates();

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    success: true,
                    data: {
                      templates: result || []
                    },
                    message: `Found ${result?.length || 0} available templates`
                  }, null, 2)
                }
              ]
            };
          }

          case 'getDeployLog': {
            const serverName = getCloudRunQueryServerName(input);

            if (!serverName) {
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify({
                      success: false,
                      error: "detailServerName or serverName is required for getDeployLog action",
                      message: "Please provide detailServerName or serverName."
                    }, null, 2)
                  }
                ]
              };
            }

            const deployRecords: any = await cloudrunService.getDeployRecords({ serverName });
            const latestDeploy = deployRecords?.DeployRecords?.[0];

            if (!latestDeploy) {
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify({
                      success: false,
                      error: `Service '${serverName}' has no deploy records.`,
                      message: "Please deploy the service first, then query the deploy log again."
                    }, null, 2)
                  }
                ]
              };
            }

            const buildId = input.buildId ?? latestDeploy.BuildId;
            const buildLogResult: any = await cloudrunService.getBuildLog({
              serverName,
              buildId,
            });

            let processLogs: unknown[] = [];
            let processLogsWarning: string | undefined;

            if (latestDeploy.RunId && typeof cloudrunService.getProcessLog === 'function') {
              try {
                const processLogResult: any = await cloudrunService.getProcessLog({
                  RunId: latestDeploy.RunId,
                });
                processLogs = processLogResult?.Logs || [];
              } catch (error) {
                processLogsWarning = error instanceof Error ? error.message : String(error);
              }
            }

            const buildLogText = typeof buildLogResult?.Log?.Text === 'string' ? buildLogResult.Log.Text : '';
            const processLogText = Array.isArray(processLogs) && processLogs.length > 0 ? normalizeProcessLogText(processLogs) : '';
            const combinedLogText = [buildLogText, processLogText].filter(Boolean).join('\n');

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    success: true,
                    data: {
                      buildId,
                      deployRecord: latestDeploy,
                      buildLog: buildLogResult?.Log || null,
                      processLogs,
                      combinedLogText,
                      ...(processLogsWarning ? { processLogsWarning } : {})
                    },
                    message: `Retrieved deploy log for service '${serverName}'`
                  }, null, 2)
                }
              ]
            };
          }

        default:
          throw new Error(`Unsupported action: ${input.action}`);
      }
    }
  );

  // Track local running processes for CloudRun function services
  const runningProcesses = new Map<string, number>();

  // Tool 2: Manage CloudRun services (write operations)
  server.registerTool(
    "manageCloudRun",
    {
      title: "管理 CloudRun 服务",
      description: "管理云托管服务，按开发顺序支持：初始化项目（可从模板开始，模板列表可通过 queryCloudRun 查询）、下载服务代码、本地运行（仅函数型服务）、部署代码、删除服务。部署可配置CPU、内存、实例数、访问类型等参数。删除操作需要确认，建议设置force=true。",
      inputSchema: ManageCloudRunInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
        category: "cloudrun"
      }
    },
    async (args: ManageCloudRunInput) => {
      const input = args;
      const manager = await getManager();

      if (!manager) {
        throw new Error("Failed to initialize CloudBase manager. Please check your credentials and environment configuration.");
      }

      const cloudrunService = manager.cloudrun;
      let targetPath: string | undefined;

      if (input.targetPath) {
        targetPath = validateAndNormalizePath(input.targetPath);
      }

      switch (input.action) {
        case 'createAgent': {
            if (!targetPath) {
              throw new Error("targetPath is required for createAgent operation");
            }

            if (!input.agentConfig) {
              throw new Error("agentConfig is required for createAgent operation");
            }

            const { agentName, botTag, description, template = 'blank' } = input.agentConfig;

            // Generate BotId
            const botId = botTag ? `ibot-${agentName}-${botTag}` : `ibot-${agentName}-${Date.now()}`;

            // Create Agent using CloudBase Manager
            const agentResult = await manager.agent.createFunctionAgent(targetPath, {
              Name: agentName,
              BotId: botId,
              Introduction: description || `Agent created by ${agentName}`,
              Avatar: undefined
            });

            // Create project directory
            const projectDir = path.join(targetPath, input.serverName);
            if (!fs.existsSync(projectDir)) {
              fs.mkdirSync(projectDir, { recursive: true });
            }

            // Generate package.json
            const packageJson = {
              name: input.serverName,
              version: "1.0.0",
              description: description || `Agent created by ${agentName}`,
              main: "index.js",
              scripts: {
                "dev": "tcb cloudrun run --runMode=agent -w",
                "deploy": "tcb cloudrun deploy",
                "start": "node index.js"
              },
              dependencies: {
                "@cloudbase/aiagent-framework": "^1.0.0-beta.10"
              },
              devDependencies: {
                "@cloudbase/cli": "^2.6.16"
              }
            };

            fs.writeFileSync(path.join(projectDir, 'package.json'), JSON.stringify(packageJson, null, 2));

            // Generate index.js with Agent template
            const indexJsContent = `const { IBot } = require("@cloudbase/aiagent-framework");
const { BotRunner } = require("@cloudbase/aiagent-framework");

const ANSWER = "你好，我是一个智能体，但我只会说这一句话。";

/**
 * @typedef {import('@cloudbase/aiagent-framework').IAbstractBot} IAbstractBot
 * 
 * @class
 * @implements {IAbstractBot}
 */
class MyBot extends IBot {
  async sendMessage() {
    return new Promise((res) => {
      // 创建个字符数组
      const charArr = ANSWER.split("");
      const interval = setInterval(() => {
        // 定时循环从数组中去一个字符
        const char = charArr.shift();
        if (typeof char === "string") {
          // 有字符时，发送 SSE 消息给客户端
          this.sseSender.send({ data: { content: char } });
        } else {
          // 字符用光后，结束定时循环
          clearInterval(interval);
          // 结束 SSE
          this.sseSender.end();
          res();
        }
      }, 50);
    });
  }
}

/**
 * 类型完整定义请参考：https://docs.cloudbase.net/cbrf/how-to-writing-functions-code#%E5%AE%8C%E6%95%B4%E7%A4%BA%E4%BE%8B
 * "{demo: string}"" 为 event 参数的示例类型声明，请根据实际情况进行修改
 * 需要 \`pnpm install\` 安装依赖后类型提示才会生效
 * 
 * @type {import('@cloudbase/functions-typings').TcbEventFunction<unknown>}
 */
exports.main = function (event, context) {
  return BotRunner.run(event, context, new MyBot(context));
};
`;

            fs.writeFileSync(path.join(projectDir, 'index.js'), indexJsContent);

            // Generate cloudbaserc.json
            const currentEnvId = await getEnvId(cloudBaseOptions);
            const cloudbasercContent = {
              envId: currentEnvId,
              cloudrun: {
                name: input.serverName
              }
            };

            fs.writeFileSync(path.join(projectDir, 'cloudbaserc.json'), JSON.stringify(cloudbasercContent, null, 2));

            // Generate README.md
            const readmeContent = `# ${agentName} Agent

这是一个基于函数型云托管的 AI 智能体。

## 开发

\`\`\`bash
# 安装依赖
npm install

# 本地开发
npm run dev

# 部署
npm run deploy
\`\`\`

## 调用方式

### 命令行测试
\`\`\`bash
curl 'http://127.0.0.1:3000/v1/aibot/bots/${botId}/send-message' \\
  -H 'Accept: text/event-stream' \\
  -H 'Content-Type: application/json' \\
  --data-raw '{"msg":"hi"}'
\`\`\`

### Web 调用
\`\`\`html
<script src="https://static.cloudbase.net/cloudbase-js-sdk/latest/cloudbase.full.js"></script>
<script>
const app = cloudbase.init({ env: "your-env-id" });
const auth = app.auth();
await auth.signInAnonymously();
const ai = app.ai();
const res = await ai.bot.sendMessage({
  botId: "${botId}",
  msg: "hi",
});
for await (let x of res.textStream) {
  console.log(x);
}
</script>
\`\`\`
`;

            fs.writeFileSync(path.join(projectDir, 'README.md'), readmeContent);

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    success: true,
                    data: {
                      agentName: agentName,
                      botId: botId,
                      projectDir: projectDir,
                      serverName: input.serverName,
                      template: template,
                      filesCreated: ['package.json', 'index.js', 'cloudbaserc.json', 'README.md']
                    },
                    message: `Successfully created Agent '${agentName}' with BotId '${botId}' in ${projectDir}`
                  }, null, 2)
                }
              ]
            };
          }

          case 'deploy': {
            if (!targetPath) {
              throw new Error("targetPath is required for deploy operation");
            }

            // Determine service type - use input.serverType if provided, otherwise auto-detect
            let serverType: 'function' | 'container';
            if (input.serverType) {
              serverType = input.serverType;
            } else {
              try {
                // First try to get existing service details
                const details = await cloudrunService.detail({ serverName: input.serverName });
                serverType = details.BaseInfo?.ServerType || 'container';
              } catch (e) {
                // If service doesn't exist, determine by project structure
                const dockerfilePath = path.join(targetPath, 'Dockerfile');
                if (fs.existsSync(dockerfilePath)) {
                  serverType = 'container';
                } else {
                  // Check if it's a Node.js function project (has package.json with specific structure)
                  const packageJsonPath = path.join(targetPath, 'package.json');
                  if (fs.existsSync(packageJsonPath)) {
                    try {
                      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
                      // If it has function-specific dependencies or scripts, treat as function
                      if (packageJson.dependencies?.['@cloudbase/aiagent-framework'] ||
                        packageJson.scripts?.['dev']?.includes('cloudrun run')) {
                        serverType = 'function';
                      } else {
                        serverType = 'container';
                      }
                    } catch (parseError) {
                      serverType = 'container';
                    }
                  } else {
                    // No package.json, default to container
                    serverType = 'container';
                  }
                }
              }
            }

            const deployParams: any = {
              serverName: input.serverName,
              targetPath: targetPath,
              force: input.force,
              serverType: serverType,
            };

            // Add server configuration if provided
            if (input.serverConfig) {
              deployParams.serverConfig = input.serverConfig;
            }

            let result: unknown;
            try {
              result = await cloudrunService.deploy(deployParams);
            } catch (error) {
              throw new Error(buildManageCloudRunErrorMessage('deploy', input.serverName, error));
            }

            // Generate cloudbaserc.json configuration file
            const currentEnvId = await getEnvId(cloudBaseOptions);
            const cloudbasercPath = path.join(targetPath, 'cloudbaserc.json');
            const cloudbasercContent = {
              envId: currentEnvId,
              cloudrun: {
                name: input.serverName
              }
            };
            const consoleUrl = `https://tcb.cloud.tencent.com/dev?envId=${currentEnvId}#/platform-run/service/detail?serverName=${input.serverName}&tabId=overview&envId=${currentEnvId}`;

            try {
              fs.writeFileSync(cloudbasercPath, JSON.stringify(cloudbasercContent, null, 2));
            } catch (error) {
              debug('cloudbaserc.json creation skipped:', error instanceof Error ? error : new Error(String(error)));
            }

            // Send deployment notification to CodeBuddy IDE
            try {
              // Query service details to get access URL
              let serviceUrl = "";
              try {
                const serviceDetails = await cloudrunService.detail({ serverName: input.serverName });
                // Extract access URL from service details
                // Priority: DefaultDomainName > CustomDomainName > PublicDomain > InternalDomain
                const details = serviceDetails as any; // Use any to access dynamic properties
                if (details?.BaseInfo?.DefaultDomainName) {
                  // DefaultDomainName is already a complete URL (e.g., https://...)
                  serviceUrl = details.BaseInfo.DefaultDomainName;
                } else if (details?.BaseInfo?.CustomDomainName) {
                  // CustomDomainName might be a domain without protocol
                  const customDomain = details.BaseInfo.CustomDomainName;
                  serviceUrl = customDomain.startsWith('http') ? customDomain : `https://${customDomain}`;
                } else if (details?.BaseInfo?.PublicDomain) {
                  serviceUrl = `https://${details.BaseInfo.PublicDomain}`;
                } else if (details?.BaseInfo?.InternalDomain) {
                  serviceUrl = `https://${details.BaseInfo.InternalDomain}`;
                } else if (details?.AccessInfo?.PublicDomain) {
                  serviceUrl = `https://${details.AccessInfo.PublicDomain}`;
                } else {
                  serviceUrl = ""; // URL not available
                }
              } catch (detailErr) {
                // If query fails, continue with empty URL
                serviceUrl = "";
              }

              // Extract project name from targetPath
              const projectName = path.basename(targetPath);

              // Send notification
              await sendDeployNotification(server, {
                deployType: 'cloudrun',
                url: serviceUrl,
                projectId: currentEnvId,
                projectName: projectName,
                consoleUrl: consoleUrl
              });
            } catch (notifyErr) {
              // Notification failure should not affect deployment flow
              // Error is already logged in sendDeployNotification
            }

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    success: true,
                    data: {
                      serviceName: input.serverName,
                      status: 'deploying',
                      deployPath: targetPath,
                      serverType: serverType,
                      cloudbasercGenerated: true,
                      consoleUrl
                    },
                    message: `Triggered deployment for ${serverType} service '${input.serverName}' from ${targetPath}. You can follow the progress in ${consoleUrl}`
                  }, null, 2)
                }
              ]
            };
          }

          case 'run': {
            if (!targetPath) {
              throw new Error("targetPath is required for run operation");
            }

            // Do not support container services locally: basic heuristic - if Dockerfile exists, treat as container
            const dockerfilePath = path.join(targetPath, 'Dockerfile');
            if (fs.existsSync(dockerfilePath)) {
              throw new Error("Local run is only supported for function-type CloudRun services. Container services are not supported.");
            }

            // Check if this is an Agent project
            const isAgent = checkIfAgentProject(targetPath);
            const runMode = input.runOptions?.runMode || (isAgent ? 'agent' : 'normal');

            // Check if service is already running and verify process exists
            if (runningProcesses.has(input.serverName)) {
              const existingPid = runningProcesses.get(input.serverName)!;
              try {
                // Check if process actually exists
                process.kill(existingPid, 0);
                return {
                  content: [
                    {
                      type: "text",
                      text: JSON.stringify({
                        success: true,
                        data: {
                          serviceName: input.serverName,
                          status: 'running',
                          pid: existingPid,
                          cwd: targetPath
                        },
                        message: `Service '${input.serverName}' is already running locally (pid=${existingPid})`
                      }, null, 2)
                    }
                  ]
                };
              } catch (error) {
                // Process doesn't exist, remove from tracking
                runningProcesses.delete(input.serverName);
              }
            }

            const runPort = input.runOptions?.port ?? 3000;
            const extraEnv = input.runOptions?.envParams ?? {};

            // Set environment variables for functions-framework
            const env = {
              ...process.env,
              PORT: String(runPort),
              ...extraEnv,
              // Add functions-framework specific environment variables
              ENABLE_CORS: 'true',
              ALLOWED_ORIGINS: '*'
            };

            // Choose execution method based on run mode
            let child;
            const script = `const { runCLI } = require('@cloudbase/functions-framework'); runCLI();`;

            if (runMode === 'agent') {
              const childEnv = {
                ...env,
                PORT: String(runPort),
                ENABLE_CORS: 'true',
                ALLOWED_ORIGINS: '*',
                RUN_MODE: 'agent',
                ...extraEnv,
              };
              child = spawn(process.execPath, ['-e', script], {
                cwd: targetPath,
                env: childEnv,
                stdio: ['ignore', 'pipe', 'pipe'],
                detached: true
              });
            } else {
              const childEnv = {
                ...env,
                PORT: String(runPort),
                ENABLE_CORS: 'true',
                ALLOWED_ORIGINS: '*',
                ...extraEnv,
              };
              child = spawn(process.execPath, ['-e', script], {
                cwd: targetPath,
                env: childEnv,
                stdio: ['ignore', 'pipe', 'pipe'],
                detached: true
              });
            }

            // Handle process exit to clean up tracking
            child.on('exit', (code, signal) => {
              runningProcesses.delete(input.serverName);
            });

            child.on('error', (error) => {
              runningProcesses.delete(input.serverName);
            });

            child.unref();
            if (typeof child.pid !== 'number') {
              throw new Error('Failed to start local process: PID is undefined.');
            }
            runningProcesses.set(input.serverName, child.pid);

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    success: true,
                    data: {
                      serviceName: input.serverName,
                      status: 'running',
                      pid: child.pid,
                      port: runPort,
                      runMode: runMode,
                      isAgent: isAgent,
                      command: script,
                      cwd: targetPath
                    },
                    message: `Started local run for ${runMode} service '${input.serverName}' on port ${runPort} (pid=${child.pid})`
                  }, null, 2)
                }
              ]
            };
          }

          case 'download': {
            if (!targetPath) {
              throw new Error("targetPath is required for download operation");
            }

            const result = await cloudrunService.download({
              serverName: input.serverName,
              targetPath: targetPath,
            });

            // Generate cloudbaserc.json configuration file
            const currentEnvId = await getEnvId(cloudBaseOptions);
            const cloudbasercPath = path.join(targetPath, 'cloudbaserc.json');
            const cloudbasercContent = {
              envId: currentEnvId,
              cloudrun: {
                name: input.serverName
              }
            };

            try {
              fs.writeFileSync(cloudbasercPath, JSON.stringify(cloudbasercContent, null, 2));
            } catch (error) {
              debug('cloudbaserc.json creation skipped:', error instanceof Error ? error : new Error(String(error)));
            }

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    success: true,
                    data: {
                      serviceName: input.serverName,
                      downloadPath: targetPath,
                      filesCount: 0,
                      cloudbasercGenerated: true
                    },
                    message: `Successfully downloaded service '${input.serverName}' to ${targetPath}`
                  }, null, 2)
                }
              ]
            };
          }

          case 'delete': {
            if (!input.force) {
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify({
                      success: false,
                      error: "Delete operation requires confirmation",
                      message: "Please set force: true to confirm deletion of the service. This action cannot be undone."
                    }, null, 2)
                  }
                ]
              };
            }

            const result = await cloudrunService.delete({
              serverName: input.serverName,
            });

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    success: true,
                    data: {
                      serviceName: input.serverName,
                      status: 'deleted'
                    },
                    message: `Successfully deleted service '${input.serverName}'`
                  }, null, 2)
                }
              ]
            };
          }

          case 'init': {
            if (!targetPath) {
              throw new Error("targetPath is required for init operation");
            }

            const result = await cloudrunService.init({
              serverName: input.serverName,
              targetPath: targetPath,
              template: input.template,
            });

            // Generate cloudbaserc.json configuration file
            const currentEnvId = await getEnvId(cloudBaseOptions);
            const cloudbasercPath = path.join(targetPath, input.serverName, 'cloudbaserc.json');
            const cloudbasercContent = {
              envId: currentEnvId,
              cloudrun: {
                name: input.serverName
              }
            };

            try {
              fs.writeFileSync(cloudbasercPath, JSON.stringify(cloudbasercContent, null, 2));
            } catch (error) {
              debug('cloudbaserc.json creation skipped:', error instanceof Error ? error : new Error(String(error)));
            }

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    success: true,
                    data: {
                      serviceName: input.serverName,
                      template: input.template,
                      initPath: targetPath,
                      projectDir: result.projectDir || path.join(targetPath, input.serverName),
                      cloudbasercGenerated: true
                    },
                    message: `Successfully initialized service '${input.serverName}' with template '${input.template}' at ${targetPath}`
                  }, null, 2)
                }
              ]
            };
          }

        default:
          throw new Error(`Unsupported action: ${input.action}`);
      }
    }
  );
}
