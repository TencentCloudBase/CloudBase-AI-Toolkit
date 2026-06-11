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
 */
export type CloudApiRequestFn = (params: {
  service: string
  action: string
  version: string
  region: string
  payload: Record<string, any>
}) => Promise<any>

export type CloudBaseOptions = CloudBaseConfigBase & {
  requestFn?: CloudApiRequestFn
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