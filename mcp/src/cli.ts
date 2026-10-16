#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createCloudBaseMcpServer } from "./server.js";
import {
  telemetryReporter,
  reportToolkitLifecycle,
} from "./utils/telemetry.js";
import { info, warn } from "./utils/logger.js";

// 构建时注入的版本号
declare const __MCP_VERSION__: string;

/**
 * Parse command line arguments
 * Supports --cloud-mode, --integration-ide, --client, --api-key, --env-id, and --site flags
 */
function parseCommandLineArgs(): {
  cloudMode: boolean;
  ide?: string;
  client?: string;
  apiKey?: string;
  envId?: string;
  site?: string;
} {
  const args = process.argv.slice(2);
  let cloudMode = false;
  let ide: string | undefined;
  let client: string | undefined;
  let apiKey: string | undefined;
  let envId: string | undefined;
  let site: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--cloud-mode") {
      cloudMode = true;
    } else if (arg === "--integration-ide" && i + 1 < args.length) {
      ide = args[i + 1];
      i++;
    } else if (arg.startsWith("--integration-ide=")) {
      ide = arg.split("=")[1];
    } else if (arg === "--client" && i + 1 < args.length) {
      client = args[i + 1];
      i++;
    } else if (arg.startsWith("--client=")) {
      client = arg.split("=")[1];
    } else if (arg === "--api-key" && i + 1 < args.length) {
      apiKey = args[i + 1];
      i++;
    } else if (arg.startsWith("--api-key=")) {
      apiKey = arg.split("=")[1];
    } else if (arg === "--env-id" && i + 1 < args.length) {
      envId = args[i + 1];
      i++;
    } else if (arg.startsWith("--env-id=")) {
      envId = arg.split("=")[1];
    } else if (arg === "--site" && i + 1 < args.length) {
      site = args[i + 1];
      i++;
    } else if (arg.startsWith("--site=")) {
      site = arg.split("=")[1];
    }
  }

  return { cloudMode, ide, client, apiKey, envId, site };
}

// 劫持 console.log/info/warn，防止污染 stdout 协议流
const joinArgs = (...args: any[]) =>
  args
    .map((a) => {
      if (typeof a === "string") return a;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(" ");

(globalThis as any).console._originLog = console.log;
(globalThis as any).console._originInfo = console.info;
(globalThis as any).console._originWarn = console.warn;
// 不劫持 console.error，保持输出到 stderr

console.log = (...args) => info(joinArgs(...args));
console.info = (...args) => info(joinArgs(...args));
console.warn = (...args) => warn(joinArgs(...args));
// console.error 保持原样

// 记录启动时间
const startTime = Date.now();

// 在测试环境中禁用遥测，避免网络连接问题
const isTestEnvironment =
  process.env.NODE_ENV === "test" || process.env.VITEST === "true";
const enableTelemetry = !isTestEnvironment;

// Parse command line arguments
let { cloudMode, ide, client, apiKey, envId, site } = parseCommandLineArgs();

// Set API Key env vars from CLI flags (if provided)
if (apiKey) {
  process.env.CLOUDBASE_API_KEY = apiKey;
}
if (envId) {
  process.env.CLOUDBASE_ENV_ID = envId;
}
if (site) {
  process.env.TCB_SITE = site;
}

// Log startup information
if (cloudMode) {
  info("Starting CloudBase MCP Server in cloud mode");
}

ide = ide || process.env.INTEGRATION_IDE;
client = client || process.env.CLOUDBASE_MCP_CLIENT;

if (ide) {
  info(`Integration IDE: ${ide}`);
}
if (client) {
  info(`MCP client: ${client}`);
}

// Create server instance with conditional telemetry and CLI options
const server = createCloudBaseMcpServer({
  name: "cloudbase-mcp",
  version: typeof __MCP_VERSION__ !== 'undefined' ? __MCP_VERSION__ : "1.0.0",
  enableTelemetry,
  cloudMode,
  ide,
  client,
});

async function main() {
  const transport = new StdioServerTransport();
  await (await server).connect(transport);
  info("TencentCloudBase MCP Server running on stdio");

  // 上报启动信息
  if (telemetryReporter.isEnabled()) {
    await reportToolkitLifecycle({
      event: "start",
      ide,
      client,
    });
  }
}

// 设置进程退出处理
function setupExitHandlers() {
  const handleExit = async (exitCode: number, signal?: string) => {
    if (telemetryReporter.isEnabled()) {
      const duration = Date.now() - startTime;
      await reportToolkitLifecycle({
        event: "exit",
        duration,
        exitCode,
        error: signal ? `Process terminated by signal: ${signal}` : undefined,
        ide,
        client,
      });
    }
  };

  // 正常退出
  process.on("exit", (code) => {
    // 这里**报不了** exit：能走到这个钩子，通常意味着**进程被父进程收掉**（宿主 / IDE / 网关
    // 关掉管道或杀掉进程），此时事件循环已经停下、异步 I/O 不会再被调度 ⇒ 网络上报必然发不出去；
    // 而同步上报会拖住退出，父进程也可能已经不在监听。
    // 所以这里保持空实现：**不要在 exit 钩子里做异步 / 网络上报**。
    // 真正会「先 await 上报、再退出」的是下面几条路（SIGINT / SIGTERM / 未捕获异常）——
    // 那几条能报，因为进程还在自己的控制流里、事件循环还活着。
  });

  // 异常退出处理
  process.on("SIGINT", async () => {
    await handleExit(0, "SIGINT");
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    await handleExit(0, "SIGTERM");
    process.exit(0);
  });

  process.on("uncaughtException", async (error) => {
    console.error("Uncaught Exception:", error);
    await handleExit(1, `uncaughtException: ${error.message}`);
    process.exit(1);
  });

  process.on("unhandledRejection", async (reason) => {
    console.error("Unhandled Rejection:", reason);
    await handleExit(1, `unhandledRejection: ${String(reason)}`);
    process.exit(1);
  });
}

// 设置退出处理器
setupExitHandlers();

main().catch(async (error) => {
  console.error("Fatal error in main():", error);

  // 上报启动失败
  if (telemetryReporter.isEnabled()) {
    const duration = Date.now() - startTime;
    await reportToolkitLifecycle({
      event: "exit",
      duration,
      exitCode: 1,
      error: `Startup failed: ${error.message}`,
      ide,
      client,
    });
  }

  process.exit(1);
});
