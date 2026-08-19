import { Remote, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import type {
  AppAuthConfig,
  AuthStatus,
  CloudBaseData,
  EnvInfoView,
  EnvItem,
  LogEntry,
  MetricSeries,
  RowPage,
  StorageObject,
  TableSummary,
  UsageItem,
} from "../shared/types.js";

const JSON_CODEC = { mode: "src-json" } as const;

/**
 * 递归清理返回值，保证通过 api-gateway 的 assertJsonValue（src-json codec）：
 * - 删除对象里的 undefined 字段（JSON.stringify 会丢弃，但 assertJsonValue 会拒绝）
 * - 数组里的 undefined 置为 null
 * - 非有限数字（NaN/Infinity）置为 null
 */
function toJsonSafe<T>(value: T): T {
  if (value === undefined) return null as T;
  if (typeof value === "number") return (Number.isFinite(value) ? value : null) as T;
  if (Array.isArray(value)) return value.map((item) => toJsonSafe(item)) as T;
  if (value !== null && typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return value;
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (item === undefined) continue;
      out[key] = toJsonSafe(item);
    }
    return out as T;
  }
  return value;
}

interface TypertInvocation {
  id: string;
  service: string;
  namespace: string;
  method: string;
  invocation: { kind: "direct" };
  parameters: Array<{ name: string; wire: string; source: "json"; codec: typeof JSON_CODEC }>;
  result: typeof JSON_CODEC;
}

function invoke(method: string, params: string[] = []): TypertInvocation {
  return {
    id: `@cloudbase/dsh-plugin#cloudbaseData/${method}`,
    service: "cloudbaseData",
    namespace: "cloudbaseData",
    method,
    invocation: { kind: "direct" },
    parameters: params.map((name) => ({ name, wire: name, source: "json" as const, codec: JSON_CODEC })),
    result: JSON_CODEC,
  };
}

/**
 * Host 侧 Typert manifest：把 cloudbaseData endpoints 注册进 typert 的 local 注册表，
 * 让 api-gateway 的 claimsEndpoint 命中（srcClaims 依赖 strict ctx.get，apply 期间
 * fiber state 非 active 时收集不到，导致 404）。local 注册表不依赖 fiber state。
 */
export function buildCloudBaseTypertContribution(): {
  package: string;
  face: "host";
  schemas: unknown[];
  invocations: TypertInvocation[];
} {
  return {
    package: "@cloudbase/dsh-plugin",
    face: "host",
    schemas: [],
    invocations: [
      invoke("listTables"),
      invoke("readRows", ["table", "limit", "offset"]),
      invoke("runReadSql", ["sql"]),
      invoke("listStorage", ["path"]),
      invoke("storageUrl", ["cloudPath"]),
      invoke("authStatus"),
      invoke("startAuth"),
      invoke("listEnvironments"),
      invoke("setEnvironment", ["envId"]),
      invoke("appAuthConfig"),
      invoke("metrics"),
      invoke("usage"),
      invoke("recentErrors"),
      invoke("envInfo"),
      invoke("appendToSession", ["text"]),
      invoke("capi", ["service", "action", "params"]),
      invoke("sessionBoundEnv", ["sessionId"]),
    ],
  };
}

/**
 * 把 CloudBase 数据服务通过 dsh Typert Remote 暴露给浏览器 client。
 *
 * - serviceKey = "cloudbaseData"：client 端通过 `ctx.remote.cloudbaseData.<method>()` 调用
 *   （dsh 的 api-gateway 自动拦截 `/api/cloudbaseData/<method>` RPC 并分发到本服务）。
 * - 方法用 @Remote 标记，参数必须是简单命名参数（SRC fallback 通过
 *   Function.prototype.toString 解析参数名），返回值必须 JSON 可序列化。
 * - 继承 TypertRemoteService：`super(ctx, key)` 自动把实例注册为 Cordis service，
 *   同时绑定 Typert Remote namespace（api-gateway 的 SRC 发现路径）。
 */
export class CloudBaseRemoteService extends TypertRemoteService {
  private readonly data: CloudBaseData;

  constructor(ctx: unknown, data: CloudBaseData) {
    super(ctx as never, "cloudbaseData");
    this.data = data;
  }

  @Remote("listTables")
  async listTables(): Promise<TableSummary[]> {
    return toJsonSafe(await this.data.listTables());
  }

  @Remote("readRows")
  async readRows(table: string, limit?: number, offset?: number): Promise<RowPage> {
    return toJsonSafe(await this.data.readRows(table, {
      limit: limit === undefined ? undefined : limit,
      offset: offset === undefined ? undefined : offset,
    }));
  }

  @Remote("runReadSql")
  async runReadSql(sql: string): Promise<RowPage> {
    return toJsonSafe(await this.data.runReadSql(sql));
  }

  @Remote("listStorage")
  async listStorage(path?: string): Promise<StorageObject[]> {
    return toJsonSafe(await this.data.listStorage(path === undefined ? "" : path));
  }

  @Remote("storageUrl")
  async storageUrl(cloudPath: string): Promise<{ url: string; expiresInSec: number }> {
    return toJsonSafe(await this.data.storageUrl(cloudPath));
  }

  @Remote("authStatus")
  async authStatus(): Promise<AuthStatus> {
    return toJsonSafe(await this.data.authStatus());
  }

  @Remote("startAuth")
  async startAuth(): Promise<AuthStatus> {
    return toJsonSafe(await this.data.startAuth());
  }

  @Remote("listEnvironments")
  async listEnvironments(): Promise<EnvItem[]> {
    return toJsonSafe(await this.data.listEnvironments());
  }

  @Remote("setEnvironment")
  async setEnvironment(envId: string): Promise<AuthStatus> {
    return toJsonSafe(await this.data.setEnvironment(envId));
  }

  @Remote("appAuthConfig")
  async appAuthConfig(): Promise<AppAuthConfig> {
    return toJsonSafe(await this.data.appAuthConfig());
  }

  @Remote("metrics")
  async metrics(): Promise<MetricSeries[]> {
    return toJsonSafe(await this.data.metrics());
  }

  @Remote("usage")
  async usage(): Promise<UsageItem[]> {
    return toJsonSafe(await this.data.usage());
  }

  @Remote("recentErrors")
  async recentErrors(): Promise<LogEntry[]> {
    return toJsonSafe(await this.data.recentErrors());
  }

  @Remote("envInfo")
  async envInfo(): Promise<EnvInfoView> {
    return toJsonSafe(await this.data.envInfo());
  }

  @Remote("appendToSession")
  async appendToSession(text: string): Promise<void> {
    return toJsonSafe(await this.data.appendToSession(text));
  }

  @Remote("capi")
  async capi(service: string, action: string, params: Record<string, unknown> = {}): Promise<unknown> {
    return toJsonSafe(await this.data.capi(service, action, params));
  }

  @Remote("sessionBoundEnv")
  async sessionBoundEnv(sessionId?: string): Promise<string | undefined> {
    return toJsonSafe(await this.data.sessionBoundEnv(sessionId));
  }
}
