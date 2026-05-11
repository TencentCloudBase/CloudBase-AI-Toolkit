import * as crypto from "crypto";
import * as fs from "fs";
import * as fsPromises from "fs/promises";
import * as http from "http";
import * as https from "https";
import * as net from "net";
import * as os from "os";
import * as path from "path";
import { URL } from "url";
import { z } from "zod";

import * as dns from "dns";
import { ExtendedMcpServer } from '../server.js';

// 常量定义
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const ALLOWED_PROTOCOLS = ["http:", "https:"];
const ALLOWED_CONTENT_TYPES = [
  "text/",
  "image/",
  "application/json",
  "application/xml",
  "application/pdf",
  "application/zip",
  "application/x-zip-compressed"
];

// 获取项目根目录
function getProjectRoot(): string {
  // 优先级：环境变量 > 当前工作目录
  return process.env.WORKSPACE_FOLDER_PATHS || 
         process.env.PROJECT_ROOT || 
         process.env.GITHUB_WORKSPACE || 
         process.env.CI_PROJECT_DIR || 
         process.env.BUILD_SOURCESDIRECTORY || 
         process.cwd();
}

// 验证相对路径是否安全（不允许路径遍历）
function isPathSafe(relativePath: string): boolean {
  // 检查是否包含路径遍历操作
  if (relativePath.includes('..') || 
      relativePath.includes('~') || 
      path.isAbsolute(relativePath)) {
    return false;
  }
  
  // 检查路径是否规范化后仍然安全
  const normalizedPath = path.normalize(relativePath);
  if (normalizedPath.startsWith('..') || 
      normalizedPath.startsWith('/') || 
      normalizedPath.startsWith('\\')) {
    return false;
  }
  
  return true;
}

// 计算最终下载路径
function calculateDownloadPath(relativePath: string): string {
  const projectRoot = getProjectRoot();
  const finalPath = path.join(projectRoot, relativePath);
  
  // 确保最终路径在项目根目录内
  const normalizedProjectRoot = path.resolve(projectRoot);
  const normalizedFinalPath = path.resolve(finalPath);
  
  if (!normalizedFinalPath.startsWith(normalizedProjectRoot)) {
    throw new Error('相对路径超出项目根目录范围');
  }
  
  return finalPath;
}

// 检查是否为内网 IP
function isPrivateIP(ip: string): boolean {
  // 如果不是有效的 IP 地址，返回 true（保守处理）
  if (!net.isIP(ip)) {
    return true;
  }

  // 检查特殊地址
  if (ip === '127.0.0.1' || 
      ip === 'localhost' ||
      ip === '::1' || // IPv6 本地回环
      ip.startsWith('169.254.') || // 链路本地地址
      ip.startsWith('0.')) { // 特殊用途地址
    return true;
  }

  // 转换 IP 地址为长整数进行范围检查
  const ipv4Parts = ip.split('.').map(part => parseInt(part, 10));
  if (ipv4Parts.length === 4) {
    const ipNum = ((ipv4Parts[0] << 24) >>> 0) + (ipv4Parts[1] << 16) + (ipv4Parts[2] << 8) + ipv4Parts[3];
    
    // 检查私有 IP 范围
    // 10.0.0.0 - 10.255.255.255
    if (ipNum >= 167772160 && ipNum <= 184549375) return true;
    
    // 172.16.0.0 - 172.31.255.255
    if (ipNum >= 2886729728 && ipNum <= 2887778303) return true;
    
    // 192.168.0.0 - 192.168.255.255
    if (ipNum >= 3232235520 && ipNum <= 3232301055) return true;
  }
  
  // 检查 IPv6 私有地址
  if (net.isIPv6(ip)) {
    const normalizedIP = ip.toLowerCase();
    if (normalizedIP.startsWith('fc00:') || // 唯一本地地址
        normalizedIP.startsWith('fe80:') || // 链路本地地址
        normalizedIP.startsWith('fec0:') || // 站点本地地址
        normalizedIP.startsWith('::1')) { // 本地回环
      return true;
    }
  }

  return false;
}

// 检查域名是否解析到内网 IP
async function doesDomainResolveToPrivateIP(hostname: string): Promise<boolean> {
  try {
    const addresses = await new Promise<string[]>((resolve, reject) => {
      dns.resolve(hostname, (err, addresses) => {
        if (err) reject(err);
        else resolve(addresses);
      });
    });
    
    return addresses.some(ip => isPrivateIP(ip));
  } catch (error) {
    // 如果解析失败，为安全起见返回 true
    return true;
  }
}

// 生成随机文件名
function generateRandomFileName(extension = '') {
  const randomBytes = crypto.randomBytes(16);
  const fileName = randomBytes.toString('hex');
  return `${fileName}${extension}`;
}

// 获取安全的临时文件路径
function getSafeTempFilePath(fileName: string) {
  return path.join(os.tmpdir(), fileName);
}

// 从 URL 或 Content-Disposition 获取文件扩展名
function getFileExtension(url: string, contentType: string, contentDisposition?: string): string {
  let extension = "";
  
  // 从 URL 获取扩展名
  const urlPath = new URL(url).pathname;
  const urlExt = path.extname(urlPath);
  if (urlExt) {
    extension = urlExt;
  }
  
  // 从 Content-Disposition 获取扩展名
  if (contentDisposition) {
    const filenameMatch = contentDisposition.match(/filename=["']?([^"']+)["']?/);
    if (filenameMatch) {
      const dispositionExt = path.extname(filenameMatch[1]);
      if (dispositionExt) {
        extension = dispositionExt;
      }
    }
  }
  
  // 从 Content-Type 获取扩展名
  if (!extension && contentType) {
    const mimeToExt: { [key: string]: string } = {
      "text/plain": ".txt",
      "text/html": ".html",
      "text/css": ".css",
      "text/javascript": ".js",
      "image/jpeg": ".jpg",
      "image/png": ".png",
      "image/gif": ".gif",
      "image/webp": ".webp",
      "application/json": ".json",
      "application/xml": ".xml",
      "application/pdf": ".pdf",
      "application/zip": ".zip",
      "application/x-zip-compressed": ".zip"
    };
    extension = mimeToExt[contentType] || "";
  }
  
  return extension;
}

// 验证 URL 和内容类型是否安全
async function isUrlAndContentTypeSafe(url: string, contentType: string): Promise<boolean> {
  try {
    const parsedUrl = new URL(url);
    
    // 检查协议
    if (!ALLOWED_PROTOCOLS.includes(parsedUrl.protocol)) {
      return false;
    }
    
    // 检查主机名是否为 IP 地址
    const hostname = parsedUrl.hostname;
    if (net.isIP(hostname) && isPrivateIP(hostname)) {
      return false;
    }
    
    // 如果是域名，检查它是否解析到内网 IP
    if (!net.isIP(hostname) && await doesDomainResolveToPrivateIP(hostname)) {
      return false;
    }
    
    // 检查内容类型
    return ALLOWED_CONTENT_TYPES.some(allowedType => contentType.startsWith(allowedType));
  } catch {
    return false;
  }
}

// 检查是否为可重试的网络错误
function isRetryableError(error: NodeJS.ErrnoException): boolean {
  const retryableCodes = [
    'ECONNRESET',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'ESOCKETTIMEDOUT',
    'ENOTFOUND',
    'EHOSTUNREACH',
    'ENETUNREACH',
    'ECONNABORTED'
  ];
  return retryableCodes.includes(error.code || '');
}

// 下载文件到指定路径（带重试逻辑）
function downloadFileToPath(url: string, targetPath: string, retryCount = 0): Promise<{
  filePath: string;
  contentType: string;
  fileSize: number;
}> {
  const MAX_RETRIES = 3;
  const BASE_DELAY_MS = 1000; // 1秒基础延迟

  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http;

    const request = client.get(url, async (res) => {
      // 处理重定向
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        try {
          return resolve(await downloadFileToPath(res.headers.location, targetPath, retryCount));
        } catch (error) {
          return reject(error);
        }
      }

      if (res.statusCode !== 200) {
        reject(new Error(`HTTP Error: ${res.statusCode}`));
        return;
      }

      const contentType = res.headers['content-type'] || '';
      const contentLength = parseInt(res.headers['content-length'] || '0', 10);
      const contentDisposition = res.headers['content-disposition'];

      // 安全检查
      if (!await isUrlAndContentTypeSafe(url, contentType)) {
        reject(new Error('不安全的 URL 或内容类型，或者目标为内网地址'));
        return;
      }

      // 文件大小检查
      if (contentLength > MAX_FILE_SIZE) {
        reject(new Error(`文件大小 ${contentLength} 字节超过 ${MAX_FILE_SIZE} 字节限制`));
        return;
      }

      // 确保目标目录存在
      const targetDir = path.dirname(targetPath);
      try {
        await fsPromises.mkdir(targetDir, { recursive: true });
      } catch (error) {
        reject(new Error(`无法创建目标目录: ${error instanceof Error ? error.message : '未知错误'}`));
        return;
      }

      // 创建写入流
      const fileStream = fs.createWriteStream(targetPath);
      let downloadedSize = 0;

      res.on('data', (chunk) => {
        downloadedSize += chunk.length;
        if (downloadedSize > MAX_FILE_SIZE) {
          fileStream.destroy();
          fsPromises.unlink(targetPath).catch(() => {});
          reject(new Error(`文件大小超过 ${MAX_FILE_SIZE} 字节限制`));
        }
      });

      res.pipe(fileStream);

      fileStream.on('finish', () => {
        resolve({
          filePath: targetPath,
          contentType,
          fileSize: downloadedSize
        });
      });

      fileStream.on('error', (error: NodeJS.ErrnoException) => {
        fsPromises.unlink(targetPath).catch(() => {});
        reject(error);
      });
    });

    request.on('error', async (error: NodeJS.ErrnoException) => {
      // 检查是否可重试
      if (isRetryableError(error) && retryCount < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, retryCount); // 指数退避
        console.warn(`下载失败 (${error.code})，${delay}ms 后重试 (${retryCount + 1}/${MAX_RETRIES})...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        try {
          return resolve(await downloadFileToPath(url, targetPath, retryCount + 1));
        } catch (retryError) {
          return reject(retryError);
        }
      }
      reject(error);
    });
  });
}

// 下载文件到临时目录（保持向后兼容，带重试逻辑）
function downloadFile(url: string, retryCount = 0): Promise<{
  filePath: string;
  contentType: string;
  fileSize: number;
}> {
  const MAX_RETRIES = 3;
  const BASE_DELAY_MS = 1000; // 1秒基础延迟

  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http;

    const request = client.get(url, async (res) => {
      // 处理重定向
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        try {
          return resolve(await downloadFile(res.headers.location, retryCount));
        } catch (error) {
          return reject(error);
        }
      }

      if (res.statusCode !== 200) {
        reject(new Error(`HTTP Error: ${res.statusCode}`));
        return;
      }

      const contentType = res.headers['content-type'] || '';
      const contentLength = parseInt(res.headers['content-length'] || '0', 10);
      const contentDisposition = res.headers['content-disposition'];

      // 安全检查
      if (!await isUrlAndContentTypeSafe(url, contentType)) {
        reject(new Error('不安全的 URL 或内容类型，或者目标为内网地址'));
        return;
      }

      // 文件大小检查
      if (contentLength > MAX_FILE_SIZE) {
        reject(new Error(`文件大小 ${contentLength} 字节超过 ${MAX_FILE_SIZE} 字节限制`));
        return;
      }

      // 生成临时文件路径
      const extension = getFileExtension(url, contentType, contentDisposition);
      const fileName = generateRandomFileName(extension);
      const filePath = getSafeTempFilePath(fileName);

      // 创建写入流
      const fileStream = fs.createWriteStream(filePath);
      let downloadedSize = 0;

      res.on('data', (chunk) => {
        downloadedSize += chunk.length;
        if (downloadedSize > MAX_FILE_SIZE) {
          fileStream.destroy();
          fsPromises.unlink(filePath).catch(() => {});
          reject(new Error(`文件大小超过 ${MAX_FILE_SIZE} 字节限制`));
        }
      });

      res.pipe(fileStream);

      fileStream.on('finish', () => {
        resolve({
          filePath,
          contentType,
          fileSize: downloadedSize
        });
      });

      fileStream.on('error', (error: NodeJS.ErrnoException) => {
        fsPromises.unlink(filePath).catch(() => {});
        reject(error);
      });
    });

    request.on('error', async (error: NodeJS.ErrnoException) => {
      // 检查是否可重试
      if (isRetryableError(error) && retryCount < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, retryCount); // 指数退避
        console.warn(`下载失败 (${error.code})，${delay}ms 后重试 (${retryCount + 1}/${MAX_RETRIES})...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        try {
          return resolve(await downloadFile(url, retryCount + 1));
        } catch (retryError) {
          return reject(retryError);
        }
      }
      reject(error);
    });
  });
}

function buildDownloadRemoteFileErrorMessage(url: string, error: unknown): string {
  const baseMessage = error instanceof Error ? error.message : String(error);
  const suggestions: string[] = [];

  if (/HTTP Error:\s*404/i.test(baseMessage)) {
    suggestions.push("目标 URL 当前返回 404，说明资源链接已失效或路径不正确。");
    suggestions.push("请先在浏览器中确认该链接可访问，再重新执行下载。");
  }

  if (/ENOTFOUND|ECONNRESET|ETIMEDOUT|socket hang up/i.test(baseMessage)) {
    suggestions.push("下载过程中出现网络异常，系统已自动重试 3 次但均失败。");
    suggestions.push("建议：1) 检查本地网络或代理设置；2) 该网站可能限频，请尝试更换其他图片源（如 Unsplash、Pexels）；3) 稍后重试。");
  }

  if (suggestions.length === 0) {
    suggestions.push("请检查 URL 是否可访问，以及目标资源是否允许直接下载。");
  }

  return `[downloadRemoteFile] ${baseMessage}\nURL: ${url}\n建议：${suggestions.join(" ")}`;
}

export function registerDownloadTools(server: ExtendedMcpServer) {
  server.registerTool(
    "downloadRemoteFile",
    {
      title: "下载远程文件到指定路径",
      description: "下载远程文件到项目根目录下的指定相对路径。例如：小程序的 Tabbar 等素材图片，必须使用 **png** 格式，可以从 Unsplash、wikimedia【一般选用 500 大小即可、Pexels、Apple 官方 UI 等资源中选择来下载。",
      inputSchema: {
        url: z.string().describe("远程文件的 URL 地址"),
        relativePath: z.string().describe("相对于项目根目录的路径，例如：'assets/images/logo.png' 或 'docs/api.md'。不允许使用 ../ 等路径遍历操作。")
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
        category: "download"
      }
    },
    async ({ url, relativePath }: { url: string; relativePath: string }) => {
      if (!isPathSafe(relativePath)) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                error: "不安全的相对路径",
                message: "相对路径包含路径遍历操作（../）或绝对路径，出于安全考虑已拒绝",
                suggestion: "请使用项目根目录下的相对路径，例如：'assets/images/logo.png'"
              }, null, 2)
            }
          ]
        };
      }

      const targetPath = calculateDownloadPath(relativePath);
      const projectRoot = getProjectRoot();

      console.log(`📁 项目根目录: ${projectRoot}`);
      console.log(`📁 相对路径: ${relativePath}`);
      console.log(`📁 最终路径: ${targetPath}`);

      let result: Awaited<ReturnType<typeof downloadFileToPath>>;
      try {
        result = await downloadFileToPath(url, targetPath);
      } catch (error) {
        throw new Error(buildDownloadRemoteFileErrorMessage(url, error));
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              filePath: result.filePath,
              relativePath: relativePath,
              contentType: result.contentType,
              fileSize: result.fileSize,
              projectRoot: projectRoot,
              message: "文件下载成功到指定路径",
              note: `文件已保存到项目目录: ${relativePath}`
            }, null, 2)
          }
        ]
      };
    }
  );
} 
