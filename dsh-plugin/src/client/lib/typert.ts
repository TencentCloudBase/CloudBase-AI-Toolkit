import type {
  AppAuthConfig,
  AppUser,
  AuthStatus,
  CloudBaseData,
  ColumnSummary,
  EnvInfoView,
  EnvItem,
  LogEntry,
  MetricSeries,
  RowPage,
  SecretItem,
  StorageObject,
  TableSummary,
  UsageItem,
} from "../../shared/types.js";
import type { SlotHost } from "./slots.js";

interface RpcResult {
  ok: boolean;
  value?: unknown;
  error?: { code?: string; message?: string; details?: Record<string, unknown> };
}

interface RpcConnection {
  rpc?: {
    call: (channel: string, endpoint: string, payload: unknown, signal?: AbortSignal) => Promise<RpcResult>;
  };
}

/**
 * 用 dsh connection 的 RPC 直调 host 侧 CloudBaseRemoteService（/api/cloudbaseData/*）。
 *
 * 为什么不用 `ctx.remote.cloudbaseData`：client 端 remote 能力集是编译期固定的
 * （dsh-api-remotes 只 mount 内置贡献），第三方插件无法通过 $mount 后经
 * traceable proxy 访问（shadow context 的 isolate 不匹配 root 注册的 service，
 * 抛 "cannot get property remote.cloudbaseData without inject"）。
 * connection.rpc 是底层通道，绕开 Cordis service 代理，直接向 host api-gateway
 * 发 `/api/cloudbaseData/<method>` 调用；host 侧 SRC fallback 发现
 * CloudBaseRemoteService 并 dispatch。
 */
export function createRemoteCloudBaseData(
  ctx: SlotHost | undefined,
): CloudBaseData | undefined {
  const connection = (ctx as unknown as { connection?: RpcConnection })?.connection;
  if (!connection?.rpc?.call) return undefined;

  const call = async (method: string, args: Record<string, unknown> = {}): Promise<unknown> => {
    const result = await connection.rpc?.call("/api", `cloudbaseData/${method}`, { args });
    if (!result) throw new Error("CloudBase RPC 通道不可用");
    if (!result.ok) {
      const message = result.error?.message ?? "CloudBase RPC 调用失败";
      throw new Error(message);
    }
    return result.value;
  };

  return {
    async listTables(): Promise<TableSummary[]> {
      return (await call("listTables")) as TableSummary[];
    },
    async listTableColumns(table: string): Promise<ColumnSummary[]> {
      return (await call("listTableColumns", { table })) as ColumnSummary[];
    },
    async listAppUsers(opts?: { limit?: number; offset?: number }): Promise<AppUser[]> {
      return (await call("listAppUsers", {
        limit: opts?.limit,
        offset: opts?.offset,
      })) as AppUser[];
    },
    async listSecrets(): Promise<SecretItem[]> {
      return (await call("listSecrets")) as SecretItem[];
    },
    async readRows(table: string, opts?: { limit?: number; offset?: number }): Promise<RowPage> {
      return (await call("readRows", {
        table,
        limit: opts?.limit,
        offset: opts?.offset,
      })) as RowPage;
    },
    async runReadSql(sql: string): Promise<RowPage> {
      return (await call("runReadSql", { sql })) as RowPage;
    },
    async listStorage(path?: string): Promise<StorageObject[]> {
      return (await call("listStorage", { path: path ?? "" })) as StorageObject[];
    },
    async storageUrl(cloudPath: string): Promise<{ url: string; expiresInSec: number }> {
      return (await call("storageUrl", { cloudPath })) as { url: string; expiresInSec: number };
    },
    async authStatus(): Promise<AuthStatus> {
      return (await call("authStatus")) as AuthStatus;
    },
    async startAuth(): Promise<AuthStatus> {
      return (await call("startAuth")) as AuthStatus;
    },
    async listEnvironments(): Promise<EnvItem[]> {
      return (await call("listEnvironments")) as EnvItem[];
    },
    async setEnvironment(envId: string): Promise<AuthStatus> {
      return (await call("setEnvironment", { envId })) as AuthStatus;
    },
    async appAuthConfig(): Promise<AppAuthConfig> {
      return (await call("appAuthConfig")) as AppAuthConfig;
    },
    async metrics(): Promise<MetricSeries[]> {
      return (await call("metrics")) as MetricSeries[];
    },
    async usage(): Promise<UsageItem[]> {
      return (await call("usage")) as UsageItem[];
    },
    async recentErrors(): Promise<LogEntry[]> {
      return (await call("recentErrors")) as LogEntry[];
    },
    async envInfo(): Promise<EnvInfoView> {
      return (await call("envInfo")) as EnvInfoView;
    },
    async appendToSession(text: string): Promise<void> {
      await call("appendToSession", { text });
    },
    async capi(service: string, action: string, params: Record<string, unknown> = {}): Promise<unknown> {
      return call("capi", { service, action, params });
    },
    async sessionBoundEnv(sessionId?: string): Promise<string | undefined> {
      return (await call("sessionBoundEnv", { sessionId })) as string | undefined;
    },
  };
}

export function getDataService(ctx: SlotHost | undefined): CloudBaseData | undefined {
  return createRemoteCloudBaseData(ctx);
}

export async function appendUserMessage(
  data: CloudBaseData | undefined,
  text: string,
): Promise<void> {
  if (!data?.appendToSession) {
    throw new Error("无法写入会话。请直接在对话框发送该指令。");
  }
  await data.appendToSession(text);
}
