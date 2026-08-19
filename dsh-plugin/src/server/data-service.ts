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
  sqlListTables,
  sqlListSchemas,
  sqlListTriggers,
  sqlListTypes,
  sqlListColumnPrivileges,
  sqlListMigrations,
  sqlTableColumns,
  sqlListIndexes,
  sqlTableForeignKeys,
  sqlTableRlsStatus,
  sqlWrapDdl,
} from "../../../platform-kit/src/pg/sql.js";

type LooseRecord = Record<string, unknown>;
type LoginMethod = "device-code" | "apikey" | "host-injected";
type AuthStateListener = (status: AuthStatus) => void;

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

function mapTableKind(kindRaw: string): TableSummary["kind"] {
  const kind = kindRaw.toLowerCase();
  if (kind.includes("view") || kindRaw === "v") return "view";
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

function defaultLoginOptions(): AuthStatus["loginOptions"] {
  return [
    { method: "device-code", title: "Device code", description: "OAuth device authorization flow" },
    { method: "apikey", title: "API Key", description: "Environment API Key login" },
  ];
}

function mapAuthPayload(payload: LooseRecord, signedIn: boolean): AuthStatus {
  return {
    signedIn,
    envId: str(payload.current_env_id ?? payload.currentEnvId ?? payload.envId ?? payload.EnvId),
    authMode: str(payload.authMode ?? payload.mode) as LoginMethod | undefined,
    persisted: Boolean(payload.persisted ?? signedIn),
    tempCredentialsAvailable: Boolean(payload.tempCredentials ?? payload.hasTempCredentials),
    verificationUrl: str(payload.verification_uri_complete ?? payload.verificationUrl ?? payload.url),
    userCode: str(payload.user_code ?? payload.userCode),
    loginOptions: signedIn ? undefined : defaultLoginOptions(),
    message: scrubInternalCodes(
      str(payload.message) ??
        (signedIn ? "已登录" : "未登录，请选择登录方式"),
    ),
  };
}

export function createCloudBaseDataService(
  bridge: CloudBaseMcpBridge,
  appendUserMessage?: (text: string) => Promise<void>,
  getSession?: (sessionId?: string) => unknown,
  sessionEnvCache?: SessionEnvCache,
  getCurrentSessionId?: () => string,
): CloudBaseData {
  const authListeners = new Set<AuthStateListener>();
  let authPollTimer: ReturnType<typeof setInterval> | undefined;

  async function callCapi(
    service: string,
    action: string,
    params: Record<string, unknown> = {},
  ): Promise<LooseRecord> {
    return unwrapData(
      await bridge.callTool("callCloudApi", { service, action, params }),
    );
  }

  async function rawAuthCall(args: Record<string, unknown>): Promise<LooseRecord> {
    return unwrapData(await bridge.callTool("auth", args));
  }

  async function probeCredentials(): Promise<boolean> {
    try {
      const payload = await callCapi("tcb", "DescribeEnvs", {});
      const envList = arr(payload.EnvList ?? payload.env_candidates ?? payload.envCandidates);
      return envList.length > 0;
    } catch {
      return false;
    }
  }

  async function resolveActiveEnvId(): Promise<string | undefined> {
    const sessionId = getCurrentSessionId?.();
    const cached = sessionId && sessionEnvCache ? sessionEnvCache.get(sessionId)?.envId : undefined;
    if (cached) return cached;
    try {
      const auth = await rawAuthCall({ action: "status" });
      return str(auth.current_env_id ?? auth.currentEnvId ?? auth.envId ?? auth.EnvId) ?? cached;
    } catch {
      return cached;
    }
  }

  async function requireEnvId(): Promise<string> {
    const envId = await resolveActiveEnvId();
    if (!envId) {
      throw new Error("未绑定环境，请先登录并选择环境");
    }
    return envId;
  }

  async function executePgSql(sql: string): Promise<LooseRecord> {
    const envId = await requireEnvId();
    return callCapi("tcb", "ExecutePGSql", { EnvId: envId, Sql: sql });
  }

  async function executePgSqlWithDdlRetry(sql: string): Promise<LooseRecord> {
    try {
      return await executePgSql(sql);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/InternalError|internal error/i.test(message)) {
        throw error;
      }
      return executePgSql(sqlWrapDdl(sql));
    }
  }

  function notifyAuthListeners(status: AuthStatus): void {
    for (const listener of authListeners) {
      listener(status);
    }
  }

  async function buildAuthStatus(probe = true): Promise<AuthStatus> {
    const raw = await rawAuthCall({ action: "status" }).catch(() => ({}));
    const rawSigned =
      Boolean(raw.signedIn) ||
      Boolean(raw.AUTH_READY) ||
      str(raw.auth_status) === "READY" ||
      str(raw.status) === "AUTH_READY" ||
      str(raw.code) === "AUTH_READY" ||
      str(raw.code) === "ENV_READY";
    const valid = rawSigned && (!probe || (await probeCredentials()));
    const status = mapAuthPayload(raw, valid);
    if (!valid) {
      status.signedIn = false;
      status.loginOptions = defaultLoginOptions();
    }
    return status;
  }

  const service: CloudBaseData = {
    async listTables() {
      let pgError: string | undefined;
      try {
        const payload = await executePgSql(sqlListTables());
        const rows = parseSqlRows(payload);
        if (rows.length > 0) {
          return rows.map((row): TableSummary => ({
            name: str(row.name) ?? "unknown",
            schema: str(row.schema) ?? "public",
            kind: mapTableKind(str(row.kind) ?? "r"),
            rowCount: num(row.estimated_rows),
          }));
        }
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

      if (pgError) throw new Error(pgError);
      if (nosqlError) throw new Error(nosqlError);
      return [];
    },

    async listTableColumns(table) {
      const payload = await executePgSql(
        sqlTableColumns(table.includes(".") ? table : `public.${table}`),
      );
      const rows = parseSqlRows(payload);
      const columns = rows.map((row) => ({
        name: str(row.column_name) ?? "unknown",
        type: str(row.data_type) ?? "unknown",
        dataType: str(row.data_type) ?? "unknown",
        nullable: str(row.is_nullable)?.toUpperCase() === "YES",
        isUpdatable: true,
        primaryKey: Boolean(row.is_pk),
      }));
      return mapSchemaColumns({
        columns,
        primaryKey: columns.filter((c) => c.primaryKey).map((c) => c.name),
        kind: "table",
      });
    },

    async listAppUsers(opts) {
      const result = await service.searchAppUsers({
        pageSize: opts?.limit ?? 50,
        pageNo: Math.floor((opts?.offset ?? 0) / (opts?.limit ?? 20)) + 1,
      });
      return result.users;
    },

    async searchAppUsers(opts) {
      const envId = await requireEnvId();
      const payload = await callCapi("tcb", "DescribeUserList", {
        EnvId: envId,
        PageNo: opts?.pageNo ?? 1,
        PageSize: opts?.pageSize ?? 50,
        Name: opts?.keyword,
        Email: opts?.keyword,
      });
      const data = rec(payload.Data ?? payload);
      const users = arr(data.UserList ?? data.users ?? payload.UserList);
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
        total: num(data.Total ?? payload.Total ?? data.total) ?? filtered.length,
      };
    },

    async setAppUserStatus(uid, enabled) {
      const envId = await requireEnvId();
      await callCapi("tcb", "ModifyUser", {
        EnvId: envId,
        Uid: uid,
        UserStatus: enabled ? "ACTIVE" : "BLOCKED",
      });
    },

    async listSecrets() {
      const envId = await requireEnvId();
      const secrets: SecretItem[] = [];
      try {
        const listed = await callCapi("tcb", "DescribeFunctions", { EnvId: envId, Limit: 20 });
        const functions = arr(listed.Functions ?? listed.functions);
        for (const item of functions.slice(0, 20)) {
          const row = rec(item);
          const name = str(row.FunctionName ?? row.Name);
          if (!name) continue;
          try {
            const detail = await callCapi("tcb", "GetFunction", {
              EnvId: envId,
              FunctionName: name,
            });
            const env = rec(detail.Environment ?? rec(detail.Function).Environment);
            for (const variable of arr(env.Variables ?? env.variables)) {
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
          } catch {
            // skip function without env vars
          }
        }
      } catch {
        // best-effort
      }
      return secrets;
    },

    async readRows(table, opts) {
      const limit = opts?.limit ?? 50;
      const offset = opts?.offset ?? 0;
      const sql = `SELECT * FROM ${quotePgTable(table)} LIMIT ${limit} OFFSET ${offset}`;
      return service.runReadSql(sql);
    },

    async runReadSql(sql) {
      if (looksLikeWriteSql(sql)) {
        throw new Error("写 SQL 必须经会话确认后由 runPgDDL 执行");
      }
      const started = Date.now();
      const payload = await executePgSql(sql);
      return toRowPage(payload, Date.now() - started);
    },

    async listStorage(_path = "") {
      // Host COS responsibility per spec §3.6 — file listing via host SDK, not MCP storage tools.
      return [] satisfies StorageObject[];
    },

    async storageUrl(_cloudPath) {
      throw new Error("storageUrl 需宿主注入 COS SDK 实现");
    },

    async authStatus() {
      return buildAuthStatus(true);
    },

    async startLogin(method: LoginMethod = "device-code", params?: { envId?: string; apiKey?: string }) {
      if (method === "host-injected") {
        return buildAuthStatus(true);
      }
      if (method === "apikey") {
        const envId = params?.envId;
        const apiKey = params?.apiKey;
        if (!envId || !apiKey) {
          return {
            signedIn: false,
            persisted: false,
            tempCredentialsAvailable: false,
            loginOptions: defaultLoginOptions(),
            message: "API Key 登录需要 envId 与 apiKey",
          } satisfies AuthStatus;
        }
        const payload = await rawAuthCall({
          action: "login_by_api_key",
          envId,
          apiKey,
        });
        const status = mapAuthPayload(payload, await probeCredentials());
        notifyAuthListeners(status);
        return status;
      }
      const payload = await rawAuthCall({ action: "start_auth", authMode: "device" });
      const status = mapAuthPayload(payload, false);
      status.signedIn = false;
      if (payload.verification_uri_complete || payload.verificationUrl) {
        status.verificationUrl =
          str(payload.verification_uri_complete ?? payload.verificationUrl ?? payload.url) ?? "";
        status.userCode = str(payload.user_code ?? payload.userCode) ?? "";
        status.message = scrubInternalCodes(
          str(payload.message) ?? "请在浏览器完成 device-code 授权",
        );
      }
      notifyAuthListeners(status);
      return status;
    },

    async startAuth() {
      return service.startLogin("device-code");
    },

    authStateChange(listener: AuthStateListener): () => void {
      authListeners.add(listener);
      if (!authPollTimer) {
        authPollTimer = setInterval(() => {
          void buildAuthStatus(true).then(notifyAuthListeners);
        }, 5000);
      }
      void buildAuthStatus(true).then(listener);
      return () => {
        authListeners.delete(listener);
        if (authListeners.size === 0 && authPollTimer) {
          clearInterval(authPollTimer);
          authPollTimer = undefined;
        }
      };
    },

    async logout() {
      await rawAuthCall({ action: "logout", confirm: "yes" });
      const status: AuthStatus = {
        signedIn: false,
        persisted: false,
        tempCredentialsAvailable: false,
        loginOptions: defaultLoginOptions(),
        message: "已退出登录",
      };
      notifyAuthListeners(status);
      return status;
    },

    async listEnvironments() {
      const payload = await callCapi("tcb", "DescribeEnvs", {});
      const candidates = arr(
        payload.env_candidates ?? payload.envCandidates ?? payload.EnvList ?? payload.Envs,
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
      const payload = await rawAuthCall({ action: "set_env", envId });
      const sessionId = getCurrentSessionId?.();
      const resolvedEnvId = str(payload.envId ?? payload.EnvId) ?? envId;
      if (sessionEnvCache && sessionId) {
        sessionEnvCache.set(sessionId, resolvedEnvId);
        writeEnvHint(sessionEnvCache, sessionId, resolvedEnvId);
      }
      const status = await buildAuthStatus(true);
      status.envId = resolvedEnvId;
      notifyAuthListeners(status);
      return status;
    },

    async appAuthConfig() {
      return service.getAuthLoginConfig();
    },

    async getAuthLoginConfig() {
      const envId = await requireEnvId();
      const payload = await callCapi("tcb", "DescribeAppAuth", { EnvId: envId }).catch(() => ({}));
      const providers = arr(payload.Providers ?? payload.providers).map(
        (item): AppAuthConfig["providers"][number] => {
          const row = rec(item);
          const rawName = str(row.ProviderType ?? row.type ?? row.name) ?? "unknown";
          return {
            name: providerLabel(rawName),
            enabled: Boolean(row.Status === "ENABLED" || row.enabled || row.Enable),
          };
        },
      );
      return { providers } satisfies AppAuthConfig;
    },

    async metrics() {
      const names = [
        { metricName: "FunctionInvocation", label: "函数调用" },
        { metricName: "DbRead", label: "DB 读" },
        { metricName: "DbWrite", label: "DB 写" },
        { metricName: "FunctionError", label: "错误率", danger: true },
      ] as const;
      const envId = await resolveActiveEnvId();
      if (!envId) {
        return names.map((item) => ({
          name: item.metricName,
          label: item.label,
          valueLabel: "—",
          points: [],
          danger: "danger" in item ? item.danger : false,
        }));
      }
      const end = new Date();
      const start = new Date(end.getTime() - 24 * 3600 * 1000);
      const fmt = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
      const series: MetricSeries[] = [];
      for (const item of names) {
        try {
          const payload = await callCapi("tcb", "DescribeCurveData", {
            EnvId: envId,
            MetricName: item.metricName,
            StartTime: fmt(start),
            EndTime: fmt(end),
            Period: 3600,
          });
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
      const envId = await requireEnvId();
      const end = new Date();
      const start = new Date(end.getFullYear(), end.getMonth(), 1);
      const fmtDate = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const payload = await callCapi("tcb", "DescribeUsage", {
        EnvId: envId,
        StartDate: fmtDate(start),
        EndDate: fmtDate(end),
      });
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
        const result = await service.searchLogs({ queryString: "log:ERROR", limit: 20, sort: "desc" });
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
      try {
        const envId = await requireEnvId();
        await callCapi("tcb", "SearchClsLog", {
          EnvId: envId,
          QueryString: "*",
          Limit: 1,
          StartTime: new Date(Date.now() - 3600000).toISOString(),
          EndTime: new Date().toISOString(),
        });
        return true;
      } catch {
        return false;
      }
    },

    async searchLogs(opts: LogSearchFilters): Promise<LogSearchResult> {
      const envId = await requireEnvId();
      const payload = await callCapi("tcb", "SearchClsLog", {
        EnvId: envId,
        QueryString: opts.queryString || "*",
        StartTime: opts.startTime,
        EndTime: opts.endTime,
        Limit: opts.limit ?? 50,
        Context: opts.context,
      });
      const logs = arr(payload.Results ?? payload.logs ?? payload.items);
      const contextOut = str(payload.Context ?? payload.context);
      return {
        entries: logs.map((item, index): LogEntry => mapLogEntry(item, index)),
        context: contextOut,
      };
    },

    async getTableSchema(schemaTable): Promise<TableSchemaDetail> {
      const qualified = schemaTable.includes(".") ? schemaTable : `public.${schemaTable}`;
      const [colPayload, idxPayload, fkPayload, rlsPayload, policyPayload] = await Promise.all([
        executePgSql(sqlTableColumns(qualified)),
        executePgSql(sqlListIndexes(qualified)),
        executePgSql(sqlTableForeignKeys(qualified)),
        executePgSql(sqlTableRlsStatus(qualified)),
        executePgSql(sqlListSchemaPolicies(qualified.split(".")[0] ?? "public")),
      ]);
      const colRows = parseSqlRows(colPayload);
      const columns = colRows.map((row) => ({
        name: str(row.column_name) ?? "unknown",
        type: str(row.data_type) ?? "unknown",
        dataType: str(row.data_type) ?? "unknown",
        nullable: str(row.is_nullable)?.toUpperCase() === "YES",
        isUpdatable: true,
        primaryKey: Boolean(row.is_pk),
      }));
      const mapped = mapSchemaColumns({
        columns,
        primaryKey: columns.filter((c) => c.primaryKey).map((c) => c.name),
        kind: "table",
      });
      const rlsRow = parseSqlRows(rlsPayload)[0] ?? {};
      const tableName = qualified.split(".")[1] ?? qualified;
      const schemaName = qualified.split(".")[0] ?? "public";
      const policiesRaw = parseSqlRows(policyPayload).filter(
        (p) => str(p.tablename) === tableName && str(p.schemaname) === schemaName,
      );
      return {
        schemaTable: qualified,
        kind: "table",
        rowCount: null,
        columns: mapped,
        primaryKey: mapped.filter((c) => c.primaryKey).map((c) => c.name),
        indexes: parseSqlRows(idxPayload).map((row) => ({
          name: str(row.indexname) ?? "index",
          definition: str(row.indexdef) ?? "",
        })),
        foreignKeys: parseSqlRows(fkPayload).map((row) => ({
          constraintName: str(row.constraint_name) ?? "",
          columnName: str(row.column_name) ?? "",
          references: str(row.references) ?? "",
          referencedColumn: str(row.referenced_column) ?? "",
        })),
        security: {
          rowLevelSecurityEnabled: Boolean(rlsRow.rls_enabled),
          forceRowLevelSecurity: Boolean(rlsRow.force_rls),
          policies: policiesRaw.map(mapPolicyRow),
        },
      };
    },

    async listSchemaPolicies(schema = "public") {
      const payload = await executePgSql(sqlListSchemaPolicies(schema));
      return parsePolicyRows(payload);
    },

    async listSchemas() {
      const payload = await executePgSql(sqlListSchemas());
      return parseSqlRows(payload).map((row) => ({
        name: str(row.name) ?? "unknown",
        owner: str(row.owner),
      }));
    },

    async listTriggers(schema = "public") {
      const payload = await executePgSql(sqlListTriggers(schema));
      return parseSqlRows(payload).map((row) => ({
        schema: str(row.schema) ?? schema,
        table: str(row.table_name) ?? "",
        name: str(row.name) ?? "unknown",
        definition: str(row.definition),
      }));
    },

    async listTypes(schema = "public") {
      const payload = await executePgSql(sqlListTypes(schema));
      return parseSqlRows(payload).map((row) => ({
        schema: str(row.schema) ?? schema,
        name: str(row.name) ?? "unknown",
        definition: str(row.definition),
      }));
    },

    async listColumnPrivileges(schemaTable: string) {
      const payload = await executePgSql(
        sqlListColumnPrivileges(schemaTable.includes(".") ? schemaTable : `public.${schemaTable}`),
      );
      return parseSqlRows(payload).map((row) => ({
        grantee: str(row.grantee) ?? "",
        columnName: str(row.column_name) ?? "",
        privilegeType: str(row.privilege_type) ?? "",
      }));
    },

    async runPgDDL(sql, confirm) {
      if (!confirm) {
        throw new Error("runPgDDL 需要 confirm=true");
      }
      const payload = await executePgSqlWithDdlRetry(sql);
      return {
        ok: payload.error === undefined && payload.Error === undefined,
        message: str(payload.message) ?? "OK",
      };
    },

    async listPgFunctions(schema = "public") {
      const payload = await executePgSql(sqlListFunctions(schema));
      return parseSqlRows(payload).map((row): PgFunctionRow => ({
        schema: str(row.schema) ?? schema,
        name: str(row.name) ?? "unknown",
        returnType: str(row.return_type),
        language: str(row.language),
      }));
    },

    async listPgExtensions() {
      const payload = await executePgSql(sqlListExtensions());
      return parseSqlRows(payload).map((row): PgExtensionRow => ({
        name: str(row.name) ?? "unknown",
        schema: str(row.schema),
        version: str(row.version),
      }));
    },

    async listPgRoles() {
      const payload = await executePgSql(sqlListRoles());
      return parseSqlRows(payload).map((row): PgRoleRow => ({
        name: str(row.name) ?? "unknown",
        superuser: Boolean(row.superuser),
        canLogin: Boolean(row.can_login),
      }));
    },

    async listMigrations() {
      try {
        const payload = await executePgSql(sqlListMigrations());
        return parseSqlRows(payload).map((row): PgMigrationRow => ({
          version: str(row.version) ?? "unknown",
          name: str(row.name),
          appliedAt: str(row.applied_at),
        }));
      } catch {
        return [];
      }
    },

    async listPgMigrations() {
      return service.listMigrations();
    },

    async listGatewayRoutes(): Promise<GatewayRoute[]> {
      const envId = await requireEnvId();
      const payload = await callCapi("tcb", "DescribeHTTPServiceRoute", {
        EnvId: envId,
        Filters: [{ Name: "DomainType", Values: ["HTTPSERVICE"] }],
        Offset: 0,
        Limit: 100,
      });
      const domains = arr(payload.Domains ?? payload.domains);
      const routes: GatewayRoute[] = [];
      for (const domainEntry of domains) {
        const domainRow = rec(domainEntry);
        const domain = str(domainRow.Domain ?? domainRow.domain) ?? "";
        for (const route of arr(domainRow.Routes ?? domainRow.routes)) {
          routes.push(mapGatewayRoute(route, domain));
        }
      }
      return routes;
    },

    async upsertGatewayRoute(input: GatewayRouteInput) {
      const envId = await requireEnvId();
      if (input.routeId) {
        await callCapi("tcb", "ModifyHTTPServiceRoute", {
          EnvId: envId,
          Domain: input.domain,
          Routes: [
            {
              Path: input.path,
              UpstreamResourceType: input.upstreamResourceType,
              UpstreamResourceName: input.upstreamResourceName,
              EnableAuth: input.enableAuth,
              EnablePathTransmission: input.enablePathTransmission,
              Enable: input.enable ?? true,
            },
          ],
        });
        return;
      }
      await callCapi("tcb", "CreateHTTPServiceRoute", {
        EnvId: envId,
        Domain: {
          Domain: input.domain,
          Routes: [
            {
              Path: input.path,
              UpstreamResourceType: input.upstreamResourceType,
              UpstreamResourceName: input.upstreamResourceName,
              EnableAuth: input.enableAuth,
              EnablePathTransmission: input.enablePathTransmission,
              Enable: input.enable ?? true,
            },
          ],
        },
      });
    },

    async deleteGatewayRoute(routeId, confirm) {
      if (!confirm) throw new Error("deleteGatewayRoute 需要 confirm=true");
      const envId = await requireEnvId();
      const routes = await service.listGatewayRoutes();
      const target = routes.find((r) => r.routeId === routeId);
      if (!target) throw new Error(`Route ${routeId} not found`);
      await callCapi("tcb", "DeleteHTTPServiceRoute", {
        EnvId: envId,
        Domain: target.domain,
        Path: target.path,
      });
    },

    async getGatewayPrivilege(): Promise<GatewayPrivilege> {
      const envId = await requireEnvId();
      const payload = await callCapi("tcb", "DescribeCloudBaseGWService", {
        ServiceId: envId,
        EnableRegion: true,
        EnableUnion: true,
      });
      return {
        enableService: Boolean(payload.EnableService ?? payload.enableService),
        enableAuth: Boolean(payload.EnableAuth ?? payload.enableAuth),
      };
    },

    async listCustomDomains() {
      const envId = await requireEnvId();
      const payload = await callCapi("tcb", "DescribePublicGwDomains", { EnvId: envId });
      return arr(payload.Domains ?? payload.domains).map((item) => {
        const row = rec(item);
        return {
          domain: str(row.Domain ?? row.domain) ?? "",
          status: (str(row.Status ?? row.status)?.toLowerCase() === "ok" ? "ok" : "binding") as
            | "binding"
            | "ok"
            | "fail",
          accessType: str(row.AccessType ?? row.accessType) as "DIRECT" | "CDN" | "CUSTOM" | undefined,
          certificateId: str(row.CertId ?? row.certificateId),
          cnameTarget: str(row.CNAMEDomain ?? row.cnameTarget),
          createdAt: str(row.CreateTime ?? row.createdAt),
        };
      });
    },

    async listGatewayDomains() {
      const domains = await service.listCustomDomains();
      return domains.map((d) => d.domain).filter(Boolean);
    },

    async bindCustomDomain(input: {
      domain: string;
      certId?: string;
      cnameDomain?: string;
      accessType?: string;
      description?: string;
    }) {
      const envId = await requireEnvId();
      await callCapi("tcb", "CreatePublicGwCustomDomain", {
        EnvId: envId,
        CustomDomain: input.domain,
        CertId: input.certId,
        CNAMEDomain: input.cnameDomain,
        Desc: input.description,
      }).catch(async () =>
        callCapi("tcb", "BindPublicGwCustomDomain", {
          EnvId: envId,
          CustomDomain: input.domain,
          CertId: input.certId,
          CNAMEDomain: input.cnameDomain,
        }),
      );
    },

    async deleteCustomDomain(domain: string, confirm: boolean) {
      if (!confirm) throw new Error("deleteCustomDomain 需要 confirm=true");
      const envId = await requireEnvId();
      await callCapi("tcb", "UnbindPublicGwCustomDomain", {
        EnvId: envId,
        CustomDomain: domain,
      });
    },

    async listSafetyDomains() {
      const envId = await requireEnvId();
      const payload = await callCapi("tcb", "DescribeSafetySource", {
        EnvId: envId,
        Offset: 0,
        Limit: 100,
      });
      return arr(payload.Sources ?? payload.sources ?? payload.items).map((item) => {
        const row = rec(item);
        return {
          id: str(row.ItemId ?? row.id) ?? "",
          appName: str(row.AppName ?? row.appName) ?? "",
        };
      });
    },

    async getStorageSecurityRules() {
      const envId = await requireEnvId();
      const envPayload = await callCapi("tcb", "DescribeEnvs", { EnvId: envId });
      const env = rec(arr(envPayload.EnvList)[0]);
      const storages = arr(env.Storages ?? env.storages);
      const bucket = str(rec(storages[0]).Bucket ?? env.storageBucket);
      if (!bucket) return { aclTag: "PRIVATE" as const, rule: undefined };
      const payload = await callCapi("tcb", "DescribeStorageSafeRule", {
        EnvId: envId,
        Bucket: bucket,
      });
      return {
        aclTag: (str(payload.AclTag ?? payload.aclTag) ?? "PRIVATE") as
          | "READONLY"
          | "PRIVATE"
          | "ADMINWRITE"
          | "ADMINONLY"
          | "CUSTOM",
        rule: str(payload.Rule ?? payload.rule),
      };
    },

    async setStorageSecurityRules(rules: { aclTag: string; rule?: string }) {
      const envId = await requireEnvId();
      const envPayload = await callCapi("tcb", "DescribeEnvs", { EnvId: envId });
      const env = rec(arr(envPayload.EnvList)[0]);
      const storages = arr(env.Storages ?? env.storages);
      const bucket = str(rec(storages[0]).Bucket ?? env.storageBucket);
      if (!bucket) throw new Error("无法解析存储 Bucket");
      await callCapi("tcb", "ModifyStorageSafeRule", {
        EnvId: envId,
        Bucket: bucket,
        AclTag: rules.aclTag,
        Rule: rules.rule,
      });
    },

    async listCdnCacheConfig() {
      const envId = await requireEnvId();
      const envPayload = await callCapi("tcb", "DescribeEnvs", { EnvId: envId });
      const env = rec(arr(envPayload.EnvList)[0]);
      const storages = arr(env.Storages ?? env.storages);
      const bucket = str(rec(storages[0]).Bucket ?? env.storageBucket);
      if (!bucket) return { status: "unknown" as const };
      const payload = await callCapi("tcb", "DescribeCDNChainTask", {
        EnvId: envId,
        Bucket: bucket,
      }).catch(() => ({}));
      return {
        status: (str(payload.Status ?? payload.status) ?? "unknown") as string,
      };
    },

    async getStorageCustomDomains() {
      const envId = await requireEnvId();
      const payload = await callCapi("tcb", "DescribeHostingDomain", {
        EnvId: envId,
        DomainType: "STATIC_STORE",
      }).catch(() => ({}));
      return arr(payload.Domains ?? payload.domains).map((item) => {
        const row = rec(item);
        return {
          domain: str(row.Domain ?? row.domain) ?? "",
          status: str(row.Status ?? row.status),
        };
      });
    },

    async listFunctionNames() {
      const envId = await requireEnvId();
      const payload = await callCapi("tcb", "DescribeFunctions", { EnvId: envId, Limit: 100 });
      return arr(payload.Functions ?? payload.functions)
        .map((item) => str(rec(item).FunctionName ?? rec(item).Name))
        .filter((value): value is string => Boolean(value));
    },

    async setGatewayServiceEnabled(enable) {
      const envId = await requireEnvId();
      await callCapi("tcb", "ModifyCloudBaseGWPrivilege", {
        ServiceId: envId,
        EnableService: enable,
      });
    },

    async setGatewayAuthEnabled(enable) {
      const envId = await requireEnvId();
      await callCapi("tcb", "ModifyCloudBaseGWPrivilege", {
        ServiceId: envId,
        Options: [{ Key: "EnableAuth", Value: enable ? "true" : "false" }],
      });
    },

    async fetchMetricSeries(metricName, opts) {
      const labels: Record<string, string> = {
        FunctionInvocation: "函数调用",
        DbRead: "DB 读",
        DbWrite: "DB 写",
        FunctionError: "错误率",
      };
      const envId = await resolveActiveEnvId();
      if (!envId) {
        return {
          name: metricName,
          label: labels[metricName] ?? metricName,
          valueLabel: "—",
          points: [],
          danger: metricName === "FunctionError",
        } satisfies MetricSeries;
      }
      try {
        const payload = await callCapi("tcb", "DescribeCurveData", {
          EnvId: envId,
          MetricName: metricName,
          StartTime: opts?.startTime,
          EndTime: opts?.endTime,
          Period: opts?.period ?? 3600,
        });
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
      const auth = await rawAuthCall({ action: "status" }).catch(() => ({}));
      const activeEnvId = str(auth.current_env_id ?? auth.currentEnvId) ?? "";
      let env: LooseRecord = {};
      if (activeEnvId) {
        const info = await callCapi("tcb", "DescribeEnvs", { EnvId: activeEnvId });
        env = rec(arr(info.EnvList)[0]);
      }
      const envId = str(env.EnvId ?? env.envId) ?? activeEnvId;
      let functionCount = 0;
      if (envId) {
        try {
          const fn = await callCapi("tcb", "DescribeFunctions", { EnvId: envId, Limit: 100 });
          functionCount = arr(fn.Functions ?? fn.functions).length;
        } catch {
          functionCount = 0;
        }
      }
      let hostingDomainCount = 0;
      if (envId) {
        try {
          const hosting = await callCapi("tcb", "DescribeHostingDomain", { EnvId: envId });
          const domains = arr(hosting.Domains ?? hosting.domains);
          hostingDomainCount = domains.length || (str(hosting.DefaultDomain) ? 1 : 0);
        } catch {
          hostingDomainCount = 0;
        }
      }
      return {
        envId,
        regionLabel: mapRegion(str(env.Region ?? env.region)),
        regionCode: str(env.Region ?? env.region),
        functionCount,
        hostingDomainCount,
        timezone: str(env.Timezone) ?? "Asia/Shanghai",
        alias: str(env.Alias ?? env.alias),
        runtimeMode: str(env.RuntimeMode ?? env.runtimeMode),
      } satisfies EnvInfoView;
    },

    async appendToSession(text) {
      if (!appendUserMessage) {
        throw new Error("当前会话未暴露 append 通道，请直接在对话框发送该指令");
      }
      await appendUserMessage(text);
    },

    async capi(service, action, params = {}) {
      return callCapi(service, action, params);
    },

    async listAccessEndpoints() {
      const envId = await requireEnvId();
      const endpoints: AccessEndpoint[] = [];
      try {
        const listPayload = await callCapi("tcb", "DescribeCloudAppList", {
          EnvId: envId,
          DeployType: "static-hosting",
          PageNo: 1,
          PageSize: 100,
        });
        const apps = arr(listPayload.ServiceList ?? listPayload.apps);
        for (const app of apps) {
          const row = rec(app);
          const serviceName = str(row.ServiceName ?? row.serviceName);
          const domain = str(row.Domain ?? row.domain);
          if (serviceName && domain) {
            endpoints.push({
              id: `app:${serviceName}`,
              label: serviceName,
              url: normalizeUrl(domain),
              resourceType: "app",
              serviceName,
            });
          }
        }
      } catch {
        // best-effort
      }
      try {
        const hosting = await callCapi("tcb", "DescribeHostingDomain", { EnvId: envId });
        const defaultDomain = str(hosting.DefaultDomain ?? hosting.defaultDomain);
        if (defaultDomain) {
          endpoints.push({
            id: "hosting:default",
            label: "静态托管",
            url: normalizeUrl(defaultDomain),
            resourceType: "hosting",
          });
        }
      } catch {
        // optional
      }
      return endpoints;
    },

    async listDeployments() {
      const envId = await requireEnvId();
      const records: DeploymentRecord[] = [];
      try {
        const listPayload = await callCapi("tcb", "DescribeCloudAppList", {
          EnvId: envId,
          DeployType: "static-hosting",
          PageNo: 1,
          PageSize: 50,
        });
        const apps = arr(listPayload.ServiceList ?? listPayload.apps);
        for (const app of apps) {
          const row = rec(app);
          const serviceName = str(row.ServiceName ?? row.serviceName);
          if (!serviceName) continue;
          const previewUrl = str(row.Domain ?? row.domain)
            ? normalizeUrl(str(row.Domain ?? row.domain)!)
            : undefined;
          try {
            const versionsPayload = await callCapi("tcb", "DescribeCloudAppVersionList", {
              EnvId: envId,
              DeployType: "static-hosting",
              ServiceName: serviceName,
              PageNo: 1,
              PageSize: 10,
            });
            const versions = arr(versionsPayload.VersionList ?? versionsPayload.versions);
            for (const version of versions) {
              const mapped = mapVersionToDeployment(serviceName, version, previewUrl);
              if (mapped) records.push(mapped);
            }
          } catch {
            // skip
          }
        }
      } catch {
        // partial
      }
      return sortDeploymentsNewestFirst(records);
    },

    async rollbackDeployment(_record) {
      return false;
    },

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
          // skip
        }
      }
      return undefined;
    },
  };

  return service;
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
  const rowsRaw = arr(payload.rows ?? payload.records ?? payload.data ?? payload.items ?? payload.Rows);
  if (rowsRaw.length > 0) {
    return rowsRaw.map((item) => rec(item));
  }
  const columns = arr(payload.columns ?? payload.Columns)
    .map((item) => (typeof item === "string" ? item : str(rec(item).name)))
    .filter((name): name is string => Boolean(name));
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

function mapGatewayRoute(item: unknown, domainOverride?: string): GatewayRoute {
  const row = rec(item);
  return {
    routeId: str(row.RouteId ?? row.routeId ?? row.id),
    domain: domainOverride ?? str(row.Domain ?? row.domain) ?? "",
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
  const rowsRaw = arr(payload.rows ?? payload.records ?? payload.data ?? payload.items ?? payload.Rows);
  const rows = rowsRaw.map((item) => rec(item));
  const columns =
    arr(payload.columns ?? payload.Columns)
      .map((item) => (typeof item === "string" ? item : str(rec(item).name)))
      .filter((name): name is string => Boolean(name)) ?? [];
  const inferred = columns.length > 0 ? columns : rows[0] ? Object.keys(rows[0]) : [];
  return {
    columns: inferred,
    rows,
    total: num(payload.total ?? payload.rowCount ?? payload.AffectedRows) ?? rows.length,
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
  if (metricName === "FunctionError") {
    return `${(value * (value <= 1 ? 100 : 1)).toFixed(1)}%`.replace(/\.0%/, "%");
  }
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
