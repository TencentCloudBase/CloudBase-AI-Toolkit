import CloudBase from "@cloudbase/manager-node";

export interface UploadFileParams {
  cloudPath: string;
  fileContent: string;
}

export interface ListFilesParams {
  prefix: string;
  marker?: string;
}

export interface DeleteFileParams {
  cloudPath: string;
}

export interface GetFileInfoParams {
  cloudPath: string;
}

export interface ToolResponse {
  success: boolean;
  [key: string]: any;
}

// 数据模型相关类型定义
export interface DataModelField {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object' | 'objectId' | 'file' | 'image';
  required?: boolean;
  default?: any;
  description?: string;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    enum?: any[];
  };
}

export interface DataModelSchema {
  type: 'object';
  properties: Record<string, {
    type: string;
    description?: string;
    required?: boolean;
    default?: any;
    validation?: any;
  }>;
  required?: string[];
}

export interface DataModel {
  id?: string;
  name: string;
  title: string;
  schema: DataModelSchema;
  envId?: string;
  status?: 'draft' | 'published';
  createdAt?: string;
  updatedAt?: string;
}

// CloudBase 配置选项（扩展了 requestFn，支持注入自定义请求函数替代 TC3 签名）
type CloudBaseConfigBase = NonNullable<ConstructorParameters<typeof CloudBase>[0]>

/**
 * 自定义 API 请求函数，由外部注入，替代 TC3 签名发请求。
 * 入参对齐 CAPI 模式：service + action + version + region + payload。
 * 返回腾讯云 API 响应中 Response 字段的内容（已解包）。
 *
 * `appid` 为可选扩展字段（向后兼容）：多小程序会话场景下由工具透传，
 * 宿主（如微信 IDE）据此选择对应登录态；未使用多 appid 的注入方可忽略。
 */
export type CloudApiRequestFn = (params: {
  service: string
  action: string
  version: string
  region: string
  payload: Record<string, any>
  /** Optional WeChat mini-program AppID for host login-session selection */
  appid?: string
}) => Promise<any>

export type CloudBaseOptions = CloudBaseConfigBase & {
  requestFn?: CloudApiRequestFn
  /** 站点：domestic（国内站）/ intl（国际站）。可选；缺省按 TCB_SITE / region 映射表 / 项目配置解析 */
  site?: string
}

/**
 * manageFunctions 工具中部分 action 的 override 钩子
 * 参数使用 CloudBase 领域语言，与 MCP 内部 DTO 解耦
 * 实现方（如微信 IDE）负责在内部做参数适配
 *
 * - createFunction / updateFunctionCode：有默认实现，override 后可走外部专有接口
 * - incrementalDeployFunction：无默认实现，必须通过 pluginOptions 注入
 */
export interface FunctionDeployOverrides {
  createFunction?: (params: {
    functionName: string;
    functionRootPath: string;
    runtime?: string;
    force?: boolean;
    installDependency?: boolean;
  }) => Promise<any>;

  updateFunctionCode?: (params: {
    functionName: string;
    functionRootPath: string;
    force?: boolean;
    installDependency?: boolean;
  }) => Promise<any>;

  incrementalDeployFunction?: (params: {
    functionName: string;
    functionRootPath: string;
    incrementalFile: string;
  }) => Promise<any>;
}

/**
 * 存储工具中需要 COS SDK 操作的 override 钩子
 * 实现方（如微信 IDE）负责在内部通过 /route/getcosauth 获取临时签名并操作 COS
 *
 * - listFiles / getFileInfo / downloadFile：queryStorage 只读操作
 * - uploadFile / deleteFiles / deleteDirectory：manageStorage 写操作
 * - getFileUrl：获取文件临时下载链接（可选，未提供时使用 CAPI 默认实现）
 */
export interface StorageOverrides {
  /** 列出目录下的文件，替代 storageService.listDirectoryFiles() */
  listFiles?: (params: {
    cloudPath: string;
  }) => Promise<Array<Record<string, any>>>;

  /** 获取文件元信息，替代 storageService.getFileInfo() */
  getFileInfo?: (params: {
    cloudPath: string;
  }) => Promise<Record<string, any>>;

  /** 下载文件到本地，替代 storageService.downloadFile() */
  downloadFile?: (params: {
    cloudPath: string;
    localPath: string;
  }) => Promise<void>;

  /** 下载目录到本地，替代 storageService.downloadDirectory() */
  downloadDirectory?: (params: {
    cloudPath: string;
    localPath: string;
  }) => Promise<void>;

  /** 上传单个文件，替代 storageService.uploadFile() */
  uploadFile?: (params: {
    localPath: string;
    cloudPath: string;
  }) => Promise<void>;

  /** 上传目录，替代 storageService.uploadDirectory() */
  uploadDirectory?: (params: {
    localPath: string;
    cloudPath: string;
  }) => Promise<void>;

  /**
   * 获取文件临时下载链接，替代 storageService.getTemporaryUrl()
   * 可通过 COS getObjectUrl 实现；未提供时走 manager-node 默认路径
   */
  getFileUrl?: (params: {
    cloudPath: string;
    maxAge?: number;
  }) => Promise<{ url: string; fileId?: string }>;

  /** 删除文件（支持批量），替代 storageService.deleteFile() */
  deleteFiles?: (params: {
    cloudPaths: string[];
  }) => Promise<void>;

  /** 删除目录，替代 storageService.deleteDirectory() */
  deleteDirectory?: (params: {
    cloudPath: string;
  }) => Promise<void>;
}

/** 各插件的可选配置 */
export interface PluginOptions {
  functions?: FunctionDeployOverrides;
  storage?: StorageOverrides;

  /**
   * 消息推送（msg-push）插件配置。
   *
   * 消息推送 qbase 管理能力（getappconfig / uploadappconfig / route/getcallbacksupportlist /
   * get|setcontainercallbackconfig）依赖微信小程序登录态，CloudBase MCP 独立运行
   * （腾讯云身份）无法直连。复用现有 `cloudBaseOptions.requestFn`（CloudApiRequestFn：
   * service/action/version/region/payload 领域语义）作为传输层——与 databaseNoSQL/functions
   * 完全一致，包内不感知 URL。宿主（如微信开发者工具）在 createCloudBaseMcpServer 时注入
   * requestFn 并启用 msg-push 插件即可；未注入时工具返回明确指引错误（指向微信 IDE 工具）。
   */
  msgPush?: MsgPushOverrides;
}

/**
 * 消息推送领域动作（经 CloudApiRequestFn 的 action 字段表达，宿主映射到具体 qbase CGI，
 * CloudBase MCP 不感知 URL）。与现有 service/action/payload 分层一致：
 * 本包只表达「做什么」，由宿主注入的 requestFn 负责「怎么发 + 鉴权」。
 */
export type MsgPushAction =
  | "getAppConfig"
  | "uploadAppConfig"
  | "getCallbackSupportList"
  | "getContainerCallbackConfig"
  | "setContainerCallbackConfig";

/** 消息推送 qbase 响应（业务码 ret === 0 为成功；由宿主 requestFn 解包后返回） */
export interface MsgPushQbaseResponse {
  base_resp?: {
    ret: number;
    errmsg?: string;
  };
  [key: string]: unknown;
}

/**
 * 消息推送（msg-push）插件 override 钩子。
 * 复用现有 `cloudBaseOptions.requestFn`（CloudApiRequestFn）传输层，
 * 仅在需要定制 service 名等场景下通过本钩子提供；未提供时工具用默认 service 约定。
 */
export interface MsgPushOverrides {
  /** 消息推送 qbase CGI 对应的 Cloud API service 名（默认 "qbase"）；宿主可按后端契约覆盖 */
  service?: string;
}

export type Logger = (data: {
  type: string;
  requestId?: string;
  result?: any;
  toolName?: string;
  args?: any;
  message?: string;
  duration?: number;
  [key: string]: any;
}) => void;