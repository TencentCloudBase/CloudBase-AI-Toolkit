import { z } from "zod";
import { ExtendedMcpServer } from "../server.js";
import { info } from "../utils/logger.js";
import ci from "miniprogram-ci";
import { successResult, toMCPResponse } from "../utils/response-builder.js";

// 获取私钥配置
function getPrivateKeyConfig() {
  const privateKey = process.env.MINIPROGRAM_PRIVATE_KEY;
  const privateKeyPath = process.env.MINIPROGRAM_PRIVATE_KEY_PATH;
  
  if (!privateKey && !privateKeyPath) {
    throw new Error("Please set MINIPROGRAM_PRIVATE_KEY or MINIPROGRAM_PRIVATE_KEY_PATH environment variable");
  }
  
  return {
    privateKey,
    privateKeyPath
  };
}

// 创建项目配置
async function createProject(projectPath: string, appId: string, type: "miniProgram" | "miniGame" = "miniProgram") {
  const { privateKey, privateKeyPath } = getPrivateKeyConfig();
  
  return new ci.Project({
    appid: appId,
    type,
    projectPath,
    privateKey,
    privateKeyPath,
    ignores: ["node_modules/**/*"]
  });
}

export function registerMiniprogramTools(server: ExtendedMcpServer) {
  // 上传小程序代码
  server.registerTool?.(
    "uploadMiniprogramCode",
    {
      title: "上传小程序代码",
      description: "上传小程序代码到微信平台",
      inputSchema: {
        appId: z.string().describe("小程序 appId"),
        projectPath: z.string().describe("项目路径"),
        version: z.string().describe("版本号"),
        desc: z.string().optional().describe("版本描述"),
        setting: z.object({
          es6: z.boolean().optional().describe("是否启用 ES6 转 ES5"),
          es7: z.boolean().optional().describe("是否启用 ES7 转 ES5"),
          minify: z.boolean().optional().describe("是否压缩代码"),
          minifyWXSS: z.boolean().optional().describe("是否压缩 WXSS"),
          minifyJS: z.boolean().optional().describe("是否压缩 JS"),
          autoPrefixWXSS: z.boolean().optional().describe("是否自动补全 WXSS"),
        }).optional().describe("编译设置"),
        robot: z.number().optional().describe("机器人编号，1-30"),
        type: z.enum(["miniProgram", "miniGame"]).optional().describe("项目类型")
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
        category: "miniprogram"
      }
    },
    async ({ appId, projectPath, version, desc, setting, robot, type }: {
      appId: string;
      projectPath: string;
      version: string;
      desc?: string;
      setting?: any;
      robot?: number;
      type?: "miniProgram" | "miniGame";
    }) => {
      const project = await createProject(projectPath, appId, type);

      const result = await ci.upload({
        project,
        version,
        desc: desc || `版本 ${version}`,
        setting: {
          es6: true,
          es7: true,
          minify: true,
          minifyWXSS: true,
          minifyJS: true,
          autoPrefixWXSS: true,
          ...setting
        },
        robot: robot || 1,
        onProgressUpdate: (progress: string | any) => {
          info(`上传进度: ${typeof progress === 'string' ? progress : JSON.stringify(progress)}`);
        }
      });

      return toMCPResponse(successResult(
        result,
        "小程序代码上传成功"
        // No nextActions - complete operation
      ));
    }
  );

  // 预览小程序代码
  server.registerTool?.(
    "previewMiniprogramCode",
    {
      title: "预览小程序代码",
      description: "预览小程序代码并生成二维码",
      inputSchema: {
        appId: z.string().describe("小程序 appId"),
        projectPath: z.string().describe("项目路径"),
        desc: z.string().optional().describe("预览描述"),
        setting: z.object({
          es6: z.boolean().optional().describe("是否启用 ES6 转 ES5"),
          es7: z.boolean().optional().describe("是否启用 ES7 转 ES5"),
          minify: z.boolean().optional().describe("是否压缩代码"),
          minifyWXSS: z.boolean().optional().describe("是否压缩 WXSS"),
          minifyJS: z.boolean().optional().describe("是否压缩 JS"),
          autoPrefixWXSS: z.boolean().optional().describe("是否自动补全 WXSS"),
        }).optional().describe("编译设置"),
        robot: z.number().optional().describe("机器人编号，1-30"),
        type: z.enum(["miniProgram", "miniGame"]).optional().describe("项目类型"),
        qrcodeFormat: z.enum(["image", "base64", "terminal"]).optional().describe("二维码格式"),
        qrcodeOutputDest: z.string().optional().describe("二维码输出路径"),
        pagePath: z.string().optional().describe("预览页面路径"),
        searchQuery: z.string().optional().describe("预览页面参数")
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
        category: "miniprogram"
      }
    },
    async ({ appId, projectPath, desc, setting, robot, type, qrcodeFormat, qrcodeOutputDest, pagePath, searchQuery }: {
      appId: string;
      projectPath: string;
      desc?: string;
      setting?: any;
      robot?: number;
      type?: "miniProgram" | "miniGame";
      qrcodeFormat?: "image" | "base64" | "terminal";
      qrcodeOutputDest?: string;
      pagePath?: string;
      searchQuery?: string;
    }) => {
      const project = await createProject(projectPath, appId, type);

      const result = await ci.preview({
        project,
        version: "preview",
        desc: desc || "预览版本",
        setting: {
          es6: true,
          es7: true,
          minify: true,
          minifyWXSS: true,
          minifyJS: true,
          autoPrefixWXSS: true,
          ...setting
        },
        robot: robot || 1,
        qrcodeFormat: qrcodeFormat || "terminal",
        qrcodeOutputDest,
        pagePath,
        searchQuery,
        onProgressUpdate: (progress: string | any) => {
          info(`预览进度: ${typeof progress === 'string' ? progress : JSON.stringify(progress)}`);
        }
      });

      return toMCPResponse(successResult(
        result,
        "小程序预览成功"
        // No nextActions - complete operation
      ));
    }
  );

  // 构建小程序 npm
  server.registerTool?.(
    "buildMiniprogramNpm",
    {
      title: "构建小程序npm",
      description: "构建小程序 npm 包",
      inputSchema: {
        appId: z.string().describe("小程序 appId"),
        projectPath: z.string().describe("项目路径"),
        type: z.enum(["miniProgram", "miniGame"]).optional().describe("项目类型"),
        robot: z.number().optional().describe("机器人编号，1-30"),
        ignores: z.array(z.string()).optional().describe("忽略文件列表")
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
        category: "miniprogram"
      }
    },
    async ({ appId, projectPath, type, robot, ignores }: {
      appId: string;
      projectPath: string;
      type?: "miniProgram" | "miniGame";
      robot?: number;
      ignores?: string[];
    }) => {
      const project = await createProject(projectPath, appId, type);

      const result = await ci.packNpm(project, {
        ignores: ignores || ["pack_npm_ignore_list"],
        reporter: (infos: any) => {
          info("构建 npm 包信息:", infos);
        }
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              message: "小程序 npm 构建成功",
              data: result
            }, null, 2)
          }
        ]
      };
    }
  );

  // 获取小程序项目配置
  server.registerTool?.(
    "getMiniprogramProjectConfig",
    {
      title: "获取小程序项目配置",
      description: "获取小程序项目配置信息",
      inputSchema: {
        appId: z.string().describe("小程序 appId"),
        projectPath: z.string().describe("项目路径"),
        type: z.enum(["miniProgram", "miniGame"]).optional().describe("项目类型")
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
        category: "miniprogram"
      }
    },
    async ({ appId, projectPath, type }: {
      appId: string;
      projectPath: string;
      type?: "miniProgram" | "miniGame";
    }) => {
      const project = await createProject(projectPath, appId, type);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              message: "获取项目配置成功",
              data: {
                appId,
                projectPath,
                type: type || "miniProgram"
              }
            }, null, 2)
          }
        ]
      };
    }
  );

  // 获取小程序开发版 SourceMap
  server.registerTool?.(
    "getMiniprogramSourceMap",
    {
      title: "获取小程序SourceMap",
      description: "获取最近上传版本的 SourceMap，用于生产环境错误调试",
      inputSchema: {
        appId: z.string().describe("小程序 appId"),
        projectPath: z.string().describe("项目路径"),
        robot: z.number().describe("指定使用哪一个 ci 机器人，可选值：1~30"),
        sourceMapSavePath: z.string().describe("SourceMap 保存路径"),
        type: z.enum(["miniProgram", "miniGame"]).optional().describe("项目类型")
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
        category: "miniprogram"
      }
    },
    async ({ appId, projectPath, robot, sourceMapSavePath, type }: {
      appId: string;
      projectPath: string;
      robot: number;
      sourceMapSavePath: string;
      type?: "miniProgram" | "miniGame";
    }) => {
      const project = await createProject(projectPath, appId, type);

      const result = await ci.getDevSourceMap({
        project,
        robot,
        sourceMapSavePath
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              message: "SourceMap 获取成功",
              data: {
                robot,
                sourceMapSavePath,
                result
              }
            }, null, 2)
          }
        ]
      };
    }
  );

  // 检查小程序代码质量
  server.registerTool?.(
    "checkMiniprogramCodeQuality",
    {
      title: "检查小程序代码质量",
      description: "检查小程序代码质量，生成质量报告（需要 miniprogram-ci 1.9.11+）",
      inputSchema: {
        appId: z.string().describe("小程序 appId"),
        projectPath: z.string().describe("项目路径"),
        saveReportPath: z.string().describe("质量报告保存路径"),
        type: z.enum(["miniProgram", "miniGame"]).optional().describe("项目类型")
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
        category: "miniprogram"
      }
    },
    async ({ appId, projectPath, saveReportPath, type }: {
      appId: string;
      projectPath: string;
      saveReportPath: string;
      type?: "miniProgram" | "miniGame";
    }) => {
      const project = await createProject(projectPath, appId, type);

      const result = await (ci as any).checkCodeQuality({
        project,
        saveReportPath
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              message: "代码质量检查完成",
              data: {
                saveReportPath,
                result
              }
            }, null, 2)
          }
        ]
      };
    }
  );

  // 自定义 npm 构建
  server.registerTool?.(
    "packMiniprogramNpmManually",
    {
      title: "自定义构建小程序npm",
      description: "自定义 node_modules 位置的小程序 npm 构建，支持复杂项目结构",
      inputSchema: {
        packageJsonPath: z.string().describe("希望被构建的 node_modules 对应的 package.json 的路径"),
        miniprogramNpmDistDir: z.string().describe("被构建 miniprogram_npm 的目标位置"),
        ignores: z.array(z.string()).optional().describe("指定需要排除的规则")
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
        category: "miniprogram"
      }
    },
    async ({ packageJsonPath, miniprogramNpmDistDir, ignores }: {
      packageJsonPath: string;
      miniprogramNpmDistDir: string;
      ignores?: string[];
    }) => {
      const result = await ci.packNpmManually({
        packageJsonPath,
        miniprogramNpmDistDir,
        ignores
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              message: "自定义 npm 构建完成",
              data: {
                packageJsonPath,
                miniprogramNpmDistDir,
                result
              }
            }, null, 2)
          }
        ]
      };
    }
  );
}