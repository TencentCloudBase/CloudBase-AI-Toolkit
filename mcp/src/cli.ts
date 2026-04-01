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
 * Supports --cloud-mode and --integration-ide flags
 */
function parseCommandLineArgs(): {
  cloudMode: boolean;
  ide?: string;
} {
  const args = process.argv.slice(2);
  let cloudMode = false;
  let ide: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--cloud-mode") {
      cloudMode = true;
    } else if (arg === "--integration-ide" && i + 1 < args.length) {
      ide = args[i + 1];
      i++; // Skip the next argument since we consumed it
    } else if (arg.startsWith("--integration-ide=")) {
      ide = arg.split("=")[1];
    }
  }

  return { cloudMode, ide };
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
let { cloudMode, ide } = parseCommandLineArgs();

// Log startup information
if (cloudMode) {
  info("Starting CloudBase MCP Server in cloud mode");
}

ide = ide || process.env.INTEGRATION_IDE;

if (ide) {
  info(`Integration IDE: ${ide}`);
}

// Create server instance with conditional telemetry and CLI options
const server = createCloudBaseMcpServer({
  name: "cloudbase-mcp",
  version: typeof __MCP_VERSION__ !== 'undefined' ? __MCP_VERSION__ : "1.0.0",
  enableTelemetry,
  cloudMode,
  ide,
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
      });
    }
  };

  // 正常退出
  process.on("exit", (code) => {
    // 注意：exit 事件中不能使用异步操作，所以这里只能同步处理
    // 异步上报在其他信号处理中完成
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
    });
  }

  process.exit(1);
});
