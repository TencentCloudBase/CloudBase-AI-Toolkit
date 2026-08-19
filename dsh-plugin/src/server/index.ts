import { PLUGIN_NAME } from "../shared/constants.js";
import type { CloudBaseData } from "../shared/types.js";
import { loginHint } from "./mcp-bridge.js";
import { CloudBaseMcpBridge } from "./mcp-client.js";
import { createCloudBaseDataService } from "./data-service.js";
import { buildCloudBaseTypertContribution, CloudBaseRemoteService } from "./remote-service.js";
import { installBundledSkills } from "./skill-sync.js";

export const name = PLUGIN_NAME;
// Cordis service 依赖须显式声明（否则访问 ctx.xxx 报 "without inject"）
export const inject: string[] = ["systemPrompt", "sessions", "typert"];

interface PluginContext {
  logger?: { info?: (message: string) => void; warn?: (message: string) => void };
  set?: (key: string, value: unknown) => void;
  provide?: (key: string, value: unknown) => void;
  get?: (key: string) => unknown;
  effect?: (factory: () => () => void) => void;
  typert?: { register?: (contribution: unknown) => unknown };
  systemPrompt?: {
    section?: (input: { name: string; order: number; text: string; complete?: boolean }) => void;
  };
  sessions?: {
    current?: () => { append?: (event: Record<string, unknown>) => Promise<unknown> };
  };
  on?: (event: string, handler: (...args: unknown[]) => unknown) => void;
}

function createAppend(ctx: PluginContext): (text: string) => Promise<void> {
  return async (text: string) => {
    const session = ctx.sessions?.current?.();
    if (!session?.append) {
      throw new Error("Session append is not available in this DSH profile");
    }
    await session.append({
      type: "user/message",
      content: [{ type: "text", text }],
      surfaceOp: "append",
    });
  };
}

export function apply(ctx: PluginContext): void {
  const bridge = new CloudBaseMcpBridge();
  const data: CloudBaseData = createCloudBaseDataService(bridge, createAppend(ctx));
  // TypertRemoteService 构造器自动把实例注册为 Cordis service（serviceKey="cloudbaseData"）。
  // 同时把 endpoints 注册进 typert local 注册表：api-gateway 的 claimsEndpoint 优先命中
  // local（不依赖 fiber state；srcClaims 的 strict ctx.get 在 apply 期间收集不到导致 404）。
  new CloudBaseRemoteService(ctx as never, data);
  try {
    ctx.typert?.register?.(buildCloudBaseTypertContribution());
  } catch (error) {
    ctx.logger?.warn?.(
      `[cloudbase] typert register skipped: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  ctx.effect?.(() => () => bridge.dispose());

  try {
    const target = installBundledSkills();
    ctx.logger?.info?.(`[cloudbase] skills installed at ${target}`);
  } catch (error) {
    ctx.logger?.warn?.(
      `[cloudbase] skill install skipped: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  ctx.systemPrompt?.section?.({
    name: "cloudbase",
    // 放到 persona(0) 之后、工具描述之前的说明区
    order: 50,
    text: [
      "You have CloudBase MCP tools named mcp__cloudbase__*.",
      "Reuse the local tcb login state. Never ask for an API Key if auth status is ready.",
      "If auth is missing, call mcp__cloudbase__auth with action=start_auth and authMode=device, then show the verification URL.",
      "Before any query tool, call mcp__cloudbase__auth action=status. If current_env_id is empty/absent, first call action=set_env with envId from the candidates, THEN call the query tool — do not call query tools before binding an environment.",
      "For a new web app: downloadTemplate(react) → local Vite preview → create PG tables with managePgDatabase → manageHosting upload → return the real domain.",
      "Do not mention internal codes FLEXDB, SCF, or TDSQL in user-facing text.",
    ].join(" "),
  });

  void data
    .authStatus()
    .then((status) => {
      ctx.logger?.info?.(loginHint(status.signedIn));
    })
    .catch((error: unknown) => {
      ctx.logger?.warn?.(
        `[cloudbase] auth status: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
}

export { buildMcpClientConfig, loginHint } from "./mcp-bridge.js";
export { CloudBaseMcpBridge } from "./mcp-client.js";
export { CloudBaseRemoteService } from "./remote-service.js";
export { createCloudBaseDataService } from "./data-service.js";
export { mapUsageModule, mapRegion, scrubInternalCodes } from "./term-map.js";
