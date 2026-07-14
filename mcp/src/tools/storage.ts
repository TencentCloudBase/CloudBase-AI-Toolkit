import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { z } from "zod";
import { getCloudBaseManager, getEnvId } from '../cloudbase-manager.js';
import { ExtendedMcpServer } from '../server.js';
import { buildJsonToolResult } from '../utils/tool-result.js';

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
  localPath: z.string().optional().describe('本地文件路径，建议传入绝对路径，例如 /tmp/files/data.txt；upload/download 操作时必填，delete 操作时不需要传该参数'),
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
  localPath?: string;
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
  const storageOverrides = server.pluginOptions?.storage;

  // 创建闭包函数来获取 CloudBase Manager
  const getManager = () => getCloudBaseManager({ cloudBaseOptions });

  // Tool 1: queryStorage - 查询存储信息（只读操作）
  server.registerTool(
    "queryStorage",
    {
      title: "查询 CloudBase 存储信息",
      description: "⚠️ PG 模式环境请使用 queryPgStorage 而非本工具（pgstore 与旧 COS 是两套独立系统）。\n\n查询 CloudBase 云存储信息，支持列出目录文件、获取文件信息、获取临时下载链接等只读操作。返回的文件信息包括文件名、大小、修改时间、下载链接等。注意：action=url 返回的 temporaryUrl 是临时签名链接，有效期由 maxAge 参数决定（默认1小时），不要当作永久公网地址使用。工具还会基于 DescribeEnvs 返回的 Storages[0].CdnDomain 推导 publicUrl，⚠️ 警告：publicUrl 仅在存储桶 ACL 为公有读（所有用户可读）时才能被匿名访问；默认私有读写存储桶返回的 publicUrl 会 403，此时请继续使用 temporaryUrl 或先通过控制台/SDK 将目标路径设置为公有读。\n\n💡 存储桶 ACL 权限管理请使用 permissions 工具：queryPermissions(action=\"getResourcePermission\", resourceType=\"storage\", resourceId=\"bucket-name\") 查询，managePermissions(action=\"updateResourcePermission\", resourceType=\"storage\", resourceId=\"bucket-name\", permission=\"READONLY\") 设置。\n\n📦 CloudBase PG / pgstore 环境：`DescribeEnvs.Storages[]` 列出的 bucket 是旧 NoSQL 后端的，不等于 pgstore bucket。本工具用于查看常规存储；为 PG 浏览器上传准备 bucket 时，请确认目标 bucket 是 pgstore 后端可用的，否则浏览器 `app.storage.from().upload(...)` 会得到 `STORAGE_BUCKET_NOT_FOUND` 并出现 `PUT https://undefined/`。",
      inputSchema: queryStorageInputSchema,
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
        category: "storage"
      }
    },
    async (args: QueryStorageInput) => {
      const input = args;
      try {
        const manager = await getManager();

        if (!manager) {
          throw new Error("Failed to initialize CloudBase manager. Please check your credentials and environment configuration.");
        }

        const storageService = manager.storage;

      switch (input.action) {
        case 'list': {
          let files: any[];
          if (storageOverrides?.listFiles) {
            files = await storageOverrides.listFiles({ cloudPath: input.cloudPath });
          } else {
            const result = await storageService.listDirectoryFiles(input.cloudPath);
            files = result || [];
          }

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: true,
                  data: {
                    action: 'list',
                    cloudPath: input.cloudPath,
                    files,
                    totalCount: files.length
                  },
                  message: `Successfully listed ${files.length} files in directory '${input.cloudPath}'`
                }, null, 2)
              }
            ]
          };
        }

        case 'info': {
          let fileInfo: any;
          if (storageOverrides?.getFileInfo) {
            fileInfo = await storageOverrides.getFileInfo({ cloudPath: input.cloudPath });
          } else {
            fileInfo = await storageService.getFileInfo(input.cloudPath);
          }

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: true,
                  data: {
                    action: 'info',
                    cloudPath: input.cloudPath,
                    fileInfo
                  },
                  message: `Successfully retrieved file info for '${input.cloudPath}'`
                }, null, 2)
              }
            ]
          };
        }

        case 'url': {
          let temporaryUrl = "";
          let fileId = "";
          if (storageOverrides?.getFileUrl) {
            const urlResult = await storageOverrides.getFileUrl({
              cloudPath: input.cloudPath,
              maxAge: input.maxAge || 3600,
            });
            temporaryUrl = urlResult.url;
            fileId = urlResult.fileId || "";
          } else {
            const result = await storageService.getTemporaryUrl([{
              cloudPath: input.cloudPath,
              maxAge: input.maxAge || 3600
            }]);
            temporaryUrl = result[0]?.url || "";
            fileId = result[0]?.fileId || "";
          }
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
                    temporaryUrl,
                    expireTime: `${input.maxAge || 3600}秒`,
                    fileId,
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
            if (storageOverrides?.downloadFile) {
              await storageOverrides.downloadFile({ cloudPath: input.cloudPath, localPath });
            } else {
              await storageService.downloadFile({
                cloudPath: input.cloudPath,
                localPath
              });
            }

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
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return buildJsonToolResult({
        success: false,
        message: `queryStorage 操作失败: ${message}`,
        action: input.action,
        cloudPath: input.cloudPath,
      });
    }
  }
  );

  // Tool 2: manageStorage - 管理存储文件（写操作）
  server.registerTool(
    "manageStorage",
    {
      title: "管理 CloudBase 存储文件",
      description: "⚠️ PG 模式环境请使用 queryPgStorage 而非本工具（pgstore 与旧 COS 是两套独立系统）。\n\n管理 CloudBase 云存储文件，仅用于 COS/Storage 对象，不用于静态网站托管。支持上传文件/目录、下载文件/目录、删除文件/目录等操作。删除操作需要设置force=true进行确认，防止误删除重要文件。注意：上传后返回的 temporaryUrl 是临时签名链接，1小时后过期，不要当作永久公网地址写入配置或持久化存储。工具还会基于 DescribeEnvs 返回的 Storages[0].CdnDomain 推导 publicUrl，⚠️ 警告：publicUrl 仅在存储桶 ACL 为公有读（所有用户可读）时才能被匿名访问；默认私有读写存储桶返回的 publicUrl 会 403，此时请继续使用 temporaryUrl 或先通过控制台/SDK 将目标路径设置为公有读。\n\n💡 存储桶 ACL 权限管理请使用 permissions 工具：queryPermissions(action=\"getResourcePermission\", resourceType=\"storage\", resourceId=\"bucket-name\") 查询，managePermissions(action=\"updateResourcePermission\", resourceType=\"storage\", resourceId=\"bucket-name\", permission=\"READONLY\") 设置。\n\n📦 CloudBase PG / pgstore 桶必须先创建后使用（与 Supabase Storage 一致：upload 前 bucket 必须存在）。浏览器 SDK `app.storage.from().upload(path, file)` 不会自动建桶，且 `path` 的第一段就是 bucket 名（例如 `covers/foo.png` → bucket=`covers`）；`from('covers')` 这个参数当前不会被拼到 path 里。如果上传时浏览器看到 `STORAGE_BUCKET_NOT_FOUND` 或 `PUT https://undefined/`（DevTools 表现为 `net::ERR_NAME_NOT_RESOLVED`），先用本工具或控制台确认 / 创建对应的 pgstore bucket，再让前端重试上传，不要让前端把上传失败静默吞掉。`DescribeEnvs.Storages[]` 返回的旧 NoSQL bucket（形如 `<hash>-<envId>-<appId>`）不是可用的 pgstore bucket，切勿当作默认目标使用。",
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
      try {
        const manager = await getManager();

        if (!manager) {
          throw new Error("Failed to initialize CloudBase manager. Please check your credentials and environment configuration.");
        }

      const storageService = manager.storage;

      switch (input.action) {
        case 'upload': {
          const localPath = input.localPath!;
          const cloudPath = input.cloudPath!;
          if (input.isDirectory) {
            if (storageOverrides?.uploadDirectory) {
              await storageOverrides.uploadDirectory({ localPath, cloudPath });
            } else {
              await storageService.uploadDirectory({
                localPath,
                cloudPath,
                onProgress: (progressData: any) => {
                  console.log("Upload directory progress:", progressData);
                }
              });
            }
          } else {
            if (storageOverrides?.uploadFile) {
              await storageOverrides.uploadFile({ localPath, cloudPath });
            } else {
              await storageService.uploadFile({
                localPath,
                cloudPath,
                onProgress: (progressData: any) => {
                  console.log("Upload file progress:", progressData);
                }
              });
            }
          }

          // 上传成功后获取临时 URL 和公网访问信息
          let temporaryUrl = "";
          let fileId = "";
          if (storageOverrides?.getFileUrl) {
            const urlResult = await storageOverrides.getFileUrl({
              cloudPath: input.cloudPath,
              maxAge: 3600,
            });
            temporaryUrl = urlResult.url;
            fileId = urlResult.fileId || "";
          } else {
            try {
              const fileUrls = await storageService.getTemporaryUrl([{
                cloudPath: input.cloudPath,
                maxAge: 3600
              }]);
              temporaryUrl = fileUrls[0]?.url || "";
              fileId = fileUrls[0]?.fileId || "";
            } catch {
              // StorageOverrides 下 getTemporaryUrl 可能不可用
            }
          }
          let publicAccess: any = {};
          try {
            publicAccess = await resolveStoragePublicAccess({
              cloudPath: input.cloudPath,
              cloudBaseOptions,
              manager,
            });
          } catch {
            // DescribeEnvs 可能不支持（IDE 模式下会绕过）
            publicAccess = {};
          }

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
                    temporaryUrl,
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
          const dlCloudPath = input.cloudPath!;
          const dlLocalPath = input.localPath!;
          if (input.isDirectory) {
            if (storageOverrides?.downloadDirectory) {
              await storageOverrides.downloadDirectory({ cloudPath: dlCloudPath, localPath: dlLocalPath });
            } else {
              await storageService.downloadDirectory({
                cloudPath: dlCloudPath,
                localPath: dlLocalPath
              });
            }
          } else {
            if (storageOverrides?.downloadFile) {
              await storageOverrides.downloadFile({ cloudPath: dlCloudPath, localPath: dlLocalPath });
            } else {
              await storageService.downloadFile({
                cloudPath: dlCloudPath,
                localPath: dlLocalPath
              });
            }
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
            if (storageOverrides?.deleteDirectory) {
              await storageOverrides.deleteDirectory({ cloudPath: input.cloudPath });
            } else {
              await storageService.deleteDirectory(input.cloudPath);
            }
          } else {
            if (storageOverrides?.deleteFiles) {
              await storageOverrides.deleteFiles({ cloudPaths: [input.cloudPath] });
            } else {
              await storageService.deleteFile([input.cloudPath]);
            }
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
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return buildJsonToolResult({
        success: false,
        message: `manageStorage 操作失败: ${message}`,
        action: input.action,
        cloudPath: input.cloudPath,
      });
    }
  }
  );
}
