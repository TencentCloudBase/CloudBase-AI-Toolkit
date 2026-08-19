import type { PlatformProvider } from "../provider.js";
import type {
  AppAuthConfig,
  AppUser,
  AuthStatus,
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
} from "../../../shared/types.js";

/**
 * 自定义 Provider 示例：kit 只要求实现 PlatformProvider 输入输出协议，
 * 底层实现完全由业务方决定 —— 可以是其他云 API、自研服务、纯前端 mock。
 *
 * 两种典型方式：
 * 1. 直接实现 PlatformProvider（本文件展示）
 * 2. 复用 CloudBase 默认实现，只替换 capi 通道（service/action/params 直调你
 *    自己的 API 网关），即可让同一套面板面板展示你的资源。
 */
export function createMockProvider(): PlatformProvider {
  const now = new Date().toISOString();
  return {
    async listTables(): Promise<TableSummary[]> {
      return [
        {
          name: "projects",
          schema: "public",
          kind: "table",
          columnCount: 6,
          rowCount: 42,
          columns: [
            { name: "id", type: "int", dataType: "integer", nullable: false, isUpdatable: false, primaryKey: true },
            { name: "name", type: "text", dataType: "text", nullable: false, isUpdatable: true, primaryKey: false },
          ],
        },
        { name: "users", schema: "public", kind: "table", columnCount: 8, rowCount: 128 },
      ];
    },
    async listTableColumns(_table: string): Promise<ColumnSummary[]> {
      return [
        { name: "id", type: "int", dataType: "integer", nullable: false, isUpdatable: false, primaryKey: true },
        { name: "name", type: "text", dataType: "text", nullable: true, isUpdatable: true, primaryKey: false },
        { name: "status", type: "text", dataType: "text", nullable: false, isUpdatable: true, primaryKey: false },
      ];
    },
    async listAppUsers(): Promise<AppUser[]> {
      return [
        { uid: "u1", name: "alice", createdAt: new Date().toISOString() },
        { uid: "u2", name: "bob", createdAt: new Date(Date.now() - 86400000).toISOString() },
      ];
    },
    async listSecrets(): Promise<SecretItem[]> {
      return [{ source: "api", sourceKind: "function", key: "TOKEN", valueMasked: "ab***" }];
    },
    async readRows(table: string, opts?: { limit?: number; offset?: number }): Promise<RowPage> {
      return {
        columns: ["id", "name", "status"],
        rows: Array.from({ length: opts?.limit ?? 10 }, (_, index) => ({
          id: `${table}-${(opts?.offset ?? 0) + index + 1}`,
          name: `item ${(opts?.offset ?? 0) + index + 1}`,
          status: index % 3 === 0 ? "active" : "pending",
        })),
        total: 128,
        elapsedMs: 4,
      };
    },
    async runReadSql(sql: string): Promise<RowPage> {
      return this.readRows("sql", { limit: 20 });
    },
    async listStorage(path?: string): Promise<StorageObject[]> {
      return [
        { name: "public", cloudPath: path ?? "public", size: 0, sizeLabel: "dir", isDirectory: true },
        {
          name: "logo.png",
          cloudPath: `${path ?? "public"}/logo.png`,
          size: 2048,
          sizeLabel: "2 KB",
          updatedAt: now,
          isDirectory: false,
        },
      ];
    },
    async storageUrl(cloudPath: string): Promise<{ url: string; expiresInSec: number }> {
      return { url: `https://mock.example.com/${cloudPath}`, expiresInSec: 3600 };
    },
    async authStatus(): Promise<AuthStatus> {
      return {
        signedIn: true,
        envId: "mock-env-001",
        authMode: "mock",
        persisted: false,
        tempCredentialsAvailable: false,
        message: "mock provider 已就绪",
      };
    },
    async startAuth(): Promise<AuthStatus> {
      return this.authStatus();
    },
    async listEnvironments(): Promise<EnvItem[]> {
      return [
        { envId: "mock-env-001", alias: "mock-dev", region: "ap-guangzhou", status: "NORMAL" },
        { envId: "mock-env-002", alias: "mock-prod", region: "ap-shanghai", status: "NORMAL" },
      ];
    },
    async setEnvironment(envId: string): Promise<AuthStatus> {
      return { ...(await this.authStatus()), envId };
    },
    async appAuthConfig(): Promise<AppAuthConfig> {
      return { providers: [{ name: "mock-login", enabled: true }] };
    },
    async metrics(): Promise<MetricSeries[]> {
      return [
        { name: "requests", label: "请求数", valueLabel: "1.2k", points: [2, 4, 3, 6, 5, 8] },
        { name: "errors", label: "错误", valueLabel: "0", points: [0, 1, 0, 0, 0, 0], danger: false },
      ];
    },
    async usage(): Promise<UsageItem[]> {
      return [{ productName: "Mock Storage", usedLabel: "10 GB / 50 GB" }];
    },
    async recentErrors(): Promise<LogEntry[]> {
      return [];
    },
    async envInfo(): Promise<EnvInfoView> {
      return {
        envId: "mock-env-001",
        regionLabel: "广州",
        regionCode: "ap-guangzhou",
        functionCount: 3,
        hostingDomainCount: 1,
        timezone: "Asia/Shanghai",
        alias: "mock-dev",
      };
    },
    async appendToSession(_text: string): Promise<void> {
      // mock：忽略会话写入
    },
    async capi(_service: string, action: string): Promise<unknown> {
      return { action, mocked: true };
    },
    async sessionBoundEnv(): Promise<string | undefined> {
      return "mock-env-001";
    },
  };
}
