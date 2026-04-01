import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerDatabaseTools } from "./tools/databaseNoSQL.js";
import { registerSQLDatabaseTools } from "./tools/databaseSQL.js";
import { registerDownloadTools } from "./tools/download.js";
import { registerEnvTools } from "./tools/env.js";
import { registerFunctionTools } from "./tools/functions.js";
import { registerHostingTools } from "./tools/hosting.js";
import { registerRagTools } from "./tools/rag.js";
import { registerSetupTools } from "./tools/setup.js";
import { registerStorageTools } from "./tools/storage.js";
// import { registerMiniprogramTools } from "./tools/miniprogram.js";
import { SetLevelRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { registerCapiTools } from "./tools/capi.js";
import { registerCloudRunTools } from "./tools/cloudrun.js";
import { registerDataModelTools } from "./tools/dataModel.js";
import { registerGatewayTools } from "./tools/gateway.js";
import { registerInviteCodeTools } from "./tools/invite-code.js";
import { registerSecurityRuleTools } from "./tools/security-rule.js";
import { CloudBaseOptions, Logger } from "./types.js";
import type { AuthOptions } from "./auth.js";
import { enableCloudMode } from "./utils/cloud-mode.js";
import { info } from './utils/logger.js';
import { isInternationalRegion } from "./utils/tencent-cloud.js";
import { buildJsonToolResult, isToolPayloadError } from "./utils/tool-result.js";
import { wrapServerWithTelemetry } from "./utils/tool-wrapper.js";

// 插件定义
interface PluginDefinition {
  name: string;
  register: (server: ExtendedMcpServer) => void | Promise<void>;
}

// 默认插件列表
const DEFAULT_PLUGINS = [
  "env",
  "database",
  "functions",
  "hosting",
  "storage",
  "setup",
  "rag",
  "cloudrun",
  "gateway",
  "download",
  "security-rule",
  "invite-code",
  "capi",
];

function registerDatabase(server: ExtendedMcpServer) {
  // Skip NoSQL database tools for international region (Singapore) as it doesn't support NoSQL DB
  const region = server.cloudBaseOptions?.region || process.env.TCB_REGION;
  if (!isInternationalRegion(region)) {
    registerDatabaseTools(server);
  }
  registerSQLDatabaseTools(server);
  registerDataModelTools(server);
}

// 可用插件映射
const AVAILABLE_PLUGINS: Record<string, PluginDefinition> = {
  env: { name: "env", register: registerEnvTools },
  database: { name: "database", register: registerDatabase },
  functions: { name: "functions", register: registerFunctionTools },
  hosting: { name: "hosting", register: registerHostingTools },
  storage: { name: "storage", register: registerStorageTools },
  setup: { name: "setup", register: registerSetupTools },
  rag: { name: "rag", register: registerRagTools },
  download: { name: "download", register: registerDownloadTools },
  gateway: { name: "gateway", register: registerGatewayTools },
  "security-rule": {
    name: "security-rule",
    register: registerSecurityRuleTools,
  },
  "invite-code": { name: "invite-code", register: registerInviteCodeTools },
  cloudrun: { name: "cloudrun", register: registerCloudRunTools },
  capi: { name: "capi", register: registerCapiTools },
};

/**
 * Parse enabled plugins list
 * @param pluginsEnabled Optional array of enabled plugin names (takes precedence over env var)
 * @param pluginsDisabled Optional array of disabled plugin names (merged with env var)
 * @returns Array of enabled plugin names
 */
function parseEnabledPlugins(
  pluginsEnabled?: string[],
  pluginsDisabled?: string[]
): string[] {
  const enabledEnv = process.env.CLOUDBASE_MCP_PLUGINS_ENABLED;
  const disabledEnv = process.env.CLOUDBASE_MCP_PLUGINS_DISABLED;

  let enabledPlugins: string[];

  // Priority: parameter > environment variable > default plugins
  if (pluginsEnabled && pluginsEnabled.length > 0) {
    enabledPlugins = pluginsEnabled;
  } else if (enabledEnv) {
    enabledPlugins = enabledEnv.split(",").map((p) => p.trim());
  } else {
    enabledPlugins = [...DEFAULT_PLUGINS];
  }

  const allDisabledPlugins = new Set<string>();

  if (disabledEnv) {
    disabledEnv.split(",").map((p) => p.trim()).forEach((p) => allDisabledPlugins.add(p));
  }

  if (pluginsDisabled && pluginsDisabled.length > 0) {
    pluginsDisabled.forEach((p) => allDisabledPlugins.add(p));
  }

  enabledPlugins = enabledPlugins.filter(
    (p) => !allDisabledPlugins.has(p)
  );

  return enabledPlugins;
}

// 扩展 McpServer 类型以包含 cloudBaseOptions 和新的registerTool方法
export interface ExtendedMcpServer extends McpServer {
  cloudBaseOptions?: CloudBaseOptions;
  authOptions?: AuthOptions;
  ide?: string;
  logger?: Logger;

  setLogger(logger: Logger): void;
}

/**
 * Create and configure a CloudBase MCP Server instance
 * @param options Server configuration options
 * @returns Configured McpServer instance
 *
 * @example
 * import { createCloudBaseMcpServer } from "@cloudbase/mcp-server";
 * import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
 *
 * const server = createCloudBaseMcpServer({ cloudBaseOptions: {
 *  envId,    // 环境ID
 *  secretId,  // 腾讯云密钥ID
 *  secretKey, // 腾讯云密钥
 *  region, // 地域，默认是 ap-shanghai
 *  token // 临时密钥，有有效期限制，生成密钥时可控制
 * } });
 *
 * const transport = new StdioServerTransport();
 * await server.connect(transport);
 */
export async function createCloudBaseMcpServer(options?: {
  name?: string;
  version?: string;
  enableTelemetry?: boolean;
  cloudBaseOptions?: CloudBaseOptions;
  authOptions?: AuthOptions;
  cloudMode?: boolean;
  ide?: string;
  logger?: Logger;
  pluginsEnabled?: string[];
  pluginsDisabled?: string[];
}): Promise<ExtendedMcpServer> {
  const {
    name = "cloudbase-mcp",
    version = "1.0.0",
    enableTelemetry = true,
    cloudBaseOptions,
    authOptions,
    cloudMode = false,
    ide,
    logger,
    pluginsEnabled,
    pluginsDisabled,
  } = options ?? {};

  // Enable cloud mode if specified
  if (cloudMode) {
    enableCloudMode();
  }

  // Create server instance
  const server = new McpServer(
    {
      name,
      version,
    },
    {
      capabilities: {
        tools: {},
        ...(ide === "CodeBuddy" ? { logging: {} } : {}),
      },
    },
  ) as ExtendedMcpServer;

  const originalRegisterTool = server.registerTool.bind(server);
  server.registerTool = ((name: string, meta: any, handler: (args: any) => Promise<any>) =>
    originalRegisterTool(name, meta, async (args: any) => {
      try {
        return await handler(args);
      } catch (error) {
        if (isToolPayloadError(error)) {
          return buildJsonToolResult(error.payload);
        }
        throw error;
      }
    })) as typeof server.registerTool;

  // Only set logging handler if logging capability is declared
  if (ide === "CodeBuddy") {
    server.server.setRequestHandler(SetLevelRequestSchema, (request, extra) => {
      info(`--- Logging level: ${request.params.level}`);
      return {};
    });
  }

  // Store cloudBaseOptions in server instance for tools to access
  if (cloudBaseOptions) {
    server.cloudBaseOptions = cloudBaseOptions;
  }

  if (authOptions) {
    server.authOptions = authOptions;
  }

  // Store ide in server instance for telemetry
  if (ide) {
    server.ide = ide;
  }

  // Store logger in server instance for tools to access
  if (logger) {
    server.logger = logger;
  }

  server.setLogger = (logger: Logger) => {
    server.logger = logger;
  }

  // Enable telemetry if requested
  if (enableTelemetry) {
    wrapServerWithTelemetry(server);
  }

  // Register plugins based on configuration
  const enabledPlugins = parseEnabledPlugins(pluginsEnabled, pluginsDisabled);

  for (const pluginName of enabledPlugins) {
    const plugin = AVAILABLE_PLUGINS[pluginName];
    if (plugin) {
      await plugin.register(server);
    }
  }

  return server;
}

/**
 * Get the default configured CloudBase MCP Server
 */
export function getDefaultServer(): Promise<ExtendedMcpServer> {
  return createCloudBaseMcpServer();
}

// Re-export types and utilities that might be useful
export type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
export { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
export { error, info, warn } from "./utils/logger.js";
export {
  reportToolCall,
  reportToolkitLifecycle,
  telemetryReporter
} from "./utils/telemetry.js";
