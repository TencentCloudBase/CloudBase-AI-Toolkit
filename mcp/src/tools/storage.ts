import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { z } from "zod";
import { getCloudBaseManager, getEnvId } from '../cloudbase-manager.js';
import { ExtendedMcpServer } from '../server.js';

const MAX_INLINE_TEXT_BYTES = 256 * 1024;
const STORAGE_READ_TEMP_PREFIX = 'cloudbase-mcp-storage-read-';

// Input schema for queryStorage tool
const queryStorageInputSchema = {
  action: z.enum(['list', 'info', 'url', 'read']).describe('查询操作类型：list=列出目录下的所有文件，info=获取指定文件的详细信息，url=获取文件的临时下载链接，read=读取文本文件内容'),
  cloudPath: z.string().describe('云端文件路径，例如 files/data.txt 或 files/（目录）'),
  maxAge: z.number().min(1).max(86400).optional().default(3600).describe('临时链接有效期，单位为秒，取值范围：1-86400，默认值：3600（1小时）')
};

// Input schema for manageStorage tool
const manageStorageInputSchema = {
  action: z.enum(['upload', 'download', 'delete']).describe('管理操作类型：upload=上传文件或目录，download=下载文件或目录，delete=删除文件或目录'),
  localPath: z.string().describe('本地文件路径，建议传入绝对路径，例如 /tmp/files/data.txt'),
  cloudPath: z.string().describe('云端文件路径，例如 files/data.txt'),
  force: z.boolean().optional().default(false).describe('强制操作开关，删除操作时建议设置为true以确认删除，默认false'),
  isDirectory: z.boolean().optional().default(false).describe('是否为目录操作，true=目录操作，false=文件操作，默认false')
};

type QueryStorageInput = {
  action: 'list' | 'info' | 'url' | 'read';
  cloudPath: string;
  maxAge?: number;
};

function getStorageTempFileName(cloudPath: string) {
  const baseName = path.posix.basename(cloudPath);
  return baseName || 'storage-file';
}

function decodeInlineTextContent(buffer: Buffer) {
  const inlineBuffer = buffer.subarray(0, MAX_INLINE_TEXT_BYTES);
  if (inlineBuffer.includes(0)) {
    throw new Error('queryStorage action=read 仅支持读取文本文件内容；二进制文件请改用 action=url 获取下载链接，或使用 manageStorage(action="download") 下载到本地。');
  }

  return {
    content: inlineBuffer.toString('utf8'),
    truncated: buffer.length > MAX_INLINE_TEXT_BYTES,
    sizeBytes: buffer.length,
    encoding: 'utf8' as const,
  };
}

type ManageStorageInput = {
  action: 'upload' | 'download' | 'delete';
  localPath: string;
  cloudPath: string;
  force?: boolean;
  isDirectory?: boolean;
};

function getNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildStoragePublicUrl(cdnDomain: string | null, cloudPath: string): string | null {
  if (!cdnDomain) {
    return null;
  }

  const normalizedCloudPath = cloudPath.replace(/^\/+/, '');
  if (!normalizedCloudPath) {
    return `https://${cdnDomain}`;
  }

  return `https://${cdnDomain}/${normalizedCloudPath}`;
}

async function resolveStoragePublicAccess(params: {
  cloudPath: string;
  cloudBaseOptions: ExtendedMcpServer['cloudBaseOptions'];
  manager: {
    commonService: (service: string, version: string) => {
      call: (args: { Action: string; Param: { EnvId: string } }) => Promise<unknown>;
    };
  };
}): Promise<{ storageCdnDomain: string | null; publicUrl: string | null }> {
  const { cloudPath, cloudBaseOptions, manager } = params;

  try {
    const envId = await getEnvId(cloudBaseOptions);
    const describeEnvsResult = await manager.commonService('tcb', '2018-06-08').call({
      Action: 'DescribeEnvs',
      Param: {
        EnvId: envId,
      },
    }) as {
      EnvList?: Array<{
        Storages?: Array<{
          CdnDomain?: string | null;
        }>;
      }>;
      EnvInfo?: {
        Storages?: Array<{
          CdnDomain?: string | null;
        }>;
      };
    };

    const storageList = describeEnvsResult?.EnvList?.[0]?.Storages ?? describeEnvsResult?.EnvInfo?.Storages ?? [];
    const storageCdnDomain = getNonEmptyString(storageList[0]?.CdnDomain);

    return {
      storageCdnDomain,
      publicUrl: buildStoragePublicUrl(storageCdnDomain, cloudPath),
    };
  } catch {
    return {
      storageCdnDomain: null,
      publicUrl: null,
    };
  }
}

export function registerStorageTools(server: ExtendedMcpServer) {
  // 获取 cloudBaseOptions，如果没有则为 undefined
  const cloudBaseOptions = server.cloudBaseOptions;

  // 创建闭包函数来获取 CloudBase Manager
  const getManager = () => getCloudBaseManager({ cloudBaseOptions });

  // Tool 1: queryStorage - 查询存储信息（只读操作）
  server.registerTool(
    "queryStorage",
    {
      title: "查询存储信息",
      description: "查询云存储信息，支持列出目录文件、获取文件信息、获取临时下载链接等只读操作。返回的文件信息包括文件名、大小、修改时间、下载链接等。注意：action=url 返回的 temporaryUrl 是临时签名链接，有效期由 maxAge 参数决定（默认1小时），不要当作永久公网地址使用。工具还会基于 DescribeEnvs 返回的 Storages[0].CdnDomain 推导出 publicUrl，⚠️ 警告：publicUrl 仅在存储桶 ACL 为公有读（所有用户可读）时才能被匿名访问；默认私有读写存储桶返回的 publicUrl 会 403，此时请继续使用 temporaryUrl 或先通过控制台/SDK 将目标路径设置为公有读。",
      inputSchema: queryStorageInputSchema,
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
        category: "storage"
      }
    },
    async (args: QueryStorageInput) => {
      const input = args;
      const manager = await getManager();

      if (!manager) {
        throw new Error("Failed to initialize CloudBase manager. Please check your credentials and environment configuration.");
      }

      const storageService = manager.storage;

      switch (input.action) {
        case 'list': {
          const result = await storageService.listDirectoryFiles(input.cloudPath);

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: true,
                  data: {
                    action: 'list',
                    cloudPath: input.cloudPath,
                    files: result || [],
                    totalCount: result?.length || 0
                  },
                  message: `Successfully listed ${result?.length || 0} files in directory '${input.cloudPath}'`
                }, null, 2)
              }
            ]
          };
        }

        case 'info': {
          const result = await storageService.getFileInfo(input.cloudPath);

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: true,
                  data: {
                    action: 'info',
                    cloudPath: input.cloudPath,
                    fileInfo: result
                  },
                  message: `Successfully retrieved file info for '${input.cloudPath}'`
                }, null, 2)
              }
            ]
          };
        }

        case 'url': {
          const result = await storageService.getTemporaryUrl([{
            cloudPath: input.cloudPath,
            maxAge: input.maxAge || 3600
          }]);
          const publicAccess = await resolveStoragePublicAccess({
            cloudPath: input.cloudPath,
            cloudBaseOptions,
            manager,
          });

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: true,
                  data: {
                    action: 'url',
                    cloudPath: input.cloudPath,
                    temporaryUrl: result[0]?.url || "",
                    expireTime: `${input.maxAge || 3600}秒`,
                    fileId: result[0]?.fileId || "",
                    storageCdnDomain: publicAccess.storageCdnDomain,
                    publicUrl: publicAccess.publicUrl,
                    note: "temporaryUrl 是临时签名链接，会按 expireTime 过期。publicUrl 基于 DescribeEnvs 返回的 Storages[0].CdnDomain 推导，⚠️ 仅在存储桶 ACL 为公有读（所有用户可读）时才能被匿名访问；默认私有读写存储桶返回的 publicUrl 会 403，此时请继续使用 temporaryUrl 或先将目标路径设置为公有读。"
                  },
                  message: `Successfully generated temporary URL for '${input.cloudPath}'`
                }, null, 2)
              }
            ]
          };
        }

        case 'read': {
          const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), STORAGE_READ_TEMP_PREFIX));
          const localPath = path.join(tempDir, getStorageTempFileName(input.cloudPath));

          try {
            await storageService.downloadFile({
              cloudPath: input.cloudPath,
              localPath
            });

            const buffer = await fs.readFile(localPath);
            const decoded = decodeInlineTextContent(buffer);

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    success: true,
                    data: {
                      action: 'read',
                      cloudPath: input.cloudPath,
                      content: decoded.content,
                      encoding: decoded.encoding,
                      sizeBytes: decoded.sizeBytes,
                      truncated: decoded.truncated
                    },
                    message: decoded.truncated
                      ? `Successfully read text content for '${input.cloudPath}' (truncated to ${MAX_INLINE_TEXT_BYTES} bytes)`
                      : `Successfully read text content for '${input.cloudPath}'`
                  }, null, 2)
                }
              ]
            };
          } finally {
            await fs.rm(tempDir, { recursive: true, force: true });
          }
        }

        default:
          throw new Error(`Unsupported action: ${input.action}`);
      }
    }
  );

  // Tool 2: manageStorage - 管理存储文件（写操作）
  server.registerTool(
    "manageStorage",
    {
      title: "管理存储文件",
      description: "管理云存储文件，仅用于 COS/Storage 对象，不用于静态网站托管。支持上传文件/目录、下载文件/目录、删除文件/目录等操作。删除操作需要设置force=true进行确认，防止误删除重要文件。注意：上传后返回的 temporaryUrl 是临时签名链接，1小时后过期，不要当作永久公网地址写入配置或持久化存储。工具还会基于 DescribeEnvs 返回的 Storages[0].CdnDomain 推导 publicUrl，⚠️ 警告：publicUrl 仅在存储桶 ACL 为公有读（所有用户可读）时才能被匿名访问；默认私有读写存储桶返回的 publicUrl 会 403，此时请继续使用 temporaryUrl 或先通过控制台/SDK 将目标路径设置为公有读。",
      inputSchema: manageStorageInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
        category: "storage"
      }
    },
    async (args: ManageStorageInput) => {
      const input = args;
      const manager = await getManager();

      if (!manager) {
        throw new Error("Failed to initialize CloudBase manager. Please check your credentials and environment configuration.");
      }

      const storageService = manager.storage;

      switch (input.action) {
        case 'upload': {
          if (input.isDirectory) {
            await storageService.uploadDirectory({
              localPath: input.localPath,
              cloudPath: input.cloudPath,
              onProgress: (progressData: any) => {
                console.log("Upload directory progress:", progressData);
              }
            });
          } else {
            await storageService.uploadFile({
              localPath: input.localPath,
              cloudPath: input.cloudPath,
              onProgress: (progressData: any) => {
                console.log("Upload file progress:", progressData);
              }
            });
          }

          const fileUrls = await storageService.getTemporaryUrl([{
            cloudPath: input.cloudPath,
            maxAge: 3600
          }]);
          const publicAccess = await resolveStoragePublicAccess({
            cloudPath: input.cloudPath,
            cloudBaseOptions,
            manager,
          });

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: true,
                  data: {
                    action: 'upload',
                    localPath: input.localPath,
                    cloudPath: input.cloudPath,
                    isDirectory: input.isDirectory,
                    temporaryUrl: fileUrls[0]?.url || "",
                    expireTime: "1小时",
                    storageCdnDomain: publicAccess.storageCdnDomain,
                    publicUrl: publicAccess.publicUrl,
                    note: "temporaryUrl 是临时签名链接，1小时后过期，不要当作永久公网地址写入配置或持久化存储。publicUrl 基于 DescribeEnvs 返回的 Storages[0].CdnDomain 推导，⚠️ 仅在存储桶 ACL 为公有读（所有用户可读）时才能被匿名访问；默认私有读写存储桶返回的 publicUrl 会 403，此时请继续使用 temporaryUrl 或先将目标路径设置为公有读。"
                  },
                  message: `Successfully uploaded ${input.isDirectory ? 'directory' : 'file'} from '${input.localPath}' to '${input.cloudPath}'`
                }, null, 2)
              }
            ]
          };
        }

        case 'download': {
          if (input.isDirectory) {
            await storageService.downloadDirectory({
              cloudPath: input.cloudPath,
              localPath: input.localPath
            });
          } else {
            await storageService.downloadFile({
              cloudPath: input.cloudPath,
              localPath: input.localPath
            });
          }

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: true,
                  data: {
                    action: 'download',
                    cloudPath: input.cloudPath,
                    localPath: input.localPath,
                    isDirectory: input.isDirectory
                  },
                  message: `Successfully downloaded ${input.isDirectory ? 'directory' : 'file'} from '${input.cloudPath}' to '${input.localPath}'`
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
                    message: "Please set force: true to confirm deletion. This action cannot be undone."
                  }, null, 2)
                }
              ]
            };
          }

          if (input.isDirectory) {
            await storageService.deleteDirectory(input.cloudPath);
          } else {
            await storageService.deleteFile([input.cloudPath]);
          }

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: true,
                  data: {
                    action: 'delete',
                    cloudPath: input.cloudPath,
                    isDirectory: input.isDirectory,
                    deleted: true
                  },
                  message: `Successfully deleted ${input.isDirectory ? 'directory' : 'file'} '${input.cloudPath}'`
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
