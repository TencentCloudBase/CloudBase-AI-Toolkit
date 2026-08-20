import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { z } from "zod";
import { getCloudBaseManager, getEnvId } from '../cloudbase-manager.js';
import { ExtendedMcpServer } from '../server.js';
import type { CloudBaseOptions } from '../types.js';
import { debug } from '../utils/logger.js';
import { preferGatewayOrFallback, resolveGatewayAccessUrls } from '../utils/gateway-access-urls.js';
import { sendDeployNotification } from '../utils/notification.js';
import { buildCamAuthGuidance, isCamAuthError } from './capi.js';
import {
  listLikelyRedeployFields,
  mergeCloudRunServerConfig,
  parseServerConfigToDiffItems,
  summarizeConfigSnapshot,
  type CloudRunServerConfigLike,
} from './cloudrun-config.js';

// CloudRun service types
export const CLOUDRUN_SERVICE_TYPES = ['function', 'container'] as const;
export type CloudRunServiceType = typeof CLOUDRUN_SERVICE_TYPES[number];

// CloudRun access types
export const CLOUDRUN_ACCESS_TYPES = ['OA', 'PUBLIC', 'MINIAPP', 'VPC'] as const;
export type CloudRunAccessType = typeof CLOUDRUN_ACCESS_TYPES[number];

// CloudRun env package types (CreateCloudRunEnv.PackageType)
export const CLOUDRUN_PACKAGE_TYPES = ['Trial', 'Standard', 'Professional', 'Enterprise'] as const;
export type CloudRunPackageType = typeof CLOUDRUN_PACKAGE_TYPES[number];

// Input schema for queryCloudRun tool
const queryCloudRunInputSchema = {
  action: z.enum(['list', 'detail', 'templates', 'getDeployLog', 'getProcessLog', 'getDeployRecords', 'envStatus']).describe('查询操作类型：list=获取云托管服务列表（支持分页和筛选），detail=查询指定服务的详细信息（包含服务配置和最新部署状态），templates=获取可用的项目模板列表（用于初始化新项目），getDeployLog=获取构建日志（仅云端源码构建有意义，走 CODING/DescribeCloudRunBuildLog；已有镜像部署无构建过程；未登录 CODING 的账号会报错），getProcessLog=获取运行日志（部署阶段步骤+容器启动/运行日志，走 tcbr/DescribeCloudRunProcessLog；镜像部署与源码构建均可用，不依赖 CODING；RunId 来自 detail/getDeployRecords 的 latestDeploy.RunId），getDeployRecords=获取指定服务的部署记录列表（按部署时间倒序，含 BuildId/RunId/FlowRatio/Status 等字段，用于查看历史发布与回滚上下文），envStatus=查询当前环境云托管是否已开通及开通状态（Status=creating开通中/normal已开通），用于initEnv之后轮询进度或deploy之前确认环境是否就绪'),

  // List operation parameters
  pageSize: z.number().min(1).max(100).optional().default(10).describe('分页大小，控制每页返回的服务数量。取值范围：1-100，默认值：10。建议根据网络性能和显示需求调整'),
  pageNum: z.number().min(1).optional().default(1).describe('页码，用于分页查询。从1开始，默认值：1。配合pageSize使用可实现分页浏览'),
  serverName: z.string().optional().describe('服务名称筛选条件，支持模糊匹配。例如：输入"test"可匹配"test-service"、"my-test-app"等服务名称。留空则查询所有服务'),
  serverType: z.enum(CLOUDRUN_SERVICE_TYPES).optional().describe('服务类型筛选条件：function=函数型云托管（仅支持Node.js，有特殊的开发要求和限制，适合简单的API服务），container=容器型服务（推荐使用，支持任意语言和框架如Java/Go/Python/PHP/.NET等，适合大多数应用场景）'),
  envId: z.string().optional().describe('环境 ID（action=envStatus 时使用；不传则使用当前配置的环境）。格式如 env-xxxxxx'),

  // Detail and log operation parameters
  detailServerName: z.string().optional().describe('要查询详细信息、部署记录、构建日志或运行日志的服务名称。当action为detail、getDeployLog、getProcessLog或getDeployRecords时建议提供，必须是已存在的服务名称。可通过list操作获取可用的服务名称列表'),
  buildId: z.number().optional().describe('构建ID，仅在action=getDeployLog时使用（构建日志，仅云端源码构建）。不传时默认返回最近一次部署的构建日志'),
  runId: z.string().optional().describe('运行ID（RunId），仅在action=getProcessLog时使用。不传时默认取该服务最近一次部署记录的 RunId（与 detail/getDeployRecords 的 latestDeploy.RunId 同源）。镜像部署与源码构建均可查询运行日志'),
};

// Input schema for manageCloudRun tool
const ManageCloudRunInputSchema = {
  action: z.enum(['init', 'download', 'run', 'deploy', 'delete', 'createAgent', 'updateConfig', 'initEnv', 'traffic']).describe('云托管服务管理操作类型：init=从模板初始化新的云托管项目代码（在targetPath目录下创建以serverName命名的子目录，支持多种语言和框架模板），download=从云端下载现有服务的代码到本地进行开发，run=在本地运行函数型云托管服务（用于开发和调试，仅支持函数型服务），deploy=触发部署并轻量等待任务注册（不会 hang 等完整构建）。源码构建（targetPath）返回 buildId，用 getDeployLog 轮询后再 getProcessLog；已有镜像部署（imageUrl，DeployType=image，BuildId 常为 0）跳过 getDeployLog，用 detail/getDeployRecords 取 RunId 后 getProcessLog。传 imageUrl 时 targetPath 可省略；已存在服务会 Read-Merge-Write 保留远程 VpcConf/EnvParams/OpenAccessTypes），updateConfig=仅更新服务配置不重新上传代码（对齐控制台服务设置，走 SubmitServerConfigChangeDiff；不需要 targetPath），delete=删除指定的云托管服务（不可恢复，需要确认），createAgent=创建函数型Agent（基于函数型云托管开发AI智能体），initEnv=开通当前环境的云托管（异步创建云托管环境，幂等：已开通直接返回；适合新环境首次部署前使用），traffic=流量管理与灰度发布（set=调整稳定版/灰度版流量比例，promote=将灰度版本升级为全量，rollback=回滚到上一个稳定版本；对应 tcb cloudrun traffic 命令）'),
  serverName: z.string().describe('云托管服务名称，用于标识和管理服务。命名规则：支持大小写字母、数字、连字符和下划线，必须以字母开头，长度3-45个字符。在init操作中会作为在targetPath下创建的子目录名，在其他操作中作为目标服务名。initEnv 操作不需要此参数'),

  // Traffic management operation parameters (action=traffic)
  trafficOp: z.enum(['set', 'promote', 'rollback']).optional().describe('流量管理子操作（action=traffic 时使用）：set=调整灰度流量比例（需先部署新版本至灰度，通过 stablePercent/canaryPercent 设置稳定版与灰度版流量比例，两者之和必须等于100）；promote=将灰度版本全量发布（灰度版本流量置为100%并关闭灰度发布，等价于 tcb cloudrun traffic promote）；rollback=回滚到上一个稳定版本（停止当前灰度/发布中的版本，回到稳定版本，等价于 tcb cloudrun traffic rollback）'),
  stablePercent: z.number().min(0).max(100).optional().describe('稳定版本流量比例（trafficOp=set 时使用），取值范围0-100。与 canaryPercent 之和必须等于100。例如希望 90% 流量打到稳定版、10% 打到灰度版，则 stablePercent=90, canaryPercent=10'),
  canaryPercent: z.number().min(0).max(100).optional().describe('灰度版本流量比例（trafficOp=set 时使用），取值范围0-100。与 stablePercent 之和必须等于100。例如希望 90% 流量打到稳定版、10% 打到灰度版，则 stablePercent=90, canaryPercent=10'),

  // InitEnv operation parameters
  envId: z.string().optional().describe('环境 ID（action=initEnv 时使用；不传则使用当前配置的环境）。格式如 env-xxxxxx'),
  packageType: z.enum(CLOUDRUN_PACKAGE_TYPES).optional().default('Trial').describe('云托管环境套餐类型（action=initEnv 时使用）：Trial=试用，Standard=标准，Professional=专业，Enterprise=企业。默认 Trial'),
  vpcId: z.string().optional().describe('VPC 网络 ID（action=initEnv 时可选）。当平台拒绝系统创建网络时必填，格式如 vpc-xxxxxxxx。与 subnetIds 一起透传给 CreateCloudRunEnv 的 VpcId/SubNetIds。多数场景可不传（由系统创建网络）'),
  subnetIds: z.array(z.string()).optional().describe('子网 ID 列表（action=initEnv 时可选）。当需指定自有 VPC 时必填，如 ["subnet-xxxxxxxx"]。与 vpcId 一起透传给 CreateCloudRunEnv 的 SubNetIds'),

  // Deploy operation parameters
  targetPath: z.string().optional().describe('本地代码路径，必须是绝对路径。在deploy操作中指定要部署的代码目录，在download操作中指定下载目标目录，在init操作中指定云托管服务的上级目录（会在该目录下创建以serverName命名的子目录）。updateConfig 不需要此参数。建议约定：项目根目录下的cloudrun/目录，例如：/Users/username/projects/my-project/cloudrun。使用 imageUrl 部署已有镜像时此参数可省略。注意：本地有源码目录不等于必须走源码构建；若用户指定镜像请优先传 imageUrl，不要仅因存在 targetPath 就回退到源码构建'),
  imageUrl: z.string().optional().describe('已有镜像部署（action=deploy 时使用）：直接指定容器镜像地址，如 ccr.ccs.tencentyun.com/ns/img:v1 或公网 registry 地址。传入后走 DeployType="image"（容器型）部署，无需本地源码目录（targetPath 可省略）。支持：1) 公网匿名可拉取的镜像直填地址；2) 私有/需登录的镜像（如 ghcr.io）需先在本地 docker pull → docker tag/push 到腾讯云 CCR → 填入 CCR 地址。不传则维持源码构建（本地代码打包上传）。约束：若用户明确提到使用某个镜像、或无需重新构建代码，则必须传 imageUrl 走镜像部署，不要回退到源码构建。注意：无论哪种部署方式，环境都需先开通云托管（未开通时先调用 initEnv，Status=normal 后再部署）'),
  envParamsReplaceAll: z.boolean().optional().default(false).describe('EnvParams 合并策略（deploy / updateConfig）：false（默认）= 与远程按 key 合并（输入覆盖同名 key，远程其余 key 保留）；true= 用输入 EnvParams 整包替换远程。仅当显式传入 EnvParams 时生效'),
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
    EnvParams: z.string().optional().describe('环境变量配置，JSON字符串格式。用于传递配置信息给服务代码，如\'{"DATABASE_URL":"postgres://user:pass@10.x.x.x:5432/db","NODE_ENV":"production"}\'。SDK v5.6.1+ 会自动对传入的环境变量进行 AES-256-CBC 加密传输。⚠️ 若 EnvParams 含 DATABASE_URL / MYSQL_* / POSTGRES_* / REDIS_* 等传统 TCP 连库变量，必须同时配置 VpcConf，否则实例通常无法访问 VPC 内数据库'),
    Dockerfile: z.string().optional().describe('Dockerfile文件名配置，仅容器型服务需要。指定用于构建容器镜像的Dockerfile文件路径，默认为项目根目录下的Dockerfile'),
    BuildDir: z.string().optional().describe('构建目录配置，指定代码构建的目录路径。当代码结构与标准不同时使用，默认为项目根目录'),
    InternalAccess: z.string().optional().describe('内网访问开关配置，控制是否启用内网访问。true=启用内网访问（可通过云开发SDK直接调用），false=关闭内网访问（仅公网访问）'),
    InternalDomain: z.string().optional().describe('内网域名配置，用于配置服务的内网访问域名。仅在启用内网访问时有效'),
    EntryPoint: z.array(z.string()).optional().describe('Dockerfile EntryPoint参数配置，仅容器型服务需要。指定容器启动时的入口程序数组，如["node","app.js"]'),
    Cmd: z.array(z.string()).optional().describe('Dockerfile Cmd参数配置，仅容器型服务需要。指定容器启动时的默认命令数组，如["npm","start"]'),
    InitialDelaySeconds: z.number().min(0).optional().describe('端口健康检查初始延迟（秒）。部署完成后先等待 N 秒才开始端口探测，之后约每 5s 检查一次、连续约 30 次；30 次全失败才判定部署失败（约 150s 探测窗口），不是「N 秒后立即失败」。启动耗时长的应用建议调到 60–120'),
    LogType: z.string().optional().describe('日志类型配置，指定服务的日志收集类型。影响日志的采集方式和存储格式'),
    LogSetId: z.string().optional().describe('CLS日志集ID配置，指定日志服务（CLS）的日志集ID。需要先开通CLS日志服务'),
    LogTopicId: z.string().optional().describe('CLS日志主题ID配置，指定日志服务（CLS）的日志主题ID。需要先开通CLS日志服务'),
    LogParseType: z.string().optional().describe('日志解析类型配置，指定日志的解析方式。用于将原始日志解析为结构化数据'),
    Tag: z.string().optional().describe('服务标签配置，用于标识服务类型。如设置为"function:"表示函数型服务。SDK会自动根据配置生成'),
    OperationMode: z.string().optional().describe('运行模式配置，指定服务的运行模式。影响服务的调度和资源分配方式'),
    SessionAffinity: z.string().optional().describe('会话保持配置，用于控制是否启用会话保持功能。启用后会将同一客户端的请求路由到同一实例'),
    TimerScale: z.array(z.object({
      CycleType: z.enum(['none', 'daily', 'weekly', 'monthly']).describe('循环类型：none=无循环，daily=每日循环，weekly=每周循环，monthly=每月循环'),
      StartDate: z.string().optional().describe('循环起始日期，格式：YYYY-MM-DD'),
      EndDate: z.string().optional().describe('循环结束日期，格式：YYYY-MM-DD'),
      StartTime: z.string().describe('起始时间，格式：HH:mm:ss'),
      EndTime: z.string().describe('结束时间，格式：HH:mm:ss'),
      ReplicaNum: z.number().min(0).describe('定时扩缩容的目标副本数，最小值0（缩容到0）')
    })).optional().describe('定时扩缩容配置数组，用于配置服务的定时自动扩缩容策略。可配置多个时间段的扩缩容计划，支持每日/每周/每月循环'),
    VpcConf: z.object({
      VpcId: z.string().describe('VPC网络ID，格式如 vpc-xxxxxxxx。必须与目标数据库/Redis 处于同一地域，并优先选择同一 VPC。禁止猜测或使用占位符；须来自数据库控制台、已有资源详情、callCloudApi 或用户确认。建议首次创建即配置；已存在服务也可在 deploy 时传入，部署后必须用 queryCloudRun detail 复核是否生效'),
      SubnetId: z.string().describe('子网ID，格式如 subnet-xxxxxxxx。云托管实例将占用该子网 IP，需确保有足够可用 IP'),
    }).optional().describe('VPC网络配置（实例出网/私有网络）。用于让云托管实例接入指定 VPC，从而内网访问 MySQL/PostgreSQL/Redis/CVM 等资源。与 OpenAccessTypes（外部如何访问本服务）是不同概念。TCP 连库场景必须配置。禁止猜测 VpcId/SubnetId，须来自数据库控制台、已有资源详情、callCloudApi 或用户确认。创建时映射为 SDK vpcInfo(CreateType=2)；已存在服务可用 updateConfig 或 deploy（RMW 会保留未传入的远程 VpcConf）。部署/更新后必须用 queryCloudRun detail 复核 ServerConfig.VpcConf'),
    VolumesConf: z.array(z.object({
      VolumeName: z.string().describe('存储卷名称'),
      VolumeType: z.string().describe('存储卷类型，如CFS表示云文件存储'),
      VolumePath: z.string().describe('存储卷挂载路径，服务代码中的目标路径')
    })).optional().describe('存储卷配置数组，用于挂载云存储（如CFS）到服务实例中。可用于持久化数据或共享文件'),
    PublicNetConf: z.object({
      PublicAccess: z.boolean().optional().describe('是否开启公网访问，true=开启公网访问，false=关闭公网访问'),
      PublicAccessPath: z.string().optional().describe('公网访问路径配置')
    }).optional().describe('公网访问配置，用于控制服务的公网访问策略。可配置是否开启公网访问及访问路径'),
  }).optional().describe('服务配置项，用于 deploy / updateConfig。包括资源规格、访问权限、环境变量、日志、网络等。deploy 未提供时对已存在服务仍会从远程合并保留 VpcConf/EnvParams/OpenAccessTypes；updateConfig 至少需要一个配置字段'),

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
  action: 'list' | 'detail' | 'templates' | 'getDeployLog' | 'getProcessLog' | 'getDeployRecords' | 'envStatus';
  pageSize?: number;
  pageNum?: number;
  serverName?: string;
  serverType?: CloudRunServiceType;
  detailServerName?: string;
  buildId?: number;
  runId?: string;
  envId?: string;
};

type ManageCloudRunInput = {
  action: 'init' | 'download' | 'run' | 'deploy' | 'delete' | 'createAgent' | 'updateConfig' | 'initEnv' | 'traffic';
  serverName: string;
  targetPath?: string;
  imageUrl?: string;
  serverConfig?: any;
  envParamsReplaceAll?: boolean;
  template?: string;
  force?: boolean;
  serverType?: CloudRunServiceType;
  envId?: string;
  packageType?: CloudRunPackageType;
  vpcId?: string;
  subnetIds?: string[];
  trafficOp?: 'set' | 'promote' | 'rollback';
  stablePercent?: number;
  canaryPercent?: number;
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
 * Validate and normalize file path.
 * Accepts absolute paths as-is; for relative paths, resolves against CWD and
 * ensures the result does not escape the CWD (path-traversal protection).
 * @param inputPath User provided path
 * @returns Absolute path
 */
function validateAndNormalizePath(inputPath: string): string {
  const normalizedPath = path.resolve(inputPath);

  // On Windows, path.resolve may return a path on a different drive/UNC share.
  // That is safe — the user explicitly provided an absolute path there.
  // Only apply the traversal check when the resolved path shares the same root
  // as CWD (i.e. the path was relative or on the same drive).
  const cwd = process.cwd();
  const cwdRoot = path.parse(cwd).root;
  const pathRoot = path.parse(normalizedPath).root;

  if (cwdRoot === pathRoot) {
    // Same filesystem root — ensure the resolved path is still inside CWD
    // (or is exactly CWD) to block "../" traversal.
    const prefix = cwd.endsWith(path.sep) ? cwd : cwd + path.sep;
    if (!normalizedPath.startsWith(prefix) && normalizedPath !== cwd) {
      throw new Error(`Path must be within current working directory: ${cwd}`);
    }
  }
  // Cross-root absolute paths (e.g. D:\ on Windows when CWD is C:\) are
  // allowed — the user own the machine and the path is explicitly absolute.

  return normalizedPath;
}

export function buildManageCloudRunErrorMessage(action: ManageCloudRunInput["action"] | string, serverName: string, error: unknown): string {
  const baseMessage = error instanceof Error ? error.message : String(error);
  const suggestions: string[] = [];

  if (isCamAuthError(baseMessage)) {
    suggestions.push(buildCamAuthGuidance());
  }

  if (/已有部署发布任务运行中|部署发布任务运行中/i.test(baseMessage)) {
    suggestions.push(`服务 \`${serverName}\` 当前已有部署任务在执行，请等待现有任务完成后再重试。`);
    suggestions.push("如果你确认要覆盖当前流程，可在合适时机使用 `force=true` 再次发起。");
  }

  if (/云托管资源未开通|无法使用系统创建网络|VpcInfo/i.test(baseMessage)) {
    suggestions.push(
      "CreateCloudRunServer 需要有效 VPC：请传 serverConfig.VpcConf（VpcId+SubnetId），" +
        "或在 initEnv 时传入 vpcId/subnetIds（环境开通后 deploy 会自动从 EnvBaseInfo 回填）。" +
        "若平台拒绝系统创建网络，必须指定上海地域 VPC。",
    );
  }

  if (suggestions.length === 0) {
    suggestions.push("请检查服务状态、部署参数和目标目录后重试。");
  }

  return `[manageCloudRun/${action}] ${baseMessage}\n建议：${suggestions.join(" ")}`;
}

/**
 * Lightweight wait after manageCloudRun deploy: poll until the platform has
 * registered the manage task / assigned identifiers for follow-up log queries.
 * - source builds: prefer BuildId > 0 (getDeployLog)
 * - image deploys: prefer RunId (getProcessLog; BuildId is often 0)
 * Does NOT wait for the full build/deploy (that can take 5–30 minutes).
 * Aligns with tcb CLI's DescribeServerManageTask polling entrypoint, but with
 * a short timeout suitable for MCP tool calls.
 */
export const CLOUDRUN_DEPLOY_REGISTRATION_MAX_WAIT_MS = 45_000;
export const CLOUDRUN_DEPLOY_REGISTRATION_INTERVAL_MS = 3_000;

export type CloudRunDeployRegistrationMode = "source" | "image";

export type CloudRunDeployRegistration = {
  registered: boolean;
  timedOut: boolean;
  taskId?: number;
  buildId?: number;
  runId?: string;
  taskStatus?: string;
  waitMs: number;
};

export type CloudRunDeployNextStep = {
  tool: "queryCloudRun";
  action: "getDeployLog" | "getProcessLog" | "getDeployRecords";
  suggested_args: Record<string, string | number>;
  note?: string;
};

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isValidCloudRunBuildId(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function isValidCloudRunRunId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function extractServerManageTaskInfo(resp: unknown): {
  taskId?: number;
  taskStatus?: string;
} {
  const data = (resp ?? {}) as Record<string, unknown>;
  const task = (data.Task ?? data.task ?? {}) as Record<string, unknown>;
  const rawId = task.Id ?? task.id;
  const rawStatus = task.Status ?? task.status;
  const taskId =
    typeof rawId === "number" && rawId > 0
      ? rawId
      : typeof rawId === "string" && /^\d+$/.test(rawId) && Number(rawId) > 0
        ? Number(rawId)
        : undefined;
  const taskStatus =
    typeof rawStatus === "string" && rawStatus.trim()
      ? rawStatus.trim()
      : undefined;
  return {
    ...(taskId !== undefined ? { taskId } : {}),
    ...(taskStatus ? { taskStatus } : {}),
  };
}

/**
 * Poll DescribeServerManageTask + getDeployRecords until the preferred
 * identifier appears:
 * - source (default): BuildId > 0 for getDeployLog
 * - image: RunId for getProcessLog (BuildId is often 0)
 * If only taskId is seen, keeps polling for the preferred id until maxWaitMs.
 */
export async function waitForCloudRunDeployRegistration(options: {
  manager: {
    commonService?: (
      service: string,
      version: string,
    ) => { call: (req: { Action: string; Param: Record<string, unknown> }) => Promise<unknown> };
  };
  cloudrunService: {
    getDeployRecords?: (params: { serverName: string }) => Promise<unknown>;
  };
  envId: string;
  serverName: string;
  mode?: CloudRunDeployRegistrationMode;
  maxWaitMs?: number;
  intervalMs?: number;
  sleepFn?: (ms: number) => Promise<void>;
}): Promise<CloudRunDeployRegistration> {
  const mode = options.mode ?? "source";
  const maxWaitMs = options.maxWaitMs ?? CLOUDRUN_DEPLOY_REGISTRATION_MAX_WAIT_MS;
  const intervalMs = options.intervalMs ?? CLOUDRUN_DEPLOY_REGISTRATION_INTERVAL_MS;
  const sleepFn = options.sleepFn ?? sleepMs;
  const startAt = Date.now();

  let lastTaskId: number | undefined;
  let lastTaskStatus: string | undefined;
  let lastBuildId: number | undefined;
  let lastRunId: string | undefined;

  // Immediate first probe, then interval retries until timeout.
  for (;;) {
    if (options.manager.commonService) {
      try {
        const resp = await options.manager
          .commonService("tcbr", "2022-02-17")
          .call({
            Action: "DescribeServerManageTask",
            Param: {
              EnvId: options.envId,
              ServerName: options.serverName,
              TaskId: lastTaskId ?? 0,
            },
          });
        const info = extractServerManageTaskInfo(resp);
        if (info.taskId !== undefined) {
          lastTaskId = info.taskId;
        }
        if (info.taskStatus) {
          lastTaskStatus = info.taskStatus;
        }
      } catch {
        // Task may not be queryable yet; retry until timeout.
      }
    }

    if (typeof options.cloudrunService.getDeployRecords === "function") {
      try {
        const recordsResult = (await options.cloudrunService.getDeployRecords({
          serverName: options.serverName,
        })) as { DeployRecords?: Array<{ BuildId?: number; RunId?: string }> };
        const latest = recordsResult?.DeployRecords?.[0];
        if (isValidCloudRunBuildId(latest?.BuildId)) {
          lastBuildId = latest.BuildId;
        }
        if (isValidCloudRunRunId(latest?.RunId)) {
          lastRunId = latest.RunId.trim();
        }
      } catch {
        // Deploy record may lag behind task registration; retry.
      }
    }

    const preferredReady =
      mode === "image"
        ? isValidCloudRunRunId(lastRunId)
        : isValidCloudRunBuildId(lastBuildId);

    if (preferredReady) {
      return {
        registered: true,
        timedOut: false,
        taskId: lastTaskId,
        ...(isValidCloudRunBuildId(lastBuildId) ? { buildId: lastBuildId } : {}),
        ...(isValidCloudRunRunId(lastRunId) ? { runId: lastRunId } : {}),
        taskStatus: lastTaskStatus,
        waitMs: Date.now() - startAt,
      };
    }

    if (Date.now() - startAt >= maxWaitMs) {
      break;
    }
    await sleepFn(intervalMs);
  }

  const registered =
    isValidCloudRunBuildId(lastBuildId) ||
    isValidCloudRunRunId(lastRunId) ||
    (typeof lastTaskId === "number" && lastTaskId > 0);

  return {
    registered,
    timedOut: true,
    taskId: lastTaskId,
    ...(isValidCloudRunBuildId(lastBuildId) ? { buildId: lastBuildId } : {}),
    ...(isValidCloudRunRunId(lastRunId) ? { runId: lastRunId } : {}),
    taskStatus: lastTaskStatus,
    waitMs: Date.now() - startAt,
  };
}

/**
 * Build manageCloudRun(deploy) next_step by DeployType:
 * - source: getDeployLog (+ follow-up getProcessLog)
 * - image: skip getDeployLog; getProcessLog via RunId (or getDeployRecords first)
 */
export function buildCloudRunDeployNextStep(options: {
  deployType: CloudRunDeployRegistrationMode;
  serverName: string;
  buildId?: number;
  runId?: string;
  registered: boolean;
}): CloudRunDeployNextStep {
  const { deployType, serverName, registered } = options;

  if (deployType === "image") {
    if (isValidCloudRunRunId(options.runId)) {
      return {
        tool: "queryCloudRun",
        action: "getProcessLog",
        suggested_args: {
          action: "getProcessLog",
          detailServerName: serverName,
          runId: options.runId.trim(),
        },
        note: "Image deploy has no CODING build process; skip getDeployLog. Poll getProcessLog for deploy-step and container runtime logs.",
      };
    }
    return {
      tool: "queryCloudRun",
      action: "getDeployRecords",
      suggested_args: {
        action: "getDeployRecords",
        detailServerName: serverName,
      },
      note: registered
        ? "Image deploy: read latestDeploy.RunId, then queryCloudRun(action=\"getProcessLog\", runId=...). Skip getDeployLog."
        : "Image deploy registration still queueing; retry getDeployRecords for RunId, then getProcessLog. Skip getDeployLog.",
    };
  }

  if (isValidCloudRunBuildId(options.buildId)) {
    return {
      tool: "queryCloudRun",
      action: "getDeployLog",
      suggested_args: {
        action: "getDeployLog",
        detailServerName: serverName,
        buildId: options.buildId,
      },
      note: "Source build: poll getDeployLog for build progress, then getProcessLog (RunId from detail/getDeployRecords) for runtime/deploy-step logs.",
    };
  }

  return {
    tool: "queryCloudRun",
    action: "getDeployLog",
    suggested_args: {
      action: "getDeployLog",
      detailServerName: serverName,
    },
    note: registered
      ? "BuildId not yet available; omit buildId to use the latest deploy record. After build, use getProcessLog for runtime logs."
      : "Registration timed out; wait a moment then retry getDeployLog, or open consoleUrl. After build, use getProcessLog for runtime logs.",
  };
}

export function buildCloudRunDeployProgressHint(options: {
  deployType: CloudRunDeployRegistrationMode;
  serverName: string;
  buildId?: number;
  runId?: string;
  registered: boolean;
  timedOut: boolean;
  waitMs: number;
  consoleUrl: string;
  taskId?: number;
}): string {
  const { deployType, serverName, consoleUrl } = options;

  if (deployType === "image") {
    if (isValidCloudRunRunId(options.runId)) {
      return ` Image deploy: use queryCloudRun(action="getProcessLog", detailServerName="${serverName}", runId="${options.runId.trim()}") for runtime/deploy-step logs (skip getDeployLog).`;
    }
    if (options.registered) {
      return ` Image deploy registered${typeof options.taskId === "number" ? ` (taskId=${options.taskId})` : ""}; RunId not yet available — use queryCloudRun(action="getDeployRecords", detailServerName="${serverName}") then getProcessLog (skip getDeployLog), or check ${consoleUrl}.`;
    }
    return ` Image deploy registration timed out after ${Math.round(options.waitMs / 1000)}s — retry getDeployRecords for RunId then getProcessLog (skip getDeployLog), or check ${consoleUrl}.`;
  }

  if (isValidCloudRunBuildId(options.buildId)) {
    return ` Use queryCloudRun(action="getDeployLog", detailServerName="${serverName}", buildId=${options.buildId}) to poll build progress, then getProcessLog for runtime logs.`;
  }
  if (options.registered) {
    return ` Task registered (taskId=${options.taskId ?? "unknown"}); BuildId not yet available — retry queryCloudRun(action="getDeployLog", detailServerName="${serverName}") shortly, then getProcessLog, or check ${consoleUrl}.`;
  }
  return ` Build registration timed out after ${Math.round(options.waitMs / 1000)}s — deployment may still be queueing. Check ${consoleUrl} or retry queryCloudRun(action="getDeployLog", detailServerName="${serverName}") later.`;
}

const CLOUDRUN_DB_ENV_KEY_PATTERN =
  /^(DATABASE_URL|DB_HOST|DB_PORT|DB_USER|DB_PASSWORD|DB_NAME|MYSQL_|POSTGRES_|PGHOST|PGPORT|PGUSER|PGPASSWORD|PGDATABASE|PG_|REDIS_|MONGO_|MONGODB_|SQLALCHEMY_DATABASE_URI|SPRING_DATASOURCE_)/i;

const CLOUDRUN_DB_URL_PATTERN =
  /(mysql|mariadb|postgres|postgresql|mongodb(\+srv)?|redis|rediss):\/\//i;

export type CloudRunDbNetworkRisk = {
  code: "MISSING_VPC_FOR_DB_ENV";
  message: string;
  matchedKeys: string[];
  remediation: string[];
};

/**
 * 查询当前环境云托管（大租户）开通状态。
 *
 * 使用 tcbr DescribeEnvBaseInfo（2022-02-17）：
 * - IsExist=false + 空 EnvBaseInfo → 未开通（unopened）
 * - IsExist=true + Status="creating" → 开通中
 * - IsExist=true + Status="normal" → 已开通
 *
 * 供 initEnv（幂等判断）与 envStatus（状态查询）共用。
 */
export type CloudRunEnvStatus =
  | { isExist: true; status: "creating" | "normal" | "unknown"; baseInfo: Record<string, unknown> }
  | { isExist: false; status: "unopened"; baseInfo: Record<string, unknown> };

export async function queryCloudRunEnvStatus(options: {
  cloudBaseOptions?: CloudBaseOptions;
  envId: string;
}): Promise<CloudRunEnvStatus> {
  const manager = await getCloudBaseManager({ cloudBaseOptions: options.cloudBaseOptions });
  if (!manager?.commonService) {
    throw new Error(
      "Current CloudBase Manager does not support commonService; cannot query CloudRun env status.",
    );
  }
  return describeCloudRunEnvStatus(manager, options.envId);
}

/**
 * 核心实现：用已获取的 manager 查询云托管开通状态（供 initEnv/envStatus 及
 * ensureCloudRunEnvInitialized 复用，避免重复 getCloudBaseManager）。
 */
export async function describeCloudRunEnvStatus(
  manager: { commonService: (service: string, version: string) => { call: (options: any) => Promise<any> } },
  envId: string,
): Promise<CloudRunEnvStatus> {
  const result = await manager
    .commonService("tcbr", "2022-02-17")
    .call({
      Action: "DescribeEnvBaseInfo",
      Param: { EnvId: envId },
    });
  const data = (result ?? {}) as Record<string, unknown>;
  const baseInfo = ((data.EnvBaseInfo ?? {}) as Record<string, unknown>) ?? {};
  if (data.IsExist !== true) {
    return { isExist: false, status: "unopened", baseInfo };
  }
  const rawStatus = typeof baseInfo.Status === "string" ? baseInfo.Status : "";
  // Platform may return NORMAL/CREATING (uppercase); normalize before matching.
  const normalizedStatus = rawStatus.toLowerCase();
  const status =
    normalizedStatus === "creating" || normalizedStatus === "normal"
      ? (normalizedStatus as "creating" | "normal")
      : "unknown";
  return { isExist: true, status, baseInfo };
}

/** CloudRun EnvType for CreateCloudRunEnv (baas DescribeEnvBaseInfo enum). */
export const CLOUDRUN_ENV_TYPE = "baas" as const;

export type CloudRunVpcInfo = {
  VpcId: string;
  CreateType: number;
  SubnetIds: string[];
};

/**
 * Extract VPC binding from DescribeEnvBaseInfo.EnvBaseInfo when the env was
 * opened with an explicit VPC.
 */
export function extractEnvBaseInfoVpc(
  baseInfo: Record<string, unknown> | null | undefined,
): { VpcId: string; SubnetIds: string[] } | undefined {
  if (!baseInfo) {
    return undefined;
  }
  const vpcId = typeof baseInfo.VpcId === "string" ? baseInfo.VpcId.trim() : "";
  const rawSubnets = baseInfo.SubNetIds ?? baseInfo.SubnetIds;
  const subnetIds = Array.isArray(rawSubnets)
    ? rawSubnets
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .map((item) => item.trim())
    : [];
  if (!vpcId || subnetIds.length === 0) {
    return undefined;
  }
  return { VpcId: vpcId, SubnetIds: subnetIds };
}

/**
 * Resolve CreateCloudRunServer.VpcInfo: prefer explicit serverConfig.VpcConf,
 * otherwise fall back to env-level VPC from DescribeEnvBaseInfo.
 */
export function resolveCloudRunDeployVpcInfo(options: {
  vpcConf?: { VpcId?: string; SubnetId?: string } | null;
  envBaseInfo?: Record<string, unknown> | null;
}): CloudRunVpcInfo | undefined {
  const conf = options.vpcConf;
  if (conf?.VpcId?.trim() && conf?.SubnetId?.trim()) {
    return {
      VpcId: conf.VpcId.trim(),
      CreateType: 2,
      SubnetIds: [conf.SubnetId.trim()],
    };
  }
  const fromEnv = extractEnvBaseInfoVpc(options.envBaseInfo);
  if (!fromEnv) {
    return undefined;
  }
  return {
    VpcId: fromEnv.VpcId,
    CreateType: 2,
    SubnetIds: fromEnv.SubnetIds,
  };
}

/**
 * Build CreateCloudRunEnv Param, always including EnvType=baas.
 * Optional vpcId/subnetIds are used when the platform requires an explicit VPC.
 */
export function buildCreateCloudRunEnvParam(options: {
  envId: string;
  packageType: string;
  vpcId?: string;
  subnetIds?: string[];
}): Record<string, unknown> {
  const param: Record<string, unknown> = {
    EnvId: options.envId,
    PackageType: options.packageType,
    EnvType: CLOUDRUN_ENV_TYPE,
  };
  const vpcId = options.vpcId?.trim();
  const subnetIds = (options.subnetIds ?? [])
    .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
    .map((id) => id.trim());
  if (vpcId) {
    param.VpcId = vpcId;
  }
  if (subnetIds.length > 0) {
    param.SubNetIds = subnetIds;
  }
  return param;
}

/**
 * 探测当前环境云托管（大租户）是否已初始化。
 *
 * 背景（2026-08-13 用户实测）：新环境未调 CreateCloudRunEnv 初始化云托管时，
 * 直接 CreateCloudRunServer 会因"无大租户记录"被默认转入小租户，创建出小租户的
 * 服务和版本——这是错误路径。本函数在 deploy 创建新服务前用 tcbr DescribeEnvBaseInfo
 * 探测环境是否已开通云托管；未开通则抛错引导先初始化，而不是默默走到小租户路径。
 *
 * 实测（2026-08-13 真实凭据）：tcbr 不存在 DescribeCloudRunEnv（单数）Action，调用
 * 恒返回 InvalidAction；正确的探测接口是 DescribeEnvBaseInfo。未开通云托管的环境返回
 * IsExist=false 且 EnvBaseInfo 为空结构（不抛错）；已开通的环境（实测 ai-share-
 * d2guukyxybb63b206）返回 IsExist=true 且 EnvBaseInfo 含完整字段（Status="normal"、
 * PackageType/Region/EnvType/CreateTime 等已填充），两分支可明确区分。
 *
 * 双验证：DescribeCloudRunServers 未初始化与已初始化但无服务均返回 ServerList=[]，
 * 无法区分，故不作为初始化判定依据。
 *
 * @returns 已初始化返回 true；探测到未初始化抛出带引导信息的 Error。
 */
export async function ensureCloudRunEnvInitialized(options: {
  cloudBaseOptions?: CloudBaseOptions;
  envId: string;
  serverName: string;
}): Promise<boolean> {
  const manager = await getCloudBaseManager({ cloudBaseOptions: options.cloudBaseOptions });
  if (!manager?.commonService) {
    // 老 SDK 无 commonService 时退化为不拦截（保持既有行为，避免误伤）。
    return true;
  }
  try {
    const status = await describeCloudRunEnvStatus(manager, options.envId);
    if (!status.isExist) {
      throwCloudRunEnvNotInitialized(options.envId);
    }
    return true;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    // 错误兜底：未初始化/未开通类错误码。
    // 注意：裸 InvalidParameter 可能是普通参数错误，不拦截；仅当其带 Env/CloudRun
    // 上下文（疑似 "EnvironmentId not found / CloudRun Env 未开通"）时才按未初始化处理。
    if (
      /ResourceNotFound|not.?initialized|未开通|未初始化/i.test(msg) ||
      /InvalidParameter.*(?:Env|CloudRun)/i.test(msg)
    ) {
      throwCloudRunEnvNotInitialized(options.envId);
    }
    // 其他错误（网络/权限等）不拦截，让上层按原逻辑处理。
    return true;
  }
}

function throwCloudRunEnvNotInitialized(envId: string): never {
  throw new Error(
    `当前环境（${envId}）尚未初始化云托管（CloudRun Env）。` +
      `不能直接创建服务（CreateCloudRunServer 在无大租户记录时会默认创建到小租户，产生错误的小租户服务与版本）。\n` +
      `请先开通云托管环境，再重试部署：\n` +
      `- MCP：manageCloudRun(action="initEnv", envId="${envId}")（异步开通，幂等；开通完成后可用 queryCloudRun(action="envStatus", envId="${envId}") 查询 Status=normal）\n` +
      `- 或控制台：环境 → 云托管 → 开通（https://tcb.cloud.tencent.com/dev?envId=${envId}#/platform-run）\n` +
      `初始化完成后重新调用 manageCloudRun(action="deploy")。`,
  );
}

/**
 * Detect likely TCP database/cache env usage without VpcConf.
 * Soft signal for AI agents — does not block deploy.
 */
export function detectCloudRunDbNetworkRisk(options: {
  envParams?: string;
  vpcConf?: { VpcId?: string; SubnetId?: string } | null;
}): CloudRunDbNetworkRisk | null {
  const vpcId = options.vpcConf?.VpcId?.trim();
  const subnetId = options.vpcConf?.SubnetId?.trim();
  if (vpcId && subnetId) {
    return null;
  }

  const rawEnv = options.envParams?.trim();
  if (!rawEnv) {
    return null;
  }

  let parsed: Record<string, unknown>;
  try {
    const value = JSON.parse(rawEnv);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }
    parsed = value as Record<string, unknown>;
  } catch {
    // Non-JSON EnvParams still may embed connection URLs as plain text.
    if (!CLOUDRUN_DB_URL_PATTERN.test(rawEnv)) {
      return null;
    }
    return {
      code: "MISSING_VPC_FOR_DB_ENV",
      message:
        "EnvParams appears to include a database/cache connection URL, but serverConfig.VpcConf is missing. CloudRun instances usually cannot reach VPC-private MySQL/PostgreSQL/Redis without VpcConf.",
      matchedKeys: ["<non-json-envParams>"],
      remediation: [
        "Set serverConfig.VpcConf to the same region/VPC (and a subnet with free IPs) as the database.",
        "Do NOT invent VpcId/SubnetId. Resolve real IDs from the DB console, resource detail, callCloudApi, or the user.",
        "Use the database private/intranet hostname in EnvParams, not localhost or docker-compose service names.",
        "Ensure the DB security group allows the CloudRun subnet on the DB port.",
        "Re-deploy after VpcConf is set. OpenAccessTypes alone does not provide VPC egress to databases.",
      ],
    };
  }

  const matchedKeys: string[] = [];
  for (const [key, value] of Object.entries(parsed)) {
    if (CLOUDRUN_DB_ENV_KEY_PATTERN.test(key)) {
      matchedKeys.push(key);
      continue;
    }
    if (typeof value === "string" && CLOUDRUN_DB_URL_PATTERN.test(value)) {
      matchedKeys.push(key);
    }
  }

  if (matchedKeys.length === 0) {
    return null;
  }

  return {
    code: "MISSING_VPC_FOR_DB_ENV",
    message:
      "EnvParams includes database/cache connection settings, but serverConfig.VpcConf is missing. Deploy may succeed while runtime DB connections fail.",
    matchedKeys,
    remediation: [
      "Set serverConfig.VpcConf.VpcId and SubnetId to the database VPC/subnet (same region).",
      "Do NOT invent VpcId/SubnetId. Resolve real IDs from the DB console, resource detail, callCloudApi, or the user.",
      "Use the private DB endpoint in EnvParams.",
      "Confirm security group / allowlist permits CloudRun subnet access to the DB port.",
      "Do not confuse OpenAccessTypes (ingress) with VpcConf (egress to VPC resources).",
    ],
  };
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

function normalizeCloudRunDomainUrl(input: unknown): string | undefined {
  if (typeof input !== "string" || !input.trim()) return undefined;
  const raw = input.trim();
  return raw.startsWith("http://") || raw.startsWith("https://")
    ? raw
    : `https://${raw}`;
}

/**
 * 从服务详情 / 最新部署记录中提取镜像信息（镜像部署时才有）。
 * 镜像部署（DeployType=image）的服务详情与部署记录通常会携带 ImageUrl 等字段；
 * 源码构建的服务无此字段，返回 undefined 表示无镜像信息。
 */
export function extractCloudRunImageInfo(
  serviceDetail: any,
  latestDeploy?: any,
): { imageUrl?: string; deployType?: string } | undefined {
  const candidates = [
    latestDeploy,
    serviceDetail?.ServerConfig,
    serviceDetail?.BaseInfo,
    serviceDetail,
  ];
  for (const source of candidates) {
    if (!source || typeof source !== "object") continue;
    const imageUrl =
      source.ImageUrl ??
      source.imageUrl ??
      (typeof source.ImageInfo === "string" ? source.ImageInfo : undefined) ??
      (typeof source.ImageInfo?.ImageUrl === "string" ? source.ImageInfo.ImageUrl : undefined);
    if (typeof imageUrl === "string" && imageUrl.trim()) {
      const deployType =
        typeof source.DeployType === "string"
          ? source.DeployType
          : typeof source.deployType === "string"
            ? source.deployType
            : undefined;
      return { imageUrl: imageUrl.trim(), ...(deployType ? { deployType } : {}) };
    }
  }
  return undefined;
}

function resolveCloudRunFallbackAccess(details: any): {
  url?: string;
  source?:
    | "cloudrun.customDomain"
    | "cloudrun.defaultDomain"
    | "cloudrun.publicDomain"
    | "cloudrun.internalDomain";
} {
  const custom = normalizeCloudRunDomainUrl(details?.BaseInfo?.CustomDomainName);
  if (custom) return { url: custom, source: "cloudrun.customDomain" };
  const defaultDomain = normalizeCloudRunDomainUrl(
    details?.BaseInfo?.DefaultDomainName,
  );
  if (defaultDomain) return { url: defaultDomain, source: "cloudrun.defaultDomain" };
  const publicDomain =
    normalizeCloudRunDomainUrl(details?.BaseInfo?.PublicDomain) ??
    normalizeCloudRunDomainUrl(details?.AccessInfo?.PublicDomain);
  if (publicDomain) return { url: publicDomain, source: "cloudrun.publicDomain" };
  const internal = normalizeCloudRunDomainUrl(details?.BaseInfo?.InternalDomain);
  if (internal) return { url: internal, source: "cloudrun.internalDomain" };
  return {};
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
      description: "查询云托管服务信息，支持获取服务列表、查询服务详情、获取可用模板列表、获取构建日志（getDeployLog，仅云端源码构建/依赖 CODING）、获取运行日志（getProcessLog，镜像与源码部署均可/不依赖 CODING）、获取部署记录以及查询环境云托管开通状态（envStatus）。返回的服务信息包括服务名称、状态、访问类型、配置详情以及最近部署上下文。",
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
              } else if (
                typeof latestDeploy.Status === "string" &&
                // Platform may return FAILED/CREATING (uppercase); normalize before matching.
                latestDeploy.Status.toLowerCase().includes("failed")
              ) {
                message = `Service '${serverName}' latest deploy failed. Use queryCloudRun(action="getProcessLog") for runtime/deploy-step logs (RunId from latestDeploy); use getDeployLog only for cloud source-build logs (CODING).`;
              } else if (
                typeof latestDeploy.Status === "string" &&
                latestDeploy.Status.toLowerCase().includes("creating")
              ) {
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
                      // 若最新部署记录带镜像信息（镜像部署），透出便于展示
                      ...(extractCloudRunImageInfo(result, latestDeploy)
                        ? { imageInfo: extractCloudRunImageInfo(result, latestDeploy) }
                        : {}),
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
            // Build log (CODING / DescribeCloudRunBuildLog). Meaningful only for
            // cloud source builds; image deploys have no build process. Accounts
            // without a CODING user may fail here — use getProcessLog for runtime logs.
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
                      // Optional best-effort attach; prefer dedicated getProcessLog for runtime diagnosis
                      processLogs,
                      combinedLogText,
                      ...(processLogsWarning ? { processLogsWarning } : {})
                    },
                    message: `Retrieved build log for service '${serverName}' (getDeployLog=构建日志; for 运行日志 use getProcessLog with RunId)`
                  }, null, 2)
                }
              ]
            };
          }

          case 'getProcessLog': {
            const serverName = getCloudRunQueryServerName(input);

            if (!serverName && !input.runId?.trim()) {
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify({
                      success: false,
                      error: "runId is required, or provide detailServerName/serverName to resolve latest RunId",
                      message: "Pass runId from detail/getDeployRecords latestDeploy.RunId, or provide a service name to use the latest deploy RunId."
                    }, null, 2)
                  }
                ]
              };
            }

            let runId = input.runId?.trim() || "";
            let deployRecord: any = null;

            if (serverName) {
              const deployRecordsResult: any = await cloudrunService.getDeployRecords({ serverName });
              const deployRecords = Array.isArray(deployRecordsResult?.DeployRecords)
                ? deployRecordsResult.DeployRecords
                : [];
              deployRecord = deployRecords[0] ?? null;

              if (!runId) {
                runId = typeof deployRecord?.RunId === "string" ? deployRecord.RunId.trim() : "";
              } else if (deployRecord?.RunId && deployRecord.RunId !== runId) {
                // Keep latest deploy as context only; explicit runId wins
              }
            }

            if (!runId) {
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify({
                      success: false,
                      error: serverName
                        ? `Service '${serverName}' has no RunId on the latest deploy record.`
                        : "runId is required for getProcessLog action",
                      message: "Deploy the service first, then read RunId from queryCloudRun(action=\"detail\") or getDeployRecords (latestDeploy.RunId)."
                    }, null, 2)
                  }
                ]
              };
            }

            if (typeof cloudrunService.getProcessLog !== "function") {
              throw new Error(
                "Current CloudBase Manager SDK does not support getProcessLog; please upgrade @cloudbase/manager-node.",
              );
            }

            const processLogResult: any = await cloudrunService.getProcessLog({
              RunId: runId,
            });
            const processLogs = Array.isArray(processLogResult?.Logs)
              ? processLogResult.Logs
              : [];
            const processLogText = processLogs.length > 0
              ? normalizeProcessLogText(processLogs)
              : "";

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    success: true,
                    data: {
                      serverName: serverName || undefined,
                      runId,
                      deployRecord,
                      processLogs,
                      processLogText,
                      requestId: processLogResult?.RequestId,
                    },
                    message: `Retrieved process/runtime log for RunId='${runId}' (getProcessLog=运行日志; getDeployLog=构建日志且仅云端构建/依赖 CODING)`
                  }, null, 2)
                }
              ]
            };
          }

          case 'getDeployRecords': {
            const serverName = getCloudRunQueryServerName(input);

            if (!serverName) {
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify({
                      success: false,
                      error: "detailServerName or serverName is required for getDeployRecords action",
                      message: "Please provide detailServerName or serverName."
                    }, null, 2)
                  }
                ]
              };
            }

            const deployRecordsResult: any = await cloudrunService.getDeployRecords({ serverName });
            const deployRecords = Array.isArray(deployRecordsResult?.DeployRecords)
              ? deployRecordsResult.DeployRecords
              : [];

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    success: true,
                    data: {
                      serverName,
                      deployRecords,
                      // 部署记录按部署时间倒序（最新在前），首条为最近一次部署
                      total: deployRecords.length,
                      latestDeploy: deployRecords[0] ?? null
                    },
                    message: `Retrieved ${deployRecords.length} deploy records for service '${serverName}'`
                  }, null, 2)
                }
              ]
            };
          }

          case 'envStatus': {
            const envId = input.envId?.trim() || (await getEnvId(cloudBaseOptions));

            if (!manager.commonService) {
              throw new Error(
                "Current CloudBase Manager does not support commonService; cannot query CloudRun env status.",
              );
            }
            let status: CloudRunEnvStatus;
            try {
              status = await describeCloudRunEnvStatus(manager, envId);
            } catch (error) {
              const baseMessage = error instanceof Error ? error.message : String(error);
              if (
                /ResourceNotFound|not.?initialized|未开通|未初始化/i.test(baseMessage) ||
                /InvalidParameter.*(?:Env|CloudRun)/i.test(baseMessage)
              ) {
                status = { isExist: false, status: "unopened", baseInfo: {} };
              } else {
                throw new Error(`[queryCloudRun/envStatus] ${baseMessage}`);
              }
            }

            let message: string;
            if (!status.isExist) {
              message = `环境 ${envId} 尚未开通云托管。请先调用 manageCloudRun(action="initEnv", envId="${envId}") 开通（异步、幂等），或前往控制台 环境 → 云托管 → 开通；Status=normal 后即可 deploy。`;
            } else if (status.status === "creating") {
              message = `环境 ${envId} 云托管正在开通中（Status=creating）。请稍后重试 manageCloudRun(action="deploy")，或用本 action 再次查询直到 Status=normal。`;
            } else if (status.status === "normal") {
              message = `环境 ${envId} 云托管已开通（Status=normal），可直接 manageCloudRun(action="deploy")。`;
            } else {
              message = `环境 ${envId} 云托管状态未知（Status=${status.status ?? "unknown"}），请稍后重试。`;
            }

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    success: true,
                    data: {
                      envId,
                      status: status.status,
                      isExist: status.isExist,
                      ...(status.isExist
                        ? {
                            envBaseInfo: {
                              Status: status.baseInfo.Status ?? null,
                              PackageType: status.baseInfo.PackageType ?? null,
                              Region: status.baseInfo.Region ?? null,
                              EnvType: status.baseInfo.EnvType ?? null,
                            },
                          }
                        : {}),
                    },
                    message
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
      description: "管理云托管服务，按开发顺序支持：开通云托管环境（initEnv）、初始化项目（可从模板开始，模板列表可通过 queryCloudRun 查询）、下载服务代码、本地运行（仅函数型服务）、部署代码、仅更新配置（updateConfig，无需重新上传代码）、删除服务。deploy 支持两种方式：1) 源码构建（传入 targetPath，本地代码打包上传，默认路径）；2) 已有镜像部署（传入 imageUrl，如 ccr.ccs.tencentyun.com/ns/img:v1，走 DeployType=image 容器型部署，targetPath 可省略）。deploy 语义为「触发部署 + 轻量等待任务注册」（最多约 45s）。源码构建返回 buildId，用 getDeployLog 轮询构建进度后再 getProcessLog；镜像部署（imageUrl）BuildId 常为 0，跳过 getDeployLog，返回 runId/next_step 引导 getProcessLog（或先 getDeployRecords 取 RunId）。若用户明确指定镜像或无需重新构建，必须传 imageUrl，不要仅因本地有源码目录就回退到源码构建。deploy 对已存在服务会先读取远程配置再合并（保留 VpcConf/EnvParams/OpenAccessTypes）。updateConfig 对齐控制台服务设置页。删除操作需要确认，建议设置force=true。新环境首次部署前若提示未开通云托管，先调用 initEnv 开通（异步、幂等）。",
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
        case 'initEnv': {
            const envId = input.envId?.trim() || (await getEnvId(cloudBaseOptions));
            const packageType = input.packageType || 'Trial';
            if (!manager.commonService) {
              throw new Error(
                "Current CloudBase Manager does not support commonService; cannot initialize CloudRun env.",
              );
            }

            // 幂等：先查当前开通状态，已开通 / 开通中不重复创建。
            let current: CloudRunEnvStatus;
            try {
              current = await describeCloudRunEnvStatus(manager, envId);
            } catch (error) {
              const baseMessage = error instanceof Error ? error.message : String(error);
              if (
                /ResourceNotFound|not.?initialized|未开通|未初始化/i.test(baseMessage) ||
                /InvalidParameter.*(?:Env|CloudRun)/i.test(baseMessage)
              ) {
                current = { isExist: false, status: "unopened", baseInfo: {} };
              } else {
                throw new Error(`[manageCloudRun/initEnv] ${baseMessage}`);
              }
            }

            if (current.isExist && current.status === "normal") {
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify({
                      success: true,
                      data: {
                        envId,
                        status: "normal",
                        packageType: current.baseInfo.PackageType ?? packageType,
                        created: false
                      },
                      message: `环境 ${envId} 已开通云托管（Status=normal），无需重复开通。可直接 manageCloudRun(action="deploy")。`
                    }, null, 2)
                  }
                ]
              };
            }

            if (current.isExist && current.status === "creating") {
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify({
                      success: true,
                      data: {
                        envId,
                        status: "creating",
                        created: false
                      },
                      message: `环境 ${envId} 云托管正在开通中（Status=creating），无需重复开通。请稍后用 queryCloudRun(action="envStatus", envId="${envId}") 查询，Status=normal 后即可 deploy。`
                    }, null, 2)
                  }
                ]
              };
            }

            // 未开通 → 发起异步开通（CreateCloudRunEnv 异步，不阻塞等待）。
            // Always pass EnvType=baas; optional vpcId/subnetIds when an explicit VPC is required.
            let createResult: any;
            try {
              createResult = await manager
                .commonService("tcbr", "2022-02-17")
                .call({
                  Action: "CreateCloudRunEnv",
                  Param: buildCreateCloudRunEnvParam({
                    envId,
                    packageType,
                    vpcId: input.vpcId,
                    subnetIds: input.subnetIds,
                  }),
                });
            } catch (error) {
              throw new Error(buildManageCloudRunErrorMessage('initEnv', envId, error));
            }
            const tranId =
              createResult?.TranId ??
              createResult?.Response?.TranId ??
              createResult?.tranId;

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    success: true,
                    data: {
                      envId,
                      status: "creating",
                      packageType,
                      created: true,
                      ...(tranId ? { tranId } : {})
                    },
                    message: `已发起云托管开通（异步，Status=creating）。请稍后用 queryCloudRun(action="envStatus", envId="${envId}") 查询状态，Status=normal 后即可 manageCloudRun(action="deploy")。`
                  }, null, 2)
                }
              ]
            };
          }

          case 'traffic': {
            const trafficOp = input.trafficOp;
            if (!trafficOp) {
              throw new Error(
                "trafficOp is required for traffic operation (set | promote | rollback)",
              );
            }

            if (trafficOp === 'set') {
              const stable = input.stablePercent;
              const canary = input.canaryPercent;
              if (
                typeof stable !== 'number' ||
                typeof canary !== 'number'
              ) {
                throw new Error(
                  "stablePercent and canaryPercent are required for trafficOp=set",
                );
              }
              if (stable + canary !== 100) {
                throw new Error(
                  `stablePercent + canaryPercent must equal 100 (got ${stable} + ${canary} = ${stable + canary}). ` +
                    `Example: 90/10 means 90% to stable version, 10% to canary version.`,
                );
              }
              let setResult: unknown;
              try {
                setResult = await cloudrunService.setTraffic(
                  input.serverName,
                  stable,
                  canary,
                );
              } catch (error) {
                throw new Error(
                  buildManageCloudRunErrorMessage('traffic/set', input.serverName, error),
                );
              }
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify({
                      success: true,
                      data: {
                        serverName: input.serverName,
                        trafficOp: 'set',
                        stablePercent: stable,
                        canaryPercent: canary,
                        result: setResult ?? null
                      },
                      message: `Set traffic for service '${input.serverName}': stable ${stable}% / canary ${canary}%`
                    }, null, 2)
                  }
                ]
              };
            }

            if (trafficOp === 'promote') {
              let promoteResult: unknown;
              try {
                promoteResult = await cloudrunService.promote(input.serverName);
              } catch (error) {
                throw new Error(
                  buildManageCloudRunErrorMessage('traffic/promote', input.serverName, error),
                );
              }
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify({
                      success: true,
                      data: {
                        serverName: input.serverName,
                        trafficOp: 'promote',
                        result: promoteResult ?? null
                      },
                      message: `Promoted canary version to full release for service '${input.serverName}' (100% traffic). This is irreversible.`
                    }, null, 2)
                  }
                ]
              };
            }

            // rollback
            let rollbackResult: unknown;
            try {
              rollbackResult = await cloudrunService.rollback(input.serverName);
            } catch (error) {
              throw new Error(
                buildManageCloudRunErrorMessage('traffic/rollback', input.serverName, error),
              );
            }
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    success: true,
                    data: {
                      serverName: input.serverName,
                      trafficOp: 'rollback',
                      result: rollbackResult ?? null
                    },
                    message: `Rolled back service '${input.serverName}' to the previous stable version.`
                  }, null, 2)
                }
              ]
            };
          }

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
            if (!targetPath && !input.imageUrl) {
              throw new Error("targetPath (source build) or imageUrl (existing image) is required for deploy operation");
            }

            // Determine service type - use input.serverType if provided, otherwise auto-detect
            let serverType: 'function' | 'container';
            let remoteServerConfig: CloudRunServerConfigLike | null = null;
            let existingService = false;
            if (input.imageUrl) {
              // Image deploy is always container type (SDK: DeployInfo={DeployType:"image", ImageUrl}).
              serverType = 'container';
            } else if (input.serverType) {
              serverType = input.serverType;
            } else {
              try {
                // First try to get existing service details
                const details = await cloudrunService.detail({ serverName: input.serverName });
                serverType = details.BaseInfo?.ServerType || 'container';
                remoteServerConfig = (details.ServerConfig || null) as unknown as CloudRunServerConfigLike | null;
                existingService = true;
              } catch (e) {
                // If service doesn't exist, determine by project structure
                const dockerfilePath = path.join(targetPath!, 'Dockerfile');
                if (fs.existsSync(dockerfilePath)) {
                  serverType = 'container';
                } else {
                  // Check if it's a Node.js function project (has package.json with specific structure)
                  const packageJsonPath = path.join(targetPath!, 'package.json');
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

            // When serverType was provided explicitly, still try to load remote config for RMW.
            if (!existingService) {
              try {
                const details = await cloudrunService.detail({ serverName: input.serverName });
                remoteServerConfig = (details.ServerConfig || null) as unknown as CloudRunServerConfigLike | null;
                existingService = true;
              } catch {
                // New service create path
              }
            }

            // 新环境必须先初始化云托管（大租户），否则 CreateCloudRunServer 会默认
            // 创建小租户服务。仅创建新服务（非 existing）前探测一次。
            // （2026-08-13 用户实测：luapi-v2 因未初始化云托管被创建到小租户）
            if (!existingService) {
              const currentEnvId = await getEnvId(cloudBaseOptions);
              await ensureCloudRunEnvInitialized({
                cloudBaseOptions,
                envId: currentEnvId,
                serverName: input.serverName,
              });
            }

            let mergedFromRemote: string[] = [];
            let effectiveServerConfig: CloudRunServerConfigLike | undefined = input.serverConfig;

            if (existingService) {
              const mergedResult = mergeCloudRunServerConfig({
                remote: remoteServerConfig,
                input: input.serverConfig || {},
                envParamsReplaceAll: Boolean(input.envParamsReplaceAll),
              });
              effectiveServerConfig = mergedResult.merged;
              mergedFromRemote = mergedResult.mergedFromRemote;
            }

            const deployParams: any = {
              serverName: input.serverName,
              targetPath: targetPath,
              force: input.force,
              serverType: serverType,
            };

            if (input.imageUrl) {
              deployParams.imageUrl = input.imageUrl;
            }

            if (effectiveServerConfig && Object.keys(effectiveServerConfig).length > 0) {
              deployParams.serverConfig = effectiveServerConfig;
            }

            // Manager SDK create path prefers top-level vpcInfo (CreateCloudRunServer.VpcInfo).
            // Prefer serverConfig.VpcConf; if missing, auto-fill from env DescribeEnvBaseInfo
            // (envs opened with vpcId/subnetIds already carry VpcId/SubNetIds).
            const vpcConf = effectiveServerConfig?.VpcConf as
              | { VpcId?: string; SubnetId?: string }
              | undefined;
            let envBaseInfoForVpc: Record<string, unknown> | null = null;
            const explicitVpcId = vpcConf?.VpcId?.trim() ?? "";
            const explicitSubnetId = vpcConf?.SubnetId?.trim() ?? "";
            if (!explicitVpcId || !explicitSubnetId) {
              try {
                const envIdForVpc = await getEnvId(cloudBaseOptions);
                const envStatusForVpc = await describeCloudRunEnvStatus(manager, envIdForVpc);
                if (envStatusForVpc.isExist) {
                  envBaseInfoForVpc = envStatusForVpc.baseInfo;
                }
              } catch {
                // Best-effort: deploy may still succeed without vpcInfo when the platform creates the network.
              }
            }
            const resolvedVpcInfo = resolveCloudRunDeployVpcInfo({
              vpcConf,
              envBaseInfo: envBaseInfoForVpc,
            });
            if (resolvedVpcInfo) {
              deployParams.vpcInfo = resolvedVpcInfo;
            }

            let result: unknown;
            try {
              result = await cloudrunService.deploy(deployParams);
            } catch (error) {
              throw new Error(buildManageCloudRunErrorMessage('deploy', input.serverName, error));
            }

            // Generate cloudbaserc.json configuration file (source-build only; image deploy has no local project dir)
            const currentEnvId = await getEnvId(cloudBaseOptions);

            // Lightweight wait for task / BuildId (source) or RunId (image) registration.
            // Does not wait for full build/deploy completion.
            const deployType: CloudRunDeployRegistrationMode = input.imageUrl
              ? "image"
              : "source";
            const registration = await waitForCloudRunDeployRegistration({
              manager,
              cloudrunService,
              envId: currentEnvId,
              serverName: input.serverName,
              mode: deployType,
            });

            let cloudbasercGenerated = false;
            if (targetPath) {
              const cloudbasercPath = path.join(targetPath, 'cloudbaserc.json');
              const cloudbasercContent = {
                envId: currentEnvId,
                cloudrun: {
                  name: input.serverName
                }
              };

              try {
                fs.writeFileSync(cloudbasercPath, JSON.stringify(cloudbasercContent, null, 2));
                cloudbasercGenerated = true;
              } catch (error) {
                debug('cloudbaserc.json creation skipped:', error instanceof Error ? error : new Error(String(error)));
              }
            }
            const consoleUrl = `https://tcb.cloud.tencent.com/dev?envId=${currentEnvId}#/platform-run/service/detail?serverName=${input.serverName}&tabId=overview&envId=${currentEnvId}`;

            let preferredAccessUrl: string | undefined;
            let preferredAccessUrls: string[] = [];
            let preferredAccessSource: string | undefined;
            let verifiedConfigSnapshot: ReturnType<typeof summarizeConfigSnapshot> | undefined;
            try {
              const serviceDetails = await cloudrunService.detail({
                serverName: input.serverName,
              });
              verifiedConfigSnapshot = summarizeConfigSnapshot(
                (serviceDetails as any)?.ServerConfig,
              );
              const fallback = resolveCloudRunFallbackAccess(serviceDetails as any);
              const gateway = await resolveGatewayAccessUrls({
                envId: currentEnvId,
                upstreamResourceName: input.serverName,
                upstreamResourceTypes: ["CBR"],
                getManager: async () => {
                  const manager = await getManager();
                  if (!manager) {
                    throw new Error("cloudbase manager unavailable");
                  }
                  return manager as any;
                },
              });
              const preferred = preferGatewayOrFallback({
                gateway,
                fallbackUrl: fallback.url,
                fallbackSource: fallback.source,
              });
              preferredAccessUrl = preferred.accessUrl;
              preferredAccessUrls = preferred.accessUrls;
              preferredAccessSource = preferred.accessUrlSource;
            } catch {
              // best-effort URL enrichment only
            }

            // Send deployment notification to CodeBuddy IDE
            try {
              const projectName = targetPath ? path.basename(targetPath) : input.serverName;
              await sendDeployNotification(server, {
                deployType: 'cloudrun',
                url: preferredAccessUrl ?? "",
                projectId: currentEnvId,
                projectName: projectName,
                consoleUrl: consoleUrl
              });
            } catch (notifyErr) {
              // Notification failure should not affect deployment flow
              // Error is already logged in sendDeployNotification
            }

            const dbNetworkRisk = detectCloudRunDbNetworkRisk({
              envParams: effectiveServerConfig?.EnvParams as string | undefined,
              vpcConf: effectiveServerConfig?.VpcConf as
                | { VpcId?: string; SubnetId?: string }
                | undefined,
            });
            const warnings = dbNetworkRisk ? [dbNetworkRisk] : [];
            const warningSuffix = dbNetworkRisk
              ? ` Warning: ${dbNetworkRisk.message} Set serverConfig.VpcConf before relying on DB connectivity.`
              : "";

            const progressHint = buildCloudRunDeployProgressHint({
              deployType,
              serverName: input.serverName,
              buildId: registration.buildId,
              runId: registration.runId,
              registered: registration.registered,
              timedOut: registration.timedOut,
              waitMs: registration.waitMs,
              consoleUrl,
              taskId: registration.taskId,
            });

            const nextStep = buildCloudRunDeployNextStep({
              deployType,
              serverName: input.serverName,
              buildId: registration.buildId,
              runId: registration.runId,
              registered: registration.registered,
            });

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    success: true,
                    data: {
                      serviceName: input.serverName,
                      status: 'deploying',
                      deployType,
                      ...(targetPath ? { deployPath: targetPath } : {}),
                      ...(input.imageUrl ? { imageUrl: input.imageUrl } : {}),
                      serverType: serverType,
                      cloudbasercGenerated,
                      consoleUrl,
                      ...(isValidCloudRunBuildId(registration.buildId)
                        ? { buildId: registration.buildId }
                        : {}),
                      ...(isValidCloudRunRunId(registration.runId)
                        ? { runId: registration.runId }
                        : {}),
                      ...(typeof registration.taskId === "number"
                        ? { taskId: registration.taskId }
                        : {}),
                      registration: {
                        registered: registration.registered,
                        timedOut: registration.timedOut,
                        waitMs: registration.waitMs,
                        ...(registration.taskStatus
                          ? { taskStatus: registration.taskStatus }
                          : {}),
                      },
                      next_step: nextStep,
                      ...(existingService
                        ? {
                            configMerge: {
                              existingService: true,
                              mergedFromRemote,
                              appliedConfig: summarizeConfigSnapshot(effectiveServerConfig),
                              ...(verifiedConfigSnapshot
                                ? { verifiedAfterDeploy: verifiedConfigSnapshot }
                                : {}),
                            },
                          }
                        : {}),
                      ...(preferredAccessUrl ? { accessUrl: preferredAccessUrl } : {}),
                      ...(preferredAccessUrls.length > 0
                        ? { accessUrls: preferredAccessUrls }
                        : {}),
                      ...(preferredAccessSource
                        ? { accessUrlSource: preferredAccessSource }
                        : {}),
                      ...(warnings.length > 0 ? { warnings } : {}),
                      // Keep raw SDK result for debugging without implying build finished.
                      ...(result != null ? { deployAccepted: true } : {}),
                    },
                    message: `Triggered deployment for ${serverType} service '${input.serverName}' ${input.imageUrl ? `from image ${input.imageUrl}` : `from ${targetPath}`}. Deployment is registering/${deployType === "image" ? "starting" : "building"} (status=deploying); this call does not wait for full completion.${progressHint}${warningSuffix}`
                  }, null, 2)
                }
              ]
            };
          }

          case 'updateConfig': {
            if (!input.serverConfig || Object.keys(input.serverConfig).length === 0) {
              throw new Error(
                "serverConfig with at least one field is required for updateConfig",
              );
            }

            let remoteServerConfig: CloudRunServerConfigLike = {};
            try {
              const details = await cloudrunService.detail({
                serverName: input.serverName,
              });
              remoteServerConfig = (details.ServerConfig ||
                {}) as unknown as CloudRunServerConfigLike;
            } catch (error) {
              throw new Error(
                buildManageCloudRunErrorMessage(
                  "updateConfig",
                  input.serverName,
                  error,
                ),
              );
            }

            // EnvParams on Diff replaces the whole blob — merge keys unless replaceAll.
            const dirty: CloudRunServerConfigLike = { ...input.serverConfig };
            if (Object.prototype.hasOwnProperty.call(input.serverConfig, "EnvParams")) {
              const { merged } = mergeCloudRunServerConfig({
                remote: { EnvParams: remoteServerConfig.EnvParams },
                input: { EnvParams: input.serverConfig.EnvParams },
                envParamsReplaceAll: Boolean(input.envParamsReplaceAll),
              });
              if (merged.EnvParams !== undefined) {
                dirty.EnvParams = merged.EnvParams;
              }
            }

            let Items;
            try {
              Items = parseServerConfigToDiffItems(dirty);
            } catch (error) {
              throw new Error(
                buildManageCloudRunErrorMessage(
                  "updateConfig",
                  input.serverName,
                  error,
                ),
              );
            }

            if (Items.length === 0) {
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(
                      {
                        success: true,
                        data: {
                          serviceName: input.serverName,
                          status: "noop",
                          itemsCount: 0,
                          appliedConfig: summarizeConfigSnapshot(dirty),
                          verifiedConfig: summarizeConfigSnapshot(remoteServerConfig),
                        },
                        message: `No effective config changes for '${input.serverName}'.`,
                      },
                      null,
                      2,
                    ),
                  },
                ],
              };
            }

            const currentEnvId = await getEnvId(cloudBaseOptions);
            if (!manager.commonService) {
              throw new Error(
                "Current CloudBase Manager does not support commonService; cannot call SubmitServerConfigChangeDiff.",
              );
            }

            let diffResult: any;
            try {
              diffResult = await manager
                .commonService("tcbr", "2022-02-17")
                .call({
                  Action: "SubmitServerConfigChangeDiff",
                  Param: {
                    EnvId: currentEnvId,
                    ServerName: input.serverName,
                    Items,
                  },
                });
            } catch (error) {
              const msg = error instanceof Error ? error.message : String(error);
              if (/ResourceInUse|task|running|进行中/i.test(msg)) {
                throw new Error(
                  buildManageCloudRunErrorMessage(
                    "updateConfig",
                    input.serverName,
                    new Error(
                      `${msg} A deploy or config task may still be running. Wait, then retry; or use queryCloudRun(action="getDeployLog").`,
                    ),
                  ),
                );
              }
              throw new Error(
                buildManageCloudRunErrorMessage(
                  "updateConfig",
                  input.serverName,
                  error,
                ),
              );
            }

            let verifiedConfig = summarizeConfigSnapshot(remoteServerConfig);
            try {
              const after = await cloudrunService.detail({
                serverName: input.serverName,
              });
              verifiedConfig = summarizeConfigSnapshot(
                (after as any)?.ServerConfig,
              );
            } catch {
              // best-effort verify
            }

            const likelyRedeploy = listLikelyRedeployFields(dirty);
            const consoleUrl = `https://tcb.cloud.tencent.com/dev?envId=${currentEnvId}#/platform-run/service/detail?serverName=${input.serverName}&tabId=overview&envId=${currentEnvId}`;
            const taskId =
              diffResult?.TaskId ??
              diffResult?.Response?.TaskId ??
              diffResult?.taskId;

            const redeployHint =
              likelyRedeploy.length > 0
                ? ` Fields that often trigger redeploy-with-online-image: ${likelyRedeploy.join(", ")}.`
                : " Change may apply as a hot update (e.g. MinNum/MaxNum/AccessTypes).";

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      success: true,
                      data: {
                        serviceName: input.serverName,
                        status: "configUpdating",
                        itemsCount: Items.length,
                        itemsKeys: Items.map((i: { Key: string }) => i.Key),
                        ...(taskId ? { taskId } : {}),
                        appliedConfig: summarizeConfigSnapshot(dirty),
                        verifiedConfig,
                        likelyRedeployFields: likelyRedeploy,
                        consoleUrl,
                      },
                      message: `Submitted config change for '${input.serverName}'.${redeployHint} Verify with queryCloudRun(action="detail"). Console: ${consoleUrl}`,
                    },
                    null,
                    2,
                  ),
                },
              ],
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
