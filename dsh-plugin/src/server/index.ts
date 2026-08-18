import { PLUGIN_NAME } from "../shared/constants.js";
import type { CloudBaseData } from "../shared/types.js";
import { loginHint } from "./mcp-bridge.js";
import { CloudBaseMcpBridge } from "./mcp-client.js";
import { createCloudBaseDataService } from "./data-service.js";
import { installBundledSkills } from "./skill-sync.js";

export const name = PLUGIN_NAME;
export const inject: string[] = [];

interface PluginContext {
  logger?: { info?: (message: string) => void; warn?: (message: string) => void };
  set?: (key: string, value: unknown) => void;
  provide?: (key: string, value: unknown) => void;
  effect?: (factory: () => () => void) => void;
  systemPrompt?: { section?: (input: { name: string; content: string }) => void };
  sessions?: {
    current?: () => { append?: (event: Record<string, unknown>) => Promise<unknown> };
  };
  on?: (event: string, handler: (...args: unknown[]) => unknown) => void;
}

function provide(ctx: PluginContext, key: string, value: unknown): void {
  if (typeof ctx.set === "function") ctx.set(key, value);
  else if (typeof ctx.provide === "function") ctx.provide(key, value);
  else (ctx as unknown as Record<string, unknown>)[key] = value;
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
  provide(ctx, "cloudbaseData", data);

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
    content: [
      "You have CloudBase MCP tools named mcp__cloudbase__*.",
      "Reuse the local tcb login state. Never ask for an API Key if auth status is ready.",
      "If auth is missing, call mcp__cloudbase__auth with action=start_auth and authMode=device, then show the verification URL.",
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
export { createCloudBaseDataService } from "./data-service.js";
export { mapUsageModule, mapRegion, scrubInternalCodes } from "./term-map.js";
