import { z } from "zod";
import { getCloudBaseManager } from '../cloudbase-manager.js';
import { ExtendedMcpServer } from '../server.js';

// Input schema for queryStorage tool
const queryStorageInputSchema = {
  action: z.enum(['list', 'info', 'url']).describe('查询操作类型：list=列出目录下的所有文件，info=获取指定文件的详细信息，url=获取文件的临时下载链接'),
  cloudPath: z.string().describe('云端文件路径，例如 files/data.txt 或 files/（目录）'),
  maxAge: z.number().min(1).max(86400).optional().default(3600).describe('临时链接有效期，单位为秒，取值范围：1-86400，默认值：3600（1小时）')
};

// Input schema for manageStorage tool
const manageStorageInputSchema = {
  action: z.enum(['upload', 'download', 'delete']).describe('管理操作类型：upload=上传文件或目录，download=下载文件或目录，delete=删除文件或目录'),
  localPath: z.string().describe('本地文件路径，用于上传或下载操作。必须是绝对路径，例如：/Users/username/files/data.txt'),
  cloudPath: z.string().describe('云端文件路径，例如 files/data.txt'),
  force: z.boolean().optional().default(false).describe('强制操作开关，删除操作时建议设置为true以确认删除，默认false'),
  isDirectory: z.boolean().optional().default(false).describe('是否为目录操作，true=目录操作，false=文件操作，默认false')
};

type QueryStorageInput = {
  action: 'list' | 'info' | 'url';
  cloudPath: string;
  maxAge?: number;
};

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
      description: "查询云存储信息，支持列出目录文件、获取文件信息、获取临时下载链接等只读操作。返回的文件信息包括文件名、大小、修改时间、下载链接等。",
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
      description: "管理云存储文件，支持上传文件/目录、下载文件/目录、删除文件/目录等操作。删除操作需要设置force=true进行确认，防止误删除重要文件。",
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