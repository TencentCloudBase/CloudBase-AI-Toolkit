import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { z } from "zod";
import { getCloudBaseManager } from '../cloudbase-manager.js';
import { ExtendedMcpServer } from '../server.js';

const MAX_INLINE_TEXT_BYTES = 256 * 1024;
const STORAGE_READ_TEMP_PREFIX = 'cloudbase-mcp-storage-read-';

// Input schema for queryStorage tool
const queryStorageInputSchema = {
  action: z.enum(['list', 'info', 'url', 'read']).describe("查询操作类型。可选值：'list'（列出目录文件）, 'info'（获取文件信息）, 'url'（获取临时下载链接）, 'read'（读取文本内容）。示例：action='list'"),
  cloudPath: z.string().describe("云端文件路径，格式为'目录/文件名'或'目录/'（目录以/结尾）。正确示例：'images/photo.jpg'、'data/'（列出data目录）、'docs/readme.txt'。错误示例：'/images/photo.jpg'（不要以/开头）"),
  maxAge: z.number().min(1).max(86400).optional().default(3600).describe("临时链接有效期（单位：秒），仅当action='url'时有效。取值范围：1-86400，默认值：3600（1小时）。示例：maxAge=7200（2小时）")
};

// Input schema for manageStorage tool
const manageStorageInputSchema = {
  action: z.enum(['upload', 'download', 'delete']).describe("管理操作类型。可选值：'upload'（上传）, 'download'（下载）, 'delete'（删除）。示例：action='upload'"),
  localPath: z.string().describe("本地文件绝对路径。示例：'/Users/name/documents/file.txt'（macOS/Linux）、'C:/Users/name/documents/file.txt'（Windows）"),
  cloudPath: z.string().describe("云端文件路径，格式为'目录/文件名'。正确示例：'images/photo.jpg'、'backup/data.zip'。错误示例：'/images/photo.jpg'（不要以/开头）"),
  force: z.boolean().optional().default(false).describe("删除操作确认开关。当action='delete'时必须设置为true以确认删除，防止误删。默认值：false。示例：force=true"),
  isDirectory: z.boolean().optional().default(false).describe("是否为目录操作。true表示操作目录，false表示操作单个文件。默认值：false。示例：isDirectory=true（上传/下载/删除整个目录）")
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
      description: "查询云存储信息，支持列出目录文件、获取文件信息、获取临时下载链接等只读操作。\n\n使用示例：\n- 列出目录文件: { action: 'list', cloudPath: 'images/' }\n- 获取文件信息: { action: 'info', cloudPath: 'images/photo.jpg' }\n- 获取下载链接: { action: 'url', cloudPath: 'docs/file.pdf', maxAge: 3600 }\n- 读取文本内容: { action: 'read', cloudPath: 'config.json' }\n\n注意：cloudPath不要以/开头，应直接使用相对路径如'images/photo.jpg'",
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
                    fileId: result[0]?.fileId || ""
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
      description: "管理云存储文件，仅用于 COS/Storage 对象，不用于静态网站托管。支持上传文件/目录、下载文件/目录、删除文件/目录等操作。\n\n使用示例：\n- 上传文件: { action: 'upload', localPath: '/Users/name/file.txt', cloudPath: 'docs/file.txt' }\n- 上传目录: { action: 'upload', localPath: '/Users/name/images', cloudPath: 'backup/images', isDirectory: true }\n- 下载文件: { action: 'download', localPath: '/tmp/file.txt', cloudPath: 'docs/file.txt' }\n- 删除文件: { action: 'delete', cloudPath: 'docs/file.txt', force: true }\n- 删除目录: { action: 'delete', cloudPath: 'backup/images', isDirectory: true, force: true }\n\n注意：\n1. cloudPath不要以/开头，应直接使用相对路径如'images/photo.jpg'\n2. 删除操作必须设置force=true进行确认\n3. 操作目录时必须设置isDirectory=true",
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
                    expireTime: "1小时"
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
