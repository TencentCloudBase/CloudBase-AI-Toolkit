import { quotePgTable } from "../shared/sql-ident.js";
import { mapSchemaColumns } from "../shared/column-form.js";
import type {
  AppAuthConfig,
  AppUser,
  AuthStatus,
  CloudBaseData,
  EnvInfoView,
  EnvItem,
  LogEntry,
  MetricSeries,
  RowPage,
  SecretItem,
  StorageObject,
  TableSummary,
  UsageItem,
} from "../shared/types.js";
import { CloudBaseMcpBridge } from "./mcp-client.js";
import { formatBytes, formatUsageItem, mapRegion, scrubInternalCodes } from "./term-map.js";

type LooseRecord = Record<string, unknown>;

function rec(value: unknown): LooseRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as LooseRecord)
    : {};
}

function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function unwrapData(payload: unknown): LooseRecord {
  const root = rec(payload);
  const nested = rec(root.data);
  return Object.keys(nested).length > 0 ? nested : root;
}

/** 解析 cloudbase-mcp auth 工具的登录态：auth_status === "READY" 即已登录。 */
function isSignedIn(payload: LooseRecord): boolean {
  return (
    Boolean(payload.signedIn) ||
    Boolean(payload.AUTH_READY) ||
    str(payload.auth_status) === "READY" ||
    str(payload.status) === "AUTH_READY" ||
    str(payload.code) === "AUTH_READY" ||
    str(payload.code) === "ENV_READY"
  );
}

/** 取当前环境 ID：auth status 返回 current_env_id。 */
function currentEnvId(payload: LooseRecord): string | undefined {
  return str(payload.current_env_id ?? payload.currentEnvId ?? payload.envId ?? payload.EnvId);
}

function looksLikeWriteSql(sql: string): boolean {
  return /^\s*(insert|update|delete|alter|drop|create|truncate|grant|revoke|replace|merge|call|do)\b/i.test(
    sql,
  );
}

function mapTableKind(kindRaw: string): TableSummary["kind"] {
  const kind = kindRaw.toLowerCase();
  if (kind.includes("view")) return "view";
  if (kind.includes("func")) return "function";
  return "table";
}

function mapTable(item: unknown): TableSummary {
  const row = rec(item);
  const schemaTable = str(row.schemaTable);
  const dotted = schemaTable?.split(".") ?? [];
  return {
    name: str(row.name ?? row.table ?? row.relname) ?? dotted[1] ?? "unknown",
    schema: str(row.schema ?? row.nspname) ?? dotted[0] ?? "public",
    kind: mapTableKind(str(row.kind ?? row.type ?? row.relkind) ?? "table"),
    columnCount: num(row.columnCount ?? row.columns ?? row.column_count),
    rowCount: num(
      row.rowCount ?? row.rows ?? row.estimatedRows ?? row.estimated_rows ?? row.n_live_tup,
    ),
    owner: str(row.owner),
    size: str(row.size) ?? formatBytes(num(row.sizeBytes)),
  };
}

export function createCloudBaseDataService(
  bridge: CloudBaseMcpBridge,
  appendUserMessage?: (text: string) => Promise<void>,
  getSession?: (sessionId?: string) => unknown,
): CloudBaseData {
  return {
    async listTables() {
      let pgError: string | undefined;
      try {
        const payload = unwrapData(
          await bridge.callTool("queryPgDatabase", {
            action: "metadata",
            limit: 200,
          }),
        );
        const objects = arr(payload.objects ?? payload.tables ?? payload.items);
        if (objects.length > 0) return objects.map(mapTable);
        const listed = unwrapData(
          await bridge.callTool("queryPgDatabase", { action: "objects", limit: 200 }),
        );
        const fallback = arr(listed.objects ?? listed.tables ?? listed.items);
        if (fallback.length > 0) return fallback.map(mapTable);
      } catch (error) {
        pgError = error instanceof Error ? error.message : String(error);
      }

      let nosqlError: string | undefined;
      try {
        const nosql = unwrapData(
          await bridge.callTool("readNoSqlDatabaseStructure", {
            action: "listCollections",
          }),
        );
        const collections = arr(nosql.collections ?? nosql.Collections);
        if (collections.length > 0) {
          return collections.map((item): TableSummary => {
            const row = rec(item);
            return {
              name: str(row.CollectionName ?? row.name) ?? "unknown",
              schema: "document",
              kind: "table",
              rowCount: num(row.Count ?? row.count),
            };
          });
        }
      } catch (error) {
        nosqlError = error instanceof Error ? error.message : String(error);
      }

      if (pgError) {
        throw new Error(pgError);
      }
      if (nosqlError) {
        throw new Error(nosqlError);
      }
      return [];
    },

    async listTableColumns(table) {
      const payload = unwrapData(
        await bridge.callTool("queryPgDatabase", {
          action: "schema",
          objectName: table.includes(".") ? table : `public.${table}`,
        }),
      );
      const nested = rec(payload.schema ?? payload);
      const columns = mapSchemaColumns({
        columns: nested.columns ?? payload.columns,
        primaryKey: nested.primaryKey ?? payload.primaryKey,
        kind: nested.kind ?? payload.kind,
      });
      return columns;
    },

    async listAppUsers(opts) {
      const payload = unwrapData(
        await bridge.callTool("queryPermissions", {
          action: "listUsers",
          pageNo: Math.floor((opts?.offset ?? 0) / (opts?.limit ?? 20)) + 1,
          pageSize: opts?.limit ?? 50,
        }),
      );
      const users = arr(payload.users ?? payload.UserList ?? payload.Data);
      return users.map((item): AppUser => {
        const row = rec(item);
        return {
          uid: str(row.Uid ?? row.uid ?? row.uuid ?? row.id) ?? "unknown",
          name: str(row.Username ?? row.Name ?? row.name ?? row.NickName),
          email: str(row.Email ?? row.email),
          createdAt: str(row.CreateTime ?? row.createdAt ?? row.CreatedAt),
          lastLoginAt: str(row.LastLoginTime ?? row.lastLoginAt ?? row.UpdateTime),
        };
      });
    },

    async listSecrets() {
      const secrets: SecretItem[] = [];
      try {
        const listed = unwrapData(
          await bridge.callTool("queryFunctions", { action: "listFunctions" }),
        );
        const functions = arr(listed.Functions ?? listed.functions ?? listed.items);
        for (const item of functions.slice(0, 20)) {
          const row = rec(item);
          const name = str(row.FunctionName ?? row.Name ?? row.name);
          if (!name) continue;
          const detail = unwrapData(
            await bridge
              .callTool("queryFunctions", { action: "getFunctionDetail", functionName: name })
              .catch(() => ({})),
          );
          const env = rec(detail.Environment ?? rec(detail.Function).Environment);
          const vars = arr(env.Variables ?? env.variables);
          for (const variable of vars) {
            const entry = rec(variable);
            const key = str(entry.Key ?? entry.key ?? entry.Name);
            if (!key) continue;
            const value = str(entry.Value ?? entry.value) ?? "";
            secrets.push({
              source: name,
              sourceKind: "function",
              key,
              valueMasked: value.length > 4 ? `${value.slice(0, 2)}***` : "***",
            });
          }
        }
      } catch {
        // Function env listing is best-effort; panel still renders empty state.
      }
      try {
        const run = unwrapData(
          await bridge.callTool("queryCloudRun", { action: "list" }).catch(() => ({})),
        );
        const services = arr(run.ServerList ?? run.services ?? run.items);
        for (const item of services.slice(0, 10)) {
          const row = rec(item);
          const name = str(row.ServerName ?? row.name);
          if (!name) continue;
          const envVars = arr(row.EnvParams ?? row.envVars ?? rec(row.Env).Variables);
          for (const variable of envVars) {
            if (typeof variable === "string") {
              const [key] = variable.split("=");
              if (!key) continue;
              secrets.push({
                source: name,
                sourceKind: "cloudrun",
                key,
                valueMasked: "***",
              });
              continue;
            }
            const entry = rec(variable);
            const key = str(entry.Key ?? entry.key ?? entry.Name);
            if (!key) continue;
            secrets.push({
              source: name,
              sourceKind: "cloudrun",
              key,
              valueMasked: "***",
            });
          }
        }
      } catch {
        // CloudRun env listing is optional.
      }
      return secrets;
    },

    async readRows(table, opts) {
      const limit = opts?.limit ?? 50;
      const offset = opts?.offset ?? 0;
      const sql = `SELECT * FROM ${quotePgTable(table)} LIMIT ${limit} OFFSET ${offset}`;
      return this.runReadSql(sql);
    },

    async runReadSql(sql) {
      if (looksLikeWriteSql(sql)) {
        throw new Error("写 SQL 必须经会话确认后由模型调用 managePgDatabase 执行");
      }
      const started = Date.now();
      const payload = unwrapData(
        await bridge.callTool("queryPgDatabase", {
          action: "sql",
          sql,
          limit: 200,
        }),
      );
      return toRowPage(payload, Date.now() - started);
    },

    async listStorage(path = "") {
      const payload = unwrapData(
        await bridge.callTool("queryStorage", {
          action: "list",
          cloudPath: path || "/",
        }),
      );
      const files = arr(payload.files ?? payload.Contents ?? payload.items);
      return files.map((item): StorageObject => {
        const row = rec(item);
        const name = str(row.Key ?? row.name ?? row.fileName) ?? "unknown";
        const size = num(row.Size ?? row.size) ?? 0;
        return {
          name: name.split("/").filter(Boolean).pop() ?? name,
          cloudPath: name,
          size,
          sizeLabel: formatBytes(size),
          updatedAt: str(row.LastModified ?? row.updatedAt ?? row.updateTime),
          isDirectory: Boolean(row.isDirectory) || name.endsWith("/"),
        };
      });
    },

    async storageUrl(cloudPath) {
      const payload = unwrapData(
        await bridge.callTool("queryStorage", {
          action: "url",
          cloudPath,
          maxAge: 3600,
        }),
      );
      const url =
        str(payload.temporaryUrl ?? payload.tempUrl ?? payload.url ?? payload.downloadUrl) ?? "";
      return { url, expiresInSec: 3600 };
    },

    async startAuth() {
      const payload = unwrapData(
        await bridge.callTool("auth", { action: "start_auth", authMode: "device" }),
      );
      const signedIn = isSignedIn(payload);
      return {
        signedIn,
        envId: currentEnvId(payload),
        authMode: "device-code",
        persisted: Boolean(payload.persisted ?? signedIn),
        tempCredentialsAvailable: Boolean(payload.tempCredentials ?? payload.hasTempCredentials),
        verificationUrl:
          str(payload.verification_uri_complete ?? payload.verificationUrl ?? payload.url) ?? "",
        userCode: str(payload.user_code ?? payload.userCode) ?? "",
        message: scrubInternalCodes(
          str(payload.message) ??
            (signedIn
              ? "已登录，请选择环境"
              : "请在浏览器中打开验证 URL 并输入用户码完成授权（device-code）"),
        ),
      } satisfies AuthStatus;
    },

    async authStatus() {
      const payload = unwrapData(
        await bridge.callTool("auth", { action: "status" }),
      );
      const signedIn = isSignedIn(payload);
      return {
        signedIn,
        envId: currentEnvId(payload),
        authMode: str(payload.authMode ?? payload.mode) ?? (signedIn ? "device-code" : undefined),
        persisted: Boolean(payload.persisted ?? signedIn),
        tempCredentialsAvailable: Boolean(payload.tempCredentials ?? payload.hasTempCredentials),
        verificationUrl: str(payload.verification_uri_complete ?? payload.verificationUrl),
        userCode: str(payload.user_code ?? payload.userCode),
        message: scrubInternalCodes(
          str(payload.message) ?? (signedIn ? "已登录" : "未登录，请使用 device-code 授权"),
        ),
      } satisfies AuthStatus;
    },

    async listEnvironments() {
      // 用 callCloudApi DescribeEnvs 拿全量候选（不受 set_env 绑定影响，始终返回 101 个；
      // queryEnv(action=list) 绑定后只返回当前 1 个）。callCloudApi 未绑定时返回
      // ENV_REQUIRED 但附带完整 env_candidates，直接取它。过滤 status==="NORMAL"：
      // UNAVAILABLE 多为欠费/不可用，不应出现在切换列表。
      const payload = unwrapData(
        await bridge.callTool("callCloudApi", {
          service: "tcb",
          action: "DescribeEnvs",
          params: {},
        }),
      );
      const candidates = arr(
        payload.env_candidates ??
          payload.envCandidates ??
          payload.EnvList ??
          payload.Envs,
      );
      return candidates
        .map((item): EnvItem => {
          const row = rec(item);
          return {
            envId: str(row.envId ?? row.EnvId ?? row.env_id) ?? "unknown",
            alias: str(row.alias ?? row.Alias),
            region: str(row.region ?? row.Region),
            status: str(row.status ?? row.Status),
            envType: str(row.env_type ?? row.envType ?? row.EnvType),
          };
        })
        .filter((item) => item.status === "NORMAL" || item.status === undefined);
    },

    async setEnvironment(envId) {
      const payload = unwrapData(
        await bridge.callTool("auth", { action: "set_env", envId }),
      );
      const signedIn = isSignedIn(payload);
      return {
        signedIn,
        envId: str(payload.envId ?? payload.EnvId) ?? currentEnvId(payload) ?? envId,
        authMode: str(payload.authMode ?? payload.mode) ?? (signedIn ? "device-code" : undefined),
        persisted: Boolean(payload.persisted ?? signedIn),
        tempCredentialsAvailable: Boolean(payload.tempCredentials ?? payload.hasTempCredentials),
        verificationUrl: str(payload.verification_uri_complete ?? payload.verificationUrl),
        userCode: str(payload.user_code ?? payload.userCode),
        message: scrubInternalCodes(
          str(payload.message) ?? (signedIn ? `已切换环境 ${envId}` : "未登录"),
        ),
      } satisfies AuthStatus;
    },

    async appAuthConfig() {
      const payload = unwrapData(
        await bridge.callTool("queryAppAuth", { action: "listProviders" }).catch(() => ({})),
      );
      const providers = arr(payload.providers ?? payload.Providers).map((item): AppAuthConfig["providers"][number] => {
        const row = rec(item);
        const rawName = str(row.ProviderType ?? row.type ?? row.name) ?? "unknown";
        return {
          name: providerLabel(rawName),
          enabled: Boolean(row.Status === "ENABLED" || row.enabled || row.Enable),
        };
      });
      if (providers.length === 0) {
        const login = unwrapData(
          await bridge.callTool("queryAppAuth", { action: "getLoginConfig" }).catch(() => ({})),
        );
        const flags = rec(login.loginConfig ?? login.config ?? login);
        const mapped = [
          { name: "邮箱密码", flag: flags.email ?? flags.Email ?? flags.emailPassword },
          { name: "用户名密码", flag: flags.usernamePassword ?? flags.UsernamePassword },
          { name: "微信", flag: flags.wechat ?? flags.Wechat ?? flags.wx },
          { name: "匿名", flag: flags.anonymous ?? flags.Anonymous },
        ].filter((item) => item.flag !== undefined);
        for (const item of mapped) {
          providers.push({ name: item.name, enabled: Boolean(item.flag) });
        }
      }
      return { providers } satisfies AppAuthConfig;
    },

    async metrics() {
      const names = [
        { metricName: "FunctionInvocation", label: "函数调用" },
        { metricName: "DbRead", label: "DB 读" },
        { metricName: "DbWrite", label: "DB 写" },
        { metricName: "FunctionError", label: "错误率", danger: true },
      ] as const;
      const series: MetricSeries[] = [];
      for (const item of names) {
        try {
          const payload = unwrapData(
            await bridge.callTool("queryEnv", {
              action: "metrics",
              metricName: item.metricName,
            }),
          );
          const points = extractPoints(payload);
          const latest = points[points.length - 1] ?? 0;
          series.push({
            name: item.metricName,
            label: item.label,
            valueLabel: formatMetricValue(latest, item.metricName),
            points,
            danger: "danger" in item ? item.danger : false,
          });
        } catch {
          series.push({
            name: item.metricName,
            label: item.label,
            valueLabel: "—",
            points: [],
            danger: "danger" in item ? item.danger : false,
          });
        }
      }
      return series;
    },

    async usage() {
      const payload = unwrapData(
        await bridge.callTool("queryEnv", { action: "usage" }),
      );
      const usages = arr(payload.Usages ?? payload.modules ?? payload.usage ?? payload.items);
      if (usages.length > 0) {
        return usages.map((item): UsageItem => {
          const row = rec(item);
          const code = str(row.Module ?? row.type ?? row.module ?? row.name) ?? "Other";
          const credits = num(row.CreditsValue);
          const used =
            str(row.used ?? row.usedLabel) ??
            (credits !== undefined ? `${credits} 资源点` : stringifyUsage(row.usedValue ?? row.value));
          const quota = str(row.quota ?? row.limit);
          return formatUsageItem(code, used, quota);
        });
      }
      return Object.entries(rec(payload))
        .filter(([key]) => ["FLEXDB", "TDSQL", "SCF", "EKS", "COS", "HOSTING", "Auth"].includes(key))
        .map(([key, value]) => formatUsageItem(key, stringifyUsage(value)));
    },

    async recentErrors() {
      try {
        const payload = unwrapData(
          await bridge.callTool("queryLogs", {
            action: "searchLogs",
            queryString: "log:ERROR",
            limit: 20,
          }),
        );
        const logs = arr(payload.logs ?? payload.Results ?? payload.items);
        return logs.slice(0, 20).map((item): LogEntry => {
          const row = rec(item);
          return {
            title: scrubInternalCodes(
              str(row.log ?? row.message ?? row.content ?? row.topic) ?? "ERROR",
            ),
            time: str(row.time ?? row.timestamp ?? row.Time),
            level: "error",
          };
        });
      } catch (error) {
        return [
          {
            title: scrubInternalCodes(
              error instanceof Error ? error.message : String(error),
            ),
            level: "warn",
          },
        ];
      }
    },

    async envInfo() {
      // 不硬编码环境 ID：先查 auth 状态拿当前绑定环境，再取环境详情。
      // 未登录/未绑定时 MCP 会返回 auth 提示，envId 为空串展示占位。
      const auth = unwrapData(
        await bridge.callTool("auth", { action: "status" }).catch(() => ({})),
      );
      const activeEnvId = str(auth.envId ?? auth.EnvId) ?? "";
      const info = unwrapData(
        activeEnvId
          ? await bridge.callTool("queryEnv", { action: "info", envId: activeEnvId })
          : await bridge.callTool("queryEnv", { action: "info" }).catch(() => ({})),
      );
      const env = rec(info.EnvInfo ?? info.envInfo ?? info);
      const envId = str(env.EnvId ?? env.envId) ?? str(info.EnvId) ?? activeEnvId;
      let functionCount = 0;
      try {
        const fn = unwrapData(
          await bridge.callTool("queryFunctions", {
            action: "listFunctions",
          }).catch(() => bridge.callTool("getFunctionList", {})),
        );
        functionCount = arr(fn.Functions ?? fn.functions ?? fn.items).length;
      } catch {
        functionCount = 0;
      }
      let hostingDomainCount = 0;
      try {
        const hosting = unwrapData(
          await bridge.callTool("queryHosting", { action: "websiteConfig" }),
        );
        const website = rec(hosting.websiteConfig);
        const cdn =
          str(hosting.CdnDomain) ??
          str(website.CdnDomain) ??
          str(hosting.defaultDomain) ??
          str(website.defaultDomain);
        const domains = arr(hosting.domains ?? website.domains);
        hostingDomainCount = Math.max(domains.length, cdn ? 1 : 0);
      } catch {
        hostingDomainCount = 0;
      }
      return {
        envId,
        regionLabel: mapRegion(str(env.Region ?? env.region)),
        regionCode: str(env.Region ?? env.region),
        functionCount,
        hostingDomainCount,
        timezone: str(env.Timezone) ?? "Asia/Shanghai",
        alias: str(env.Alias ?? env.alias),
        runtimeMode: str(env.RuntimeMode),
      } satisfies EnvInfoView;
    },

    async appendToSession(text) {
      if (!appendUserMessage) {
        throw new Error("当前会话未暴露 append 通道，请直接在对话框发送该指令");
      }
      await appendUserMessage(text);
    },

    /**
     * 直调腾讯云 CloudBase 控制面 API（MCP capi 工具 callCloudApi）。
     * kit 的通用 provider 通道：业务组件只需 service/action/params 输入，
     * 输出为解包后的 JSON，不关心具体云实现。
     */
    async capi(service, action, params = {}) {
      return unwrapData(
        await bridge.callTool("callCloudApi", { service, action, params }),
      );
    },

    /**
     * 从当前会话的工具调用历史中读取最近一次 `auth set_env` 的环境 ID。
     * 用于让右侧面板与对话侧 MCP 绑定保持一致（旧会话历史不会触发 turnTail）。
     * 返回 undefined 表示会话里没有显式 set_env 记录。
     */
    async sessionBoundEnv(sessionId?: string) {
      const session = getSession?.(sessionId) as { events?: readonly unknown[] } | undefined;
      const events = session?.events;
      if (!events) return undefined;
      for (let index = events.length - 1; index >= 0; index -= 1) {
        const event = events[index] as
          | { type?: string; data?: { name?: string; arguments?: string } }
          | undefined;
        if (!event || event.type !== "tool/call") continue;
        const data = event.data ?? {};
        if (!str(data.name)?.includes("auth")) continue;
        try {
          const args = JSON.parse(data.arguments ?? "{}") as Record<string, unknown>;
          if (args.action === "set_env" && typeof args.envId === "string") {
            return args.envId;
          }
        } catch {
          // 参数 JSON 解析失败则跳过该事件
        }
      }
      return undefined;
    },
  };
}

function toRowPage(payload: LooseRecord, elapsedMs: number): RowPage {
  const rowsRaw = arr(payload.rows ?? payload.records ?? payload.data ?? payload.items);
  const rows = rowsRaw.map((item) => rec(item));
  const columns =
    arr(payload.columns)
      .map((item) => (typeof item === "string" ? item : str(rec(item).name)))
      .filter((name): name is string => Boolean(name)) ?? [];
  const inferred =
    columns.length > 0 ? columns : rows[0] ? Object.keys(rows[0]) : [];
  return {
    columns: inferred,
    rows,
    total: num(payload.total ?? payload.rowCount) ?? rows.length,
    elapsedMs,
  };
}

function extractPoints(payload: LooseRecord): number[] {
  const curve = rec(payload.Curve);
  const data = arr(
    curve.NewValues ??
      curve.Values ??
      payload.NewValues ??
      payload.Values ??
      payload.DataPoints ??
      payload.points ??
      payload.series ??
      payload.values,
  );
  return data
    .map((item) => {
      if (typeof item === "number") return item;
      const row = rec(item);
      return num(row.Value ?? row.value ?? row.Average ?? row.Sum) ?? 0;
    })
    .slice(-24);
}

function formatMetricValue(value: number, metricName: string): string {
  if (metricName === "FunctionError") return `${(value * (value <= 1 ? 100 : 1)).toFixed(1)}%`.replace(/\.0%/, "%");
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(Math.round(value));
}

function stringifyUsage(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") return scrubInternalCodes(value);
  if (typeof value === "number") return formatBytes(value);
  const row = rec(value);
  const used = str(row.used ?? row.Used);
  const quota = str(row.quota ?? row.Quota);
  if (used && quota) return `${used} / ${quota}`;
  return used;
}

function providerLabel(type: string): string {
  const map: Record<string, string> = {
    EMAIL: "邮箱密码",
    WX_MP: "微信",
    WX_OPEN: "微信开放平台",
    WX_MICRO_APP: "微信",
    ANONYMOUS: "匿名",
    USERNAME: "用户名密码",
  };
  return map[type] ?? type;
}
