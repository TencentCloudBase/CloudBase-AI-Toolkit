import { quotePgTable } from "../shared/sql-ident.js";
import { mapSchemaColumns } from "../shared/column-form.js";
import type {
  AppAuthConfig,
  AppUser,
  AccessEndpoint,
  AuthStatus,
  CloudBaseData,
  DeploymentRecord,
  EnvInfoView,
  EnvItem,
  GatewayPrivilege,
  GatewayRoute,
  GatewayRouteInput,
  LogEntry,
  LogSearchFilters,
  LogSearchResult,
  MetricSeries,
  PgExtensionRow,
  PgFunctionRow,
  PgMigrationRow,
  PgRoleRow,
  PolicySummary,
  RowPage,
  SecretItem,
  StorageObject,
  TableSchemaDetail,
  TableSummary,
  UsageItem,
} from "../shared/types.js";
import { CloudBaseMcpBridge } from "./mcp-client.js";
import { SessionEnvCache, writeEnvHint } from "./mcp-bridge.js";
import { formatBytes, formatUsageItem, mapRegion, scrubInternalCodes } from "./term-map.js";
import {
  mapAppToEndpoint,
  mapVersionToDeployment,
  normalizeUrl,
  sortDeploymentsNewestFirst,
} from "../shared/apps-access.js";
import {
  sqlListSchemaPolicies,
  sqlListFunctions,
  sqlListExtensions,
  sqlListRoles,
} from "../../../platform-kit/src/pg/sql.js";

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
  sessionEnvCache?: SessionEnvCache,
  getCurrentSessionId?: () => string,
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
      const result = await this.searchAppUsers({
        pageSize: opts?.limit ?? 50,
        pageNo: Math.floor((opts?.offset ?? 0) / (opts?.limit ?? 20)) + 1,
      });
      return result.users;
    },

    async searchAppUsers(opts) {
      const payload = unwrapData(
        await bridge.callTool("queryPermissions", {
          action: "listUsers",
          pageNo: opts?.pageNo ?? 1,
          pageSize: opts?.pageSize ?? 50,
        }),
      );
      const users = arr(payload.users ?? payload.UserList ?? payload.Data);
      const mapped = users.map((item): AppUser => {
        const row = rec(item);
        const statusRaw = str(row.UserStatus ?? row.userStatus ?? row.Status)?.toUpperCase();
        return {
          uid: str(row.Uid ?? row.uid ?? row.uuid ?? row.id) ?? "unknown",
          name: str(row.Username ?? row.Name ?? row.name ?? row.NickName),
          email: str(row.Email ?? row.email),
          phone: str(row.Phone ?? row.phone),
          createdAt: str(row.CreateTime ?? row.createdAt ?? row.CreatedAt),
          lastLoginAt: str(row.LastLoginTime ?? row.lastLoginAt ?? row.UpdateTime),
          status: statusRaw === "BLOCKED" || statusRaw === "DISABLE" ? "disabled" : "normal",
        };
      });
      const keyword = opts?.keyword?.trim().toLowerCase();
      const filtered = keyword
        ? mapped.filter(
            (user) =>
              user.uid.toLowerCase().includes(keyword) ||
              user.name?.toLowerCase().includes(keyword) ||
              user.email?.toLowerCase().includes(keyword),
          )
        : mapped;
      return {
        users: filtered,
        total: num(payload.Total ?? payload.total) ?? filtered.length,
      };
    },

    async setAppUserStatus(uid, enabled) {
      await bridge.callTool("managePermissions", {
        action: "updateUser",
        uid,
        userStatus: enabled ? "ACTIVE" : "BLOCKED",
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
      const resolvedEnvId = str(payload.envId ?? payload.EnvId) ?? currentEnvId(payload) ?? envId;
      const sessionId = getCurrentSessionId?.();
      if (sessionEnvCache && sessionId) {
        sessionEnvCache.set(sessionId, resolvedEnvId);
        writeEnvHint(sessionEnvCache, sessionId, resolvedEnvId);
      }
      return {
        signedIn,
        envId: resolvedEnvId,
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
        const result = await this.searchLogs({ queryString: "log:ERROR", limit: 20, sort: "desc" });
        return result.entries.slice(0, 20);
      } catch (error) {
        return [
          {
            message: scrubInternalCodes(
              error instanceof Error ? error.message : String(error),
            ),
            level: "warn" as const,
          },
        ];
      }
    },

    async checkLogService() {
      const payload = unwrapData(
        await bridge.callTool("queryLogs", { action: "checkLogService" }),
      );
      return Boolean(payload.enabled ?? payload.Enabled);
    },

    async searchLogs(opts: LogSearchFilters): Promise<LogSearchResult> {
      const payload = unwrapData(
        await bridge.callTool("queryLogs", {
          action: "searchLogs",
          queryString: opts.queryString || "*",
          service: opts.service,
          startTime: opts.startTime,
          endTime: opts.endTime,
          limit: opts.limit ?? 50,
          sort: opts.sort ?? "desc",
          context: opts.context,
        }),
      );
      const logs = arr(payload.logs ?? payload.Results ?? payload.items);
      const contextOut = str(payload.context ?? payload.Context);
      return {
        entries: logs.map((item, index): LogEntry => mapLogEntry(item, index)),
        context: contextOut,
      };
    },

    async getTableSchema(schemaTable): Promise<TableSchemaDetail> {
      const payload = unwrapData(
        await bridge.callTool("queryPgDatabase", {
          action: "schema",
          objectName: schemaTable.includes(".") ? schemaTable : `public.${schemaTable}`,
        }),
      );
      const nested = rec(payload.schema ?? payload);
      const columns = mapSchemaColumns({
        columns: nested.columns ?? payload.columns,
        primaryKey: nested.primaryKey ?? payload.primaryKey,
        kind: nested.kind ?? payload.kind,
      });
      const security = rec(nested.security ?? payload.security);
      const policiesRaw = arr(security.policies ?? nested.policies);
      return {
        schemaTable: str(nested.schemaTable ?? payload.schemaTable) ?? schemaTable,
        kind: str(nested.kind ?? payload.kind) ?? "table",
        rowCount: num(nested.rowCount ?? payload.rowCount) ?? null,
        columns,
        primaryKey: arr(nested.primaryKey ?? payload.primaryKey).map(String),
        indexes: arr(nested.indexes ?? payload.indexes).map((item) => {
          const row = rec(item);
          return {
            name: str(row.name ?? row.indexname) ?? "index",
            definition: str(row.definition ?? row.indexdef) ?? "",
          };
        }),
        foreignKeys: arr(nested.foreignKeys ?? payload.foreignKeys).map((item) => {
          const row = rec(item);
          return {
            constraintName: str(row.constraintName) ?? "",
            columnName: str(row.columnName) ?? "",
            references: str(row.references) ?? "",
            referencedColumn: str(row.referencedColumn) ?? "",
          };
        }),
        security: {
          rowLevelSecurityEnabled: Boolean(
            security.rowLevelSecurityEnabled ?? security.rls_enabled,
          ),
          forceRowLevelSecurity: Boolean(security.forceRowLevelSecurity),
          policies: policiesRaw.map(mapPolicyRow),
        },
      };
    },

    async listSchemaPolicies(schema = "public") {
      const payload = unwrapData(
        await bridge.callTool("queryPgDatabase", {
          action: "sql",
          sql: sqlListSchemaPolicies(schema),
          limit: 500,
        }),
      );
      return parsePolicyRows(payload);
    },

    async runPgDDL(sql, confirm) {
      const payload = unwrapData(
        await bridge.callTool("managePgDatabase", {
          action: "execute",
          sql,
          confirm,
        }),
      );
      return {
        ok: payload.success !== false && !payload.error,
        message: str(payload.message) ?? "OK",
      };
    },

    async listPgFunctions(schema = "public") {
      const payload = unwrapData(
        await bridge.callTool("queryPgDatabase", {
          action: "sql",
          sql: sqlListFunctions(schema),
          limit: 500,
        }),
      );
      return parseSqlRows(payload).map((row): PgFunctionRow => ({
        schema: str(row.schema) ?? schema,
        name: str(row.name) ?? "unknown",
        returnType: str(row.return_type),
        language: str(row.language),
      }));
    },

    async listPgExtensions() {
      const payload = unwrapData(
        await bridge.callTool("queryPgDatabase", {
          action: "sql",
          sql: sqlListExtensions(),
          limit: 200,
        }),
      );
      return parseSqlRows(payload).map((row): PgExtensionRow => ({
        name: str(row.name) ?? "unknown",
        schema: str(row.schema),
        version: str(row.version),
      }));
    },

    async listPgRoles() {
      const payload = unwrapData(
        await bridge.callTool("queryPgDatabase", {
          action: "sql",
          sql: sqlListRoles(),
          limit: 200,
        }),
      );
      return parseSqlRows(payload).map((row): PgRoleRow => ({
        name: str(row.name) ?? "unknown",
        superuser: Boolean(row.superuser),
        canLogin: Boolean(row.can_login),
      }));
    },

    async listPgMigrations() {
      const payload = unwrapData(
        await bridge.callTool("managePgDatabase", {
          action: "listMigrations",
          limit: 100,
        }),
      );
      const items = arr(payload.migrations ?? payload.items ?? payload.records);
      return items.map((item): PgMigrationRow => {
        const row = rec(item);
        return {
          version: str(row.version ?? row.migrationVersion ?? row.Version) ?? "unknown",
          name: str(row.name ?? row.migrationName),
          appliedAt: str(row.appliedAt ?? row.ApplyTime ?? row.createdAt),
          sql: str(row.sql ?? row.Sql),
        };
      });
    },

    async listGatewayRoutes(): Promise<GatewayRoute[]> {
      const payload = unwrapData(
        await bridge.callTool("queryGateway", { action: "listRoutes" }),
      );
      const routes = arr(payload.routes ?? payload.Routes);
      return routes.map(mapGatewayRoute);
    },

    async upsertGatewayRoute(input: GatewayRouteInput) {
      const action = input.routeId ? "updateRoute" : "createRoute";
      await bridge.callTool("manageGateway", {
        action,
        routeId: input.routeId,
        domain: input.domain,
        path: input.path,
        upstreamResourceType: input.upstreamResourceType,
        targetName: input.upstreamResourceName,
        route: {
          domain: input.domain,
          path: input.path,
          upstreamResourceType: input.upstreamResourceType,
          upstreamResourceName: input.upstreamResourceName,
          enableAuth: input.enableAuth,
          enablePathTransmission: input.enablePathTransmission,
          enable: input.enable,
        },
      });
    },

    async deleteGatewayRoute(routeId, confirm) {
      await bridge.callTool("manageGateway", {
        action: "deleteRoute",
        routeId,
        confirm,
      });
    },

    async getGatewayPrivilege(): Promise<GatewayPrivilege> {
      const payload = unwrapData(
        await bridge.callTool("queryGateway", { action: "getPrivilege" }),
      );
      const privilege = rec(payload.privilege ?? payload);
      return {
        enableService: Boolean(
          privilege.enableService ?? privilege.EnableService ?? privilege.serviceEnabled,
        ),
        enableAuth: Boolean(
          privilege.enableAuth ?? privilege.EnableAuth ?? privilege.authEnabled,
        ),
      };
    },

    async listGatewayDomains() {
      const payload = unwrapData(
        await bridge.callTool("queryGateway", { action: "listRoutes" }),
      );
      const routes = arr(payload.routes ?? payload.Routes);
      const domains = routes
        .map((item) => str(rec(item).Domain ?? rec(item).domain))
        .filter((value): value is string => Boolean(value));
      return [...new Set(domains)];
    },

    async listFunctionNames() {
      const payload = unwrapData(
        await bridge.callTool("queryFunctions", { action: "listFunctions" }),
      );
      return arr(payload.Functions ?? payload.functions)
        .map((item) => str(rec(item).FunctionName ?? rec(item).Name ?? rec(item).name))
        .filter((value): value is string => Boolean(value));
    },

    async setGatewayServiceEnabled(enable) {
      await bridge.callTool("manageGateway", { action: "enableService", enable });
    },

    async setGatewayAuthEnabled(enable) {
      await bridge.callTool("manageGateway", { action: "authSwitch", enable });
    },

    async fetchMetricSeries(metricName, opts) {
      const labels: Record<string, string> = {
        FunctionInvocation: "函数调用",
        DbRead: "DB 读",
        DbWrite: "DB 写",
        FunctionError: "错误率",
      };
      try {
        const payload = unwrapData(
          await bridge.callTool("queryEnv", {
            action: "metrics",
            metricName,
            startTime: opts?.startTime,
            endTime: opts?.endTime,
            period: opts?.period,
          }),
        );
        const points = extractPoints(payload);
        const latest = points[points.length - 1] ?? 0;
        return {
          name: metricName,
          label: labels[metricName] ?? metricName,
          valueLabel: formatMetricValue(latest, metricName),
          points,
          danger: metricName === "FunctionError",
        } satisfies MetricSeries;
      } catch {
        return {
          name: metricName,
          label: labels[metricName] ?? metricName,
          valueLabel: "—",
          points: [],
          danger: metricName === "FunctionError",
        };
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

    async listAccessEndpoints() {
      const endpoints: AccessEndpoint[] = [];
      try {
        const listPayload = unwrapData(
          await bridge.callTool("queryApps", { action: "listApps", pageSize: 100 }),
        );
        const apps = arr(listPayload.apps ?? listPayload.ServiceList);
        for (const app of apps) {
          const row = rec(app);
          const serviceName = str(row.ServiceName ?? row.serviceName);
          if (!serviceName) continue;
          try {
            const detail = unwrapData(
              await bridge.callTool("queryApps", { action: "getApp", serviceName }),
            );
            const mapped = mapAppToEndpoint(serviceName, detail.app ?? detail);
            if (mapped) endpoints.push(mapped);
          } catch {
            const inlineDomain = str(row.Domain ?? row.domain);
            if (inlineDomain) {
              endpoints.push({
                id: `app:${serviceName}`,
                label: serviceName,
                url: normalizeUrl(inlineDomain),
                resourceType: "app",
                serviceName,
              });
            }
          }
        }
      } catch {
        // Best-effort when queryApps is unavailable
      }
      return endpoints;
    },

    async listDeployments() {
      const records: DeploymentRecord[] = [];
      try {
        const listPayload = unwrapData(
          await bridge.callTool("queryApps", { action: "listApps", pageSize: 50 }),
        );
        const apps = arr(listPayload.apps ?? listPayload.ServiceList);
        for (const app of apps) {
          const row = rec(app);
          const serviceName = str(row.ServiceName ?? row.serviceName);
          if (!serviceName) continue;
          let previewUrl: string | undefined;
          try {
            const detail = unwrapData(
              await bridge.callTool("queryApps", { action: "getApp", serviceName }),
            );
            previewUrl = mapAppToEndpoint(serviceName, detail.app ?? detail)?.url;
          } catch {
            previewUrl = undefined;
          }
          try {
            const versionsPayload = unwrapData(
              await bridge.callTool("queryApps", {
                action: "listAppVersions",
                serviceName,
                pageSize: 10,
              }),
            );
            const versions = arr(versionsPayload.versions ?? versionsPayload.VersionList);
            for (const version of versions) {
              const mapped = mapVersionToDeployment(serviceName, version, previewUrl);
              if (mapped) records.push(mapped);
            }
          } catch {
            // skip apps without version history
          }
        }
      } catch {
        // partial app records only
      }

      try {
        const runList = unwrapData(
          await bridge.callTool("queryCloudRun", { action: "list" }).catch(() => ({})),
        );
        const services = arr(runList.services ?? runList.ServerList ?? runList.items);
        for (const svc of services.slice(0, 20)) {
          const row = rec(svc);
          const serverName = str(row.ServerName ?? row.serverName ?? row.name);
          if (!serverName) continue;
          try {
            const recordsPayload = unwrapData(
              await bridge.callTool("queryCloudRun", {
                action: "getDeployRecords",
                detailServerName: serverName,
              }),
            );
            const deployRecords = arr(
              recordsPayload.DeployRecords ?? recordsPayload.deployRecords ?? recordsPayload.records,
            );
            for (const item of deployRecords.slice(0, 5)) {
              const drow = rec(item);
              const statusRaw = str(drow.Status ?? drow.status) ?? "unknown";
              records.push({
                id: `cloudrun:${serverName}:${str(drow.RunId ?? drow.BuildId) ?? records.length}`,
                resourceType: "cloudrun",
                resourceName: serverName,
                status: mapVersionToDeployment(serverName, { Status: statusRaw })?.status ?? "unknown",
                deployedAt: str(drow.DeployTime ?? drow.CreateTime ?? drow.UpdateTime),
                previewUrl: str(drow.AccessUrl ?? row.AccessUrl),
                relatedResources: [{ type: "cloudrun", name: serverName }],
              });
            }
          } catch {
            // skip service without deploy records
          }
        }
      } catch {
        // cloudrun optional
      }

      return sortDeploymentsNewestFirst(records);
    },

    async rollbackDeployment(_record) {
      // Rollback requires manageApps API support (P1); timeline shows confirm UI only.
      return false;
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

function mapLogEntry(item: unknown, index: number): LogEntry {
  const row = rec(item);
  const message = scrubInternalCodes(
    str(row.log ?? row.message ?? row.content ?? row.topic ?? row.Msg) ?? "",
  );
  const levelRaw = str(row.level ?? row.Level ?? row.loglevel)?.toLowerCase() ?? "info";
  const level =
    levelRaw.includes("error") ? "error" :
    levelRaw.includes("warn") ? "warn" :
    levelRaw.includes("debug") ? "debug" : "info";
  return {
    id: str(row.id ?? row.RequestId) ?? String(index),
    time: str(row.time ?? row.timestamp ?? row.Time ?? row.Timestamp),
    service: str(row.service ?? row.src ?? row.module),
    message: message || "—",
    title: message,
    level,
    raw: row,
  };
}

function mapPolicyRow(item: unknown): PolicySummary {
  const row = rec(item);
  return {
    name: str(row.name ?? row.policyname) ?? "policy",
    schema: str(row.schema ?? row.schemaname),
    table: str(row.table ?? row.tablename),
    permissive: str(row.permissive),
    roles: arr(row.roles).map(String),
    command: str(row.command ?? row.cmd) ?? "ALL",
    using: str(row.using ?? row.qual),
    withCheck: str(row.withCheck ?? row.with_check),
  };
}

function parsePolicyRows(payload: LooseRecord): PolicySummary[] {
  return parseSqlRows(payload).map(mapPolicyRow);
}

function parseSqlRows(payload: LooseRecord): LooseRecord[] {
  const rowsRaw = arr(payload.rows ?? payload.records ?? payload.data ?? payload.items);
  if (rowsRaw.length > 0) {
    return rowsRaw.map((item) => rec(item));
  }
  const columns = arr(payload.columns).map((item) =>
    typeof item === "string" ? item : str(rec(item).name),
  ).filter((name): name is string => Boolean(name));
  const matrix = arr(payload.Rows ?? payload.values);
  return matrix.map((line) => {
    const values = arr(line);
    const row: LooseRecord = {};
    columns.forEach((col, index) => {
      row[col] = values[index];
    });
    return row;
  });
}

function mapGatewayRoute(item: unknown): GatewayRoute {
  const row = rec(item);
  return {
    routeId: str(row.RouteId ?? row.routeId ?? row.id),
    domain: str(row.Domain ?? row.domain) ?? "",
    path: str(row.Path ?? row.path) ?? "/",
    upstreamResourceType: str(row.UpstreamResourceType ?? row.upstreamResourceType) ?? "",
    upstreamResourceName: str(
      row.UpstreamResourceName ?? row.upstreamResourceName ?? row.targetName,
    ) ?? "",
    enableAuth: Boolean(row.EnableAuth ?? row.enableAuth),
    enable: row.Enable === undefined ? undefined : Boolean(row.Enable ?? row.enable),
    domainType: str(row.DomainType ?? row.domainType),
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
