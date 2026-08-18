import { DEFAULT_ENV_ID } from "../shared/constants.js";
import { quotePgTable } from "../shared/sql-ident.js";
import type {
  AppAuthConfig,
  AuthStatus,
  CloudBaseData,
  EnvInfoView,
  LogEntry,
  MetricSeries,
  RowPage,
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

function looksLikeWriteSql(sql: string): boolean {
  return /^\s*(insert|update|delete|alter|drop|create|truncate|grant|revoke|replace|merge|call|do)\b/i.test(
    sql,
  );
}

function resolveEnvId(): string {
  return process.env.CLOUDBASE_ENV_ID?.trim() || DEFAULT_ENV_ID;
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
): CloudBaseData {
  return {
    async listTables() {
      const envId = resolveEnvId();
      let pgError: string | undefined;
      try {
        const payload = unwrapData(
          await bridge.callTool("queryPgDatabase", {
            action: "metadata",
            limit: 200,
            envId,
          }),
        );
        const objects = arr(payload.objects ?? payload.tables ?? payload.items);
        if (objects.length > 0) return objects.map(mapTable);
        const listed = unwrapData(
          await bridge.callTool("queryPgDatabase", { action: "objects", limit: 200, envId }),
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
            envId,
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
          envId: resolveEnvId(),
        }),
      );
      return toRowPage(payload, Date.now() - started);
    },

    async listStorage(path = "") {
      const payload = unwrapData(
        await bridge.callTool("queryStorage", {
          action: "list",
          cloudPath: path || "/",
          envId: resolveEnvId(),
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
          envId: resolveEnvId(),
        }),
      );
      const url =
        str(payload.temporaryUrl ?? payload.tempUrl ?? payload.url ?? payload.downloadUrl) ?? "";
      return { url, expiresInSec: 3600 };
    },

    async authStatus() {
      const payload = unwrapData(
        await bridge.callTool("auth", { action: "status", envId: resolveEnvId() }),
      );
      const signedIn = Boolean(
        payload.signedIn ?? payload.AUTH_READY ?? str(payload.status) === "AUTH_READY",
      );
      return {
        signedIn,
        envId: str(payload.envId ?? payload.EnvId),
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

    async appAuthConfig() {
      const envId = resolveEnvId();
      const payload = unwrapData(
        await bridge.callTool("queryAppAuth", { action: "listProviders", envId }).catch(() => ({})),
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
          await bridge.callTool("queryAppAuth", { action: "getLoginConfig", envId }).catch(() => ({})),
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
      const envId = resolveEnvId();
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
              envId,
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
        await bridge.callTool("queryEnv", { action: "usage", envId: resolveEnvId() }),
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
            envId: resolveEnvId(),
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
      const envIdHint = resolveEnvId();
      const info = unwrapData(
        await bridge.callTool("queryEnv", { action: "info", envId: envIdHint }),
      );
      const env = rec(info.EnvInfo ?? info.envInfo ?? info);
      const envId = str(env.EnvId ?? env.envId) ?? str(info.EnvId) ?? envIdHint;
      let functionCount = 0;
      try {
        const fn = unwrapData(
          await bridge.callTool("queryFunctions", {
            action: "listFunctions",
            envId,
          }).catch(() => bridge.callTool("getFunctionList", { envId })),
        );
        functionCount = arr(fn.Functions ?? fn.functions ?? fn.items).length;
      } catch {
        functionCount = 0;
      }
      let hostingDomainCount = 0;
      try {
        const hosting = unwrapData(
          await bridge.callTool("queryHosting", { action: "websiteConfig", envId }),
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
