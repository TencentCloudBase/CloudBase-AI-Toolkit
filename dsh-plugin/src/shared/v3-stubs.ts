import type {
  GatewayPrivilege,
  GatewayRoute,
  GatewayRouteInput,
  LogSearchFilters,
  LogSearchResult,
  MetricSeries,
  PolicySummary,
  TableSchemaDetail,
} from "./types.js";

/** Minimal no-op defaults for v3 CloudBaseData methods (RPC passthrough / mocks). */
export function createV3DataStubs(handlers?: {
  call?: (method: string, args?: Record<string, unknown>) => Promise<unknown>;
}): Pick<
  import("./types.js").CloudBaseData,
  | "searchAppUsers"
  | "setAppUserStatus"
  | "checkLogService"
  | "searchLogs"
  | "getTableSchema"
  | "listSchemaPolicies"
  | "runPgDDL"
  | "listGatewayRoutes"
  | "upsertGatewayRoute"
  | "deleteGatewayRoute"
  | "getGatewayPrivilege"
  | "fetchMetricSeries"
> {
  const call = handlers?.call;
  return {
    async searchAppUsers(opts) {
      if (call) return (await call("searchAppUsers", opts ?? {})) as { users: []; total: 0 };
      return { users: [], total: 0 };
    },
    async setAppUserStatus(uid, enabled) {
      if (call) await call("setAppUserStatus", { uid, enabled });
    },
    async checkLogService() {
      if (call) return Boolean(await call("checkLogService"));
      return true;
    },
    async searchLogs(opts: LogSearchFilters): Promise<LogSearchResult> {
      if (call) return (await call("searchLogs", opts as unknown as Record<string, unknown>)) as LogSearchResult;
      return { entries: [] };
    },
    async getTableSchema(schemaTable): Promise<TableSchemaDetail> {
      if (call) return (await call("getTableSchema", { schemaTable })) as TableSchemaDetail;
      throw new Error("getTableSchema not implemented");
    },
    async listSchemaPolicies(schema = "public"): Promise<PolicySummary[]> {
      if (call) return (await call("listSchemaPolicies", { schema })) as PolicySummary[];
      return [];
    },
    async runPgDDL(sql, confirm) {
      if (call) return (await call("runPgDDL", { sql, confirm })) as { ok: boolean; message: string };
      return { ok: true, message: "mock" };
    },
    async listGatewayRoutes(): Promise<GatewayRoute[]> {
      if (call) return (await call("listGatewayRoutes")) as GatewayRoute[];
      return [];
    },
    async upsertGatewayRoute(input: GatewayRouteInput) {
      if (call) await call("upsertGatewayRoute", input as unknown as Record<string, unknown>);
    },
    async deleteGatewayRoute(routeId, confirm) {
      if (call) await call("deleteGatewayRoute", { routeId, confirm });
    },
    async getGatewayPrivilege(): Promise<GatewayPrivilege> {
      if (call) return (await call("getGatewayPrivilege")) as GatewayPrivilege;
      return {};
    },
    async fetchMetricSeries(metricName, opts): Promise<MetricSeries> {
      if (call) {
        return (await call("fetchMetricSeries", {
          metricName,
          ...(opts ?? {}),
        })) as MetricSeries;
      }
      return { name: metricName, label: metricName, valueLabel: "—", points: [] };
    },
  };
}
