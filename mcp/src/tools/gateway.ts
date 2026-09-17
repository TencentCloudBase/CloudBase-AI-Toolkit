import { z } from "zod";
import { t } from "../i18n/index.js";
import {
  getCloudBaseManager,
  getEnvId,
  logCloudBaseResult,
} from "../cloudbase-manager.js";
import { ExtendedMcpServer } from "../server.js";
import {
  rankGatewayAccessUrls,
  toAccessUrlEnvelope,
  type GatewayRouteUrlCandidate,
} from "../utils/gateway-access-urls.js";
import { jsonContent } from "../utils/json-content.js";
import type {
  HTTPServiceDomainParam,
  VerifyHttpServiceRouteCheckItem,
  VerifyHttpServiceRouteRes,
} from "@cloudbase/manager-node/types/env/type.js";

const QUERY_GATEWAY_ACTIONS = [
  "listRoutes",
  "getRoute",
  "listCustomDomains",
  "getPrivilege",
] as const;

const MANAGE_GATEWAY_ACTIONS = [
  "createRoute",
  "updateRoute",
  "deleteRoute",
  "enableRoute",
  "disableRoute",
  "bindCustomDomain",
  "deleteCustomDomain",
  "enableService",
  "authSwitch",
] as const;

/** DomainType of the environment default HTTP service (gateway) domain. */
const HTTP_SERVICE_DOMAIN_TYPE = "HTTPSERVICE";

const UPSTREAM_RESOURCE_TYPES = [
  "SCF",
  "WEB_SCF",
  "CBR",
  "STATIC_STORE",
  "LH",
] as const;

type QueryGatewayAction = (typeof QUERY_GATEWAY_ACTIONS)[number];
type ManageGatewayAction = (typeof MANAGE_GATEWAY_ACTIONS)[number];
type UpstreamResourceType = (typeof UPSTREAM_RESOURCE_TYPES)[number];

type GatewayToolEnvelope = {
  success: boolean;
  data: Record<string, unknown>;
  message: string;
  nextActions?: Array<{
    tool: string;
    action: string;
    reason: string;
  }>;
};

type QueryGatewayInput = {
  action: QueryGatewayAction;
  targetName?: string;
  routeId?: string;
  path?: string;
  domain?: string;
};

type ManageGatewayInput = {
  action: ManageGatewayAction;
  targetName?: string;
  path?: string;
  upstreamResourceType?: UpstreamResourceType;
  auth?: boolean;
  enablePathTransmission?: boolean;
  route?: {
    path?: string;
    serviceName?: string;
    upstreamResourceType?: UpstreamResourceType;
    auth?: boolean;
    enablePathTransmission?: boolean;
    /** Route-level Enable (createRoute / updateRoute). */
    enable?: boolean;
  };
  domain?: string;
  certificateId?: string;
  accessType?: "DIRECT" | "CDN" | "CUSTOM";
  customCname?: string;
  enable?: boolean;
};

/** HTTP 网关总开关与访问鉴权状态（DescribeCloudBaseGWPrivilege）。 */
type GatewayPrivilege = {
  EnableService?: boolean;
  EnableAuth?: boolean;
  [key: string]: unknown;
};

type FlatRoute = {
  Domain: string;
  DomainType?: string;
  AccessType?: string;
  IsDefault?: boolean;
  Enable?: boolean;
  Path?: string;
  UpstreamResourceType?: string;
  UpstreamResourceName?: string;
  EnableAuth?: boolean;
  RouteId?: string;
  [key: string]: unknown;
};

function normalizeAccessPath(path: string | undefined): string {
  if (!path) {
    return "/";
  }

  return path.startsWith("/") ? path : `/${path}`;
}

/** Single check item from VerifyHTTPServiceRoute. */
type VerifyHttpServiceRouteCheck = VerifyHttpServiceRouteCheckItem;

/** Response shape of env.verifyHttpServiceRoute (manager-node >= 5.8.1). */
type VerifyHttpServiceRouteResult = VerifyHttpServiceRouteRes;

type VerifyDnsRecord = {
  subdomain?: string;
  recordType?: string;
  recordValue?: string;
};

type FailedVerifyCheck = {
  name: string;
  status: string;
  code?: string;
  message?: string;
  dnsRecords?: VerifyDnsRecord[];
};

/**
 * Collect FAIL items from VerifyHTTPServiceRoute, mapping DNS records to
 * lowercase field names for MCP structured output (aligned with CLI 3.8.1).
 */
function collectFailedVerifyChecks(
  result: VerifyHttpServiceRouteResult,
): FailedVerifyCheck[] {
  const checkItems: Record<string, VerifyHttpServiceRouteCheck | undefined> = {
    ownership: result.Ownership,
    cert: result.Cert,
    quota: result.Quota,
    routeConflict: result.RouteConflict,
    domainConflict: result.DomainConflict,
    internalAccount: result.InternalAccount,
    blacklist: result.Blacklist,
    cdnResource: result.CDNResource,
    eo: result.EO,
  };

  return Object.entries(checkItems)
    .filter(([, item]) => item?.Status === "FAIL")
    .map(([name, item]) => {
      const dnsRecords = item?.OwnershipVerification?.DnsVerification?.map(
        ({ Subdomain, RecordType, RecordValue }) => ({
          subdomain: Subdomain,
          recordType: RecordType,
          recordValue: RecordValue,
        }),
      );
      return {
        name,
        status: item!.Status!,
        ...(item?.Code ? { code: item.Code } : {}),
        ...(item?.Message ? { message: item.Message } : {}),
        ...(dnsRecords?.length ? { dnsRecords } : {}),
      };
    });
}

function isDefaultHttpServiceDomain(domain: string): boolean {
  return /(^|\.)app\.tcloudbase\.com$/i.test(domain);
}

export function registerGatewayTools(server: ExtendedMcpServer) {
  const cloudBaseOptions = server.cloudBaseOptions;
  const getManager = () => getCloudBaseManager({ cloudBaseOptions });
  const resolveEnvId = () => getEnvId(cloudBaseOptions);

  const buildEnvelope = (
    data: Record<string, unknown>,
    message: string,
    nextActions?: GatewayToolEnvelope["nextActions"],
  ): GatewayToolEnvelope => ({
    success: true,
    data,
    message,
    ...(nextActions?.length ? { nextActions } : {}),
  });

  const buildErrorEnvelope = (error: unknown) => ({
    success: false,
    data: {},
    message: error instanceof Error ? error.message : String(error),
  });

  /**
   * 上游目标存在性校验（F1）。
   *
   * 背景：`createHttpServiceRoute` 不校验 `UpstreamResourceName` 是否存在，预检
   * （VerifyHTTPServiceRoute）也只查域名归属/证书/配额，因此**不存在的上游也能真实落库并
   * 返回 success**，形成悬空路由（path 被占用、指向不存在的目标）。实测两站复现。
   *
   * 设计原则：**只在能证明「不存在」时拒绝**。
   * - 列表接口报错、分页未扫全、类型不支持 → `unknown`，放行并记日志（fail-open）。
   *   校验失败绝不该阻塞用户创建合法路由。
   * - 只有扫完全量且确实没有该名称时，才返回 `missing`。
   *
   * 覆盖范围：SCF / WEB_SCF（函数列表）、CBR（云托管服务列表）。
   * NOT covered：STATIC_STORE 的 UpstreamResourceName 是静态托管**实例名/固定别名
   * staticstore**（不是 CloudApp 应用名），可靠列举要额外走 DescribeStaticStore，且该资源
   * 随托管启用必然存在、悬空风险低；LH（轻量应用服务器）无列举接口。两者一律 fail-open。
   */
  const UPSTREAM_PROBE_PAGE_SIZE = 100;
  const UPSTREAM_PROBE_MAX_PAGES = 5;
  const UPSTREAM_PROBE_CANDIDATE_LIMIT = 10;

  type UpstreamProbeResult =
    | { status: "exists" }
    | { status: "missing"; candidates: string[] }
    | { status: "unknown"; reason: string };

  const probeUpstreamResource = async (
    cloudbase: any,
    params: {
      upstreamResourceType: UpstreamResourceType;
      upstreamResourceName: string;
    },
  ): Promise<UpstreamProbeResult> => {
    const wanted = params.upstreamResourceName.trim();
    const upstreamResourceType = params.upstreamResourceType;
    try {
      if (upstreamResourceType === "SCF" || upstreamResourceType === "WEB_SCF") {
        // fail-open：老 SDK / mock 没有该 API 时不校验，绝不让「拿不到列表」变成「判定不存在」。
        if (typeof cloudbase.functions?.getFunctionList !== "function") {
          return { status: "unknown", reason: "function-list-api-unavailable" };
        }
        const names = new Set<string>();
        let scanned = 0;
        let total = Number.POSITIVE_INFINITY;
        for (let page = 0; page < UPSTREAM_PROBE_MAX_PAGES; page += 1) {
          const res = await cloudbase.functions.getFunctionList(
            UPSTREAM_PROBE_PAGE_SIZE,
            scanned,
          );
          const list: unknown[] = Array.isArray(res?.Functions) ? res.Functions : [];
          for (const item of list) {
            const name = (item as { FunctionName?: unknown } | null)?.FunctionName;
            if (typeof name === "string" && name) {
              names.add(name);
            }
          }
          scanned += list.length;
          total = typeof res?.TotalCount === "number" ? res.TotalCount : scanned;
          if (names.has(wanted) || list.length === 0 || scanned >= total) {
            break;
          }
        }
        if (names.has(wanted)) {
          return { status: "exists" };
        }
        if (scanned >= total) {
          return {
            status: "missing",
            candidates: [...names].slice(0, UPSTREAM_PROBE_CANDIDATE_LIMIT),
          };
        }
        return { status: "unknown", reason: "function-list-partially-scanned" };
      }

      if (upstreamResourceType === "CBR") {
        // fail-open：同上，`cloudrun?.list` 缺失时会短路成 undefined，若不显式拦截会被
        // 误判成「列表为空 = 目标不存在」，从而错误拒绝合法路由。
        if (typeof cloudbase.cloudrun?.list !== "function") {
          return { status: "unknown", reason: "cloudrun-list-api-unavailable" };
        }
        const names = new Set<string>();
        for (let page = 1; page <= UPSTREAM_PROBE_MAX_PAGES; page += 1) {
          const res = await cloudbase.cloudrun.list({
            pageSize: UPSTREAM_PROBE_PAGE_SIZE,
            pageNum: page,
          });
          const list: unknown[] = Array.isArray(res?.ServerList) ? res.ServerList : [];
          for (const item of list) {
            const record = item as { ServerName?: unknown; Name?: unknown } | null;
            const name = record?.ServerName ?? record?.Name;
            if (typeof name === "string" && name) {
              names.add(name);
            }
          }
          const total = typeof res?.Total === "number" ? res.Total : names.size;
          if (names.has(wanted) || list.length === 0 || names.size >= total) {
            break;
          }
        }
        if (names.has(wanted)) {
          return { status: "exists" };
        }
        return {
          status: "missing",
          candidates: [...names].slice(0, UPSTREAM_PROBE_CANDIDATE_LIMIT),
        };
      }

      // STATIC_STORE / LH：无可靠的实例列举通路，不校验（见上方说明）。
      return { status: "unknown", reason: `unsupported-upstream-type:${upstreamResourceType}` };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { status: "unknown", reason: message };
    }
  };

  /** 上游缺失时的候选列举工具，按类型给出下一步可用的只读入口。 */
  const upstreamProbeNextAction = (
    upstreamResourceType: UpstreamResourceType,
  ): { tool: string; action: string; reason: string } | null => {
    if (upstreamResourceType === "SCF" || upstreamResourceType === "WEB_SCF") {
      return {
        tool: "queryFunctions",
        action: "listFunctions",
        reason: t("gateway.create.upstreamNotFoundReason"),
      };
    }
    if (upstreamResourceType === "CBR") {
      return {
        tool: "queryCloudRun",
        action: "list",
        reason: t("gateway.create.upstreamNotFoundReason"),
      };
    }
    return null;
  };

  const verifyHttpServiceRouteOrFail = async (params: {
    envId: string;
    domainParam: HTTPServiceDomainParam;
    action: string;
    /** When true, API exceptions degrade to warn for default HTTPSERVICE domains. */
    allowDefaultDomainApiFallback?: boolean;
  }): Promise<GatewayToolEnvelope | null> => {
    const cloudbase = await getManager();
    let result: VerifyHttpServiceRouteResult;
    try {
      result = await cloudbase.env.verifyHttpServiceRoute({
        EnvId: params.envId,
        Domain: params.domainParam,
      });
    } catch (err: unknown) {
      const domain = params.domainParam.Domain;
      if (
        params.allowDefaultDomainApiFallback &&
        domain &&
        isDefaultHttpServiceDomain(domain)
      ) {
        const message = err instanceof Error ? err.message : String(err);
        server.logger?.({
          type: "errorToolCall",
          toolName: "manageGateway",
          message: `verifyHttpServiceRoute skipped for default domain ${domain}: ${message}`,
        });
        return null;
      }
      throw err;
    }

    logCloudBaseResult(server.logger, result);

    if (result.Passed !== false) {
      return null;
    }

    const checks = collectFailedVerifyChecks(result);
    const ownershipDns = checks.find((c) => c.name === "ownership")?.dnsRecords;
    const hasDns = Boolean(ownershipDns?.length);

    return {
      success: false,
      data: {
        action: params.action,
        domain: params.domainParam.Domain,
        checks,
        ...(result.RequestId ? { requestId: result.RequestId } : {}),
      },
      message: hasDns
        ? t("gateway.verify.failWithDns")
        : t("gateway.verify.fail"),
      nextActions: [
        {
          tool: "manageGateway",
          action: params.action,
          reason: hasDns
            ? t("gateway.verify.failWithDnsReason")
            : t("gateway.verify.failReason"),
        },
      ],
    };
  };

  /**
   * Resolve SSL certificate ID for bindCustomDomain.
   * Explicit certificateId wins; otherwise search by domain (single → auto, multi → guidance).
   */
  const resolveCertificateIdForBind = async (
    domain: string,
    certificateId: string | undefined,
  ): Promise<
    | { ok: true; certificateId: string }
    | { ok: false; envelope: GatewayToolEnvelope }
  > => {
    if (certificateId) {
      return { ok: true, certificateId };
    }

    const cloudbase = await getManager();
    let certificates: Array<{
      CertificateId?: string;
      Domain?: string;
      Alias?: string;
      CertEndTime?: string;
    }> = [];
    try {
      const res = await cloudbase.env.describeCertificates({
        SearchKey: domain,
      });
      certificates = res?.Certificates ?? [];
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(
        t("gateway.cert.listFailed", { message }),
      );
    }

    if (certificates.length === 0) {
      return {
        ok: false,
        envelope: {
          success: false,
          data: { action: "bindCustomDomain", domain, certificates: [] },
          message: t("gateway.cert.noneFound", { domain }),
          nextActions: [
            {
              tool: "manageGateway",
              action: "bindCustomDomain",
              reason: t("gateway.cert.noneFoundReason"),
            },
          ],
        },
      };
    }

    if (certificates.length === 1) {
      const only = certificates[0]?.CertificateId;
      if (!only) {
        throw new Error(
          t("gateway.cert.missingId", { domain }),
        );
      }
      return { ok: true, certificateId: only };
    }

    const options = certificates.map((cert) => ({
      certificateId: cert.CertificateId,
      domain: cert.Domain,
      alias: cert.Alias,
      certEndTime: cert.CertEndTime,
    }));

    return {
      ok: false,
      envelope: {
        success: false,
        data: {
          action: "bindCustomDomain",
          domain,
          certificates: options,
        },
        message: t("gateway.cert.multiSelect", { count: certificates.length }),
        nextActions: options
          .filter((c) => c.certificateId)
          .map((c) => ({
            tool: "manageGateway",
            action: "bindCustomDomain",
            reason: t("gateway.cert.multiReason", {
              certificateId: c.certificateId ?? "-",
              domain: c.domain ?? "-",
              certEndTime: c.certEndTime ?? "-",
            }),
          })),
      },
    };
  };

  const withEnvelope = async (handler: () => Promise<GatewayToolEnvelope>) => {
    try {
      return jsonContent(await handler());
    } catch (error) {
      return jsonContent(buildErrorEnvelope(error));
    }
  };

  const listHttpServiceRoutes = async (options?: {
    domain?: string;
    domainType?: string;
  }) => {
    const filters: Array<{
      Name: "Domain" | "Path" | "DomainType" | "UpstreamResourceType";
      Values: string[];
    }> = [];
    if (options?.domain) {
      filters.push({ Name: "Domain", Values: [options.domain] });
    }
    if (options?.domainType) {
      filters.push({ Name: "DomainType", Values: [options.domainType] });
    }

    const cloudbase = await getManager();
    const result = await cloudbase.env.describeHttpServiceRoute({
      EnvId: await resolveEnvId(),
      Limit: 1000,
      ...(filters.length ? { Filters: filters } : {}),
    });
    logCloudBaseResult(server.logger, result);
    return result;
  };

  const flattenRoutes = (result: {
    Domains?: Array<{
      Domain?: string;
      DomainType?: string;
      AccessType?: string;
      IsDefault?: boolean;
      Routes?: Array<object>;
    }>;
  }): FlatRoute[] =>
    (result.Domains ?? []).flatMap((domainItem) =>
      (domainItem.Routes ?? []).map((route) => ({
        Domain: domainItem.Domain ?? "",
        DomainType: domainItem.DomainType,
        AccessType: domainItem.AccessType,
        IsDefault: domainItem.IsDefault,
        ...(route as Record<string, unknown>),
      })),
    );

  const buildRouteUrls = (routes: FlatRoute[]) => {
    const candidates: GatewayRouteUrlCandidate[] = routes.map((route) => ({
      Domain: route.Domain,
      Path: route.Path,
      IsDefault: route.IsDefault,
      Enable:
        typeof route.Enable === "boolean" ? route.Enable : undefined,
      UpstreamResourceType: route.UpstreamResourceType,
      UpstreamResourceName: route.UpstreamResourceName,
    }));
    return rankGatewayAccessUrls(candidates).map((item) => item.url);
  };

  const buildAccessUrlFields = (routes: FlatRoute[]) => {
    const candidates: GatewayRouteUrlCandidate[] = routes.map((route) => ({
      Domain: route.Domain,
      Path: route.Path,
      IsDefault: route.IsDefault,
      Enable:
        typeof route.Enable === "boolean" ? route.Enable : undefined,
      UpstreamResourceType: route.UpstreamResourceType,
      UpstreamResourceName: route.UpstreamResourceName,
    }));
    const disabledAccessUrls = rankGatewayAccessUrls(candidates, {
      includeDisabled: true,
    })
      .filter((item) => !item.enabled)
      .map((item) => item.url);
    const envelope = toAccessUrlEnvelope(
      rankGatewayAccessUrls(candidates),
      disabledAccessUrls,
    );
    return {
      ...(envelope.accessUrl ? { accessUrl: envelope.accessUrl } : {}),
      accessUrls: envelope.accessUrls,
      ...(envelope.accessUrlSource
        ? { accessUrlSource: envelope.accessUrlSource }
        : {}),
      accessUrlReachable: Boolean(envelope.accessUrl),
      ...(disabledAccessUrls.length > 0
        ? { disabledAccessUrls, routeDisabled: true }
        : {}),
    };
  };

  const pickUsableDefaultDomain = (
    domains: Array<{
      Domain?: string;
      DomainType?: string;
      IsDefault?: boolean;
      Enable?: boolean;
      Status?: string;
    }>,
  ) => {
    const candidates = domains.filter(
      (item) => item.IsDefault === true && item.Domain,
    );
    return (
      candidates.find(
        (item) =>
          item.Enable !== false &&
          // Platform may return Success/success; normalize before matching.
          typeof item.Status === "string" &&
          item.Status.toLowerCase() === "success",
      ) ??
      candidates.find((item) => item.Enable !== false) ??
      candidates[0]
    );
  };

  const getGatewayPrivilege = async (): Promise<GatewayPrivilege> => {
    const cloudbase = await getManager();
    const result = await cloudbase
      .commonService("tcb", "2018-06-08")
      .call({
        Action: "DescribeCloudBaseGWPrivilege",
        Param: {
          ServiceId: await resolveEnvId(),
        },
      });
    logCloudBaseResult(server.logger, result);
    return result ?? {};
  };

  const buildPrivilegeDescription = (privilege: GatewayPrivilege) => {
    const serviceStatus =
      privilege.EnableService === undefined
        ? t("gateway.privilege.unknown")
        : privilege.EnableService === true
          ? t("gateway.privilege.on")
          : t("gateway.privilege.off");
    const authStatus =
      privilege.EnableAuth === undefined
        ? t("gateway.privilege.unknown")
        : privilege.EnableAuth === true
          ? t("gateway.privilege.on")
          : t("gateway.privilege.off");
    return t("gateway.privilege.description", { serviceStatus, authStatus });
  };

  const resolveDefaultHttpDomain = async () => {
    // Match console DescribeHTTPServiceRoute usage: filter DomainType=HTTPSERVICE.
    // Envs often also expose an IsDefault STATIC_STORE domain (*.tcloudbaseapp.com);
    // that is NOT the default HTTP access entry (*.{region}.app.tcloudbase.com).
    const httpServiceRoutes = await listHttpServiceRoutes({
      domainType: HTTP_SERVICE_DOMAIN_TYPE,
    });
    // Always re-filter client-side: some SDKs/mocks may ignore Filters.
    let preferred = pickUsableDefaultDomain(
      (httpServiceRoutes.Domains ?? []).filter(
        (item) => item.DomainType === HTTP_SERVICE_DOMAIN_TYPE,
      ),
    );

    if (!preferred?.Domain) {
      const allRoutes = await listHttpServiceRoutes();
      preferred = pickUsableDefaultDomain(
        (allRoutes.Domains ?? []).filter(
          (item) => item.DomainType === HTTP_SERVICE_DOMAIN_TYPE,
        ),
      );
    }

    if (!preferred?.Domain) {
      throw new Error(
        t("gateway.defaultDomain.notReady"),
      );
    }

    return preferred.Domain;
  };

  const resolveRouteDomain = async (preferredDomain?: string) => {
    if (preferredDomain) {
      return preferredDomain;
    }
    return resolveDefaultHttpDomain();
  };

  const resolveUpstreamResourceType = (input: {
    upstreamResourceType?: UpstreamResourceType;
    routeUpstreamResourceType?: UpstreamResourceType;
  }): UpstreamResourceType => {
    const resolved =
      input.routeUpstreamResourceType ?? input.upstreamResourceType;
    if (resolved) {
      return resolved;
    }

    throw new Error(
      t("gateway.upstreamTypeRequired"),
    );
  };

  const normalizeRoutePayload = async (
    input: ManageGatewayInput,
  ): Promise<{
    EnvId: string;
    Domain: {
      Domain: string;
      Routes: Array<{
        Path: string;
        UpstreamResourceType: UpstreamResourceType;
        UpstreamResourceName: string;
        EnableAuth?: boolean;
        EnablePathTransmission?: boolean;
        Enable?: boolean;
      }>;
    };
    resolved: {
      domain: string;
      path: string;
      upstreamResourceType: UpstreamResourceType;
      upstreamResourceName: string;
      enableAuth?: boolean;
      enablePathTransmission?: boolean;
      enable?: boolean;
    };
  }> => {
    const upstreamResourceName =
      input.route?.serviceName ?? input.targetName;
    if (!upstreamResourceName) {
      throw new Error(
        t("gateway.upstreamNameRequired"),
      );
    }

    const upstreamResourceType = resolveUpstreamResourceType({
      upstreamResourceType: input.upstreamResourceType,
      routeUpstreamResourceType: input.route?.upstreamResourceType,
    });

    const path = normalizeAccessPath(
      input.route?.path ?? input.path ?? `/${upstreamResourceName}`,
    );
    const domain = await resolveRouteDomain(input.domain);
    const enableAuth =
      input.route?.auth !== undefined
        ? input.route.auth
        : input.auth !== undefined
          ? input.auth
          : undefined;
    const enablePathTransmission =
      input.route?.enablePathTransmission !== undefined
        ? input.route.enablePathTransmission
        : input.enablePathTransmission !== undefined
          ? input.enablePathTransmission
          : undefined;
    // Route enable: prefer route.enable. For updateRoute only, top-level
    // enable also maps to Route.Enable (enableService/authSwitch use the
    // same field name but different actions).
    const routeEnable =
      input.route?.enable !== undefined
        ? input.route.enable
        : input.action === "updateRoute" &&
            typeof input.enable === "boolean"
          ? input.enable
          : undefined;

    const route: {
      Path: string;
      UpstreamResourceType: UpstreamResourceType;
      UpstreamResourceName: string;
      EnableAuth?: boolean;
      EnablePathTransmission?: boolean;
      Enable?: boolean;
    } = {
      Path: path,
      UpstreamResourceType: upstreamResourceType,
      UpstreamResourceName: upstreamResourceName,
      EnableAuth: enableAuth,
    };
    if (enablePathTransmission !== undefined) {
      route.EnablePathTransmission = enablePathTransmission;
    }
    if (routeEnable !== undefined) {
      route.Enable = routeEnable;
    }

    return {
      EnvId: await resolveEnvId(),
      Domain: {
        Domain: domain,
        Routes: [route],
      },
      resolved: {
        domain,
        path,
        upstreamResourceType,
        upstreamResourceName,
        enableAuth,
        enablePathTransmission,
        enable: routeEnable,
      },
    };
  };

  const resolveExistingRouteForToggle = async (input: {
    path?: string;
    routePath?: string;
    domain?: string;
    targetName?: string;
    routeServiceName?: string;
  }): Promise<FlatRoute> => {
    const routePath = input.routePath ?? input.path;
    if (!routePath) {
      throw new Error(
        t("gateway.toggle.pathRequired"),
      );
    }

    const normalizedPath = normalizeAccessPath(routePath);
    const preferredDomain = input.domain;
    const result = await listHttpServiceRoutes(
      preferredDomain ? { domain: preferredDomain } : undefined,
    );
    const upstreamName = input.routeServiceName ?? input.targetName;
    const matches = flattenRoutes(result).filter((item) => {
      if (
        preferredDomain &&
        item.Domain !== preferredDomain
      ) {
        return false;
      }
      if (normalizeAccessPath(String(item.Path ?? "")) !== normalizedPath) {
        return false;
      }
      if (upstreamName && item.UpstreamResourceName !== upstreamName) {
        return false;
      }
      return true;
    });

    if (matches.length === 0) {
      throw new Error(
        t("gateway.toggle.notFound", {
          path: normalizedPath,
          domainSuffix: preferredDomain
            ? t("gateway.toggle.notFoundDomainSuffix", { domain: preferredDomain })
            : "",
          upstreamSuffix: upstreamName
            ? t("gateway.toggle.notFoundUpstreamSuffix", { upstreamName })
            : "",
        }),
      );
    }

    if (matches.length > 1) {
      const domains = [...new Set(matches.map((item) => item.Domain))];
      throw new Error(
        t("gateway.toggle.ambiguous", {
          path: normalizedPath,
          count: matches.length,
          domains: domains.join(", "),
        }),
      );
    }

    return matches[0]!;
  };

  const routeMutationNextActions = (
    targetName: string,
  ): GatewayToolEnvelope["nextActions"] => [
    {
      tool: "queryGateway",
      action: "getRoute",
      reason: t("gateway.mutation.pollGetRoute"),
    },
    {
      tool: "queryPermissions",
      action: "getResourcePermission",
      reason: t("gateway.mutation.checkPermission"),
    },
    {
      tool: "managePermissions",
      action: "updateResourcePermission",
      reason: t("gateway.mutation.updatePermission"),
    },
  ];

  const handleQueryGateway = async (
    input: QueryGatewayInput,
  ): Promise<GatewayToolEnvelope> => {
    switch (input.action) {
      case "listCustomDomains": {
        const result = await listHttpServiceRoutes();
        const customDomains = (result.Domains ?? []).filter(
          (item) => item.IsDefault !== true,
        );

        return buildEnvelope(
          {
            action: input.action,
            domains: customDomains,
            total: customDomains.length,
            raw: result,
          },
          t("gateway.query.listCustomDomains", { count: customDomains.length }),
        );
      }
      case "listRoutes": {
        const result = await listHttpServiceRoutes({ domain: input.domain });
        const routes = flattenRoutes(result);

        return buildEnvelope(
          {
            action: input.action,
            routes,
            urls: buildRouteUrls(routes),
            ...buildAccessUrlFields(routes),
            total: result.TotalCount ?? routes.length,
            raw: result,
          },
          t("gateway.query.listRoutes", { count: result.TotalCount ?? routes.length }),
        );
      }
      case "getRoute": {
        if (!input.routeId && !input.targetName && !input.path) {
          throw new Error(
            t("gateway.query.getRouteRequired"),
          );
        }

        const result = await listHttpServiceRoutes({ domain: input.domain });
        const normalizedPath = input.path
          ? normalizeAccessPath(input.path)
          : undefined;
        const matches = flattenRoutes(result).filter((item) => {
          if (input.routeId && item.RouteId !== input.routeId) {
            return false;
          }
          if (input.domain && item.Domain !== input.domain) {
            return false;
          }
          if (
            normalizedPath &&
            normalizeAccessPath(String(item.Path ?? "")) !== normalizedPath
          ) {
            return false;
          }
          if (
            input.targetName &&
            item.UpstreamResourceName !== input.targetName
          ) {
            return false;
          }
          return Boolean(input.routeId || input.targetName || normalizedPath);
        });

        const route = matches.length === 1 ? matches[0] : null;
        const urls = buildRouteUrls(matches);

        return buildEnvelope(
          {
            action: input.action,
            routeId: input.routeId ?? null,
            targetName: input.targetName ?? null,
            path: normalizedPath ?? null,
            domain: input.domain ?? null,
            route,
            routes: matches,
            total: matches.length,
            urls,
            ...buildAccessUrlFields(matches),
            raw: result,
          },
          matches.length === 0
            ? t("gateway.query.getRouteNotFound")
            : matches.length === 1
              ? t("gateway.query.getRouteSingle")
              : t("gateway.query.getRouteMulti", { count: matches.length }),
          [
            {
              tool: "manageGateway",
              action: "createRoute",
              reason: t("gateway.query.getRouteCreateReason"),
            },
          ],
        );
      }
      case "getPrivilege": {
        const privilege = await getGatewayPrivilege();
        const enableService = privilege.EnableService === true;
        const enableAuth = privilege.EnableAuth === true;

        return buildEnvelope(
          {
            action: input.action,
            enableService,
            enableAuth,
            raw: privilege,
          },
          buildPrivilegeDescription(privilege) +
            (enableService ? "" : t("gateway.privilege.nonActivatedHint")),
          enableService
            ? undefined
            : [
                {
                  tool: "manageGateway",
                  action: "enableService",
                  reason: t("gateway.privilege.enableServiceReason"),
                },
              ],
        );
      }
      default:
        throw new Error(t("gateway.error.unsupportedAction", { action: input.action }));
    }
  };

  const handleManageGateway = async (
    input: ManageGatewayInput,
  ): Promise<GatewayToolEnvelope> => {
    switch (input.action) {
      case "createRoute": {
        const cloudbase = await getManager();
        const payload = await normalizeRoutePayload(input);

        // 上游目标存在性校验（F1）：平台侧不校验 UpstreamResourceName，不存在的目标也会
        // 真实落库形成悬空路由并返回 success。能证明不存在就拒绝，校验不了就放行（fail-open）。
        const upstreamProbe = await probeUpstreamResource(cloudbase, {
          upstreamResourceType: payload.resolved.upstreamResourceType,
          upstreamResourceName: payload.resolved.upstreamResourceName,
        });
        if (upstreamProbe.status === "missing") {
          const nextAction = upstreamProbeNextAction(payload.resolved.upstreamResourceType);
          return {
            success: false,
            data: {
              action: "createRoute",
              upstreamResourceType: payload.resolved.upstreamResourceType,
              targetName: payload.resolved.upstreamResourceName,
              path: payload.resolved.path,
              candidates: upstreamProbe.candidates,
              ...(upstreamProbe.candidates.length
                ? {
                    candidateHint: t("gateway.create.upstreamCandidates", {
                      type: payload.resolved.upstreamResourceType,
                      candidates: upstreamProbe.candidates.join("、"),
                    }),
                  }
                : {}),
            },
            message: t("gateway.create.upstreamNotFound", {
              type: payload.resolved.upstreamResourceType,
              name: payload.resolved.upstreamResourceName,
            }),
            ...(nextAction ? { nextActions: [nextAction] } : {}),
          };
        }
        if (upstreamProbe.status === "unknown") {
          // 校验不了不阻塞创建，但要留痕，便于排查「为什么这次没拦住」。
          server.logger?.({
            type: "errorToolCall",
            toolName: "manageGateway",
            message: `createRoute upstream probe skipped (${payload.resolved.upstreamResourceType}/${payload.resolved.upstreamResourceName}): ${upstreamProbe.reason}`,
          });
        }

        // Probe → create: ownership / cert / quota / conflict checks before create.
        const verifyFailure = await verifyHttpServiceRouteOrFail({
          envId: payload.EnvId,
          domainParam: payload.Domain,
          action: "createRoute",
          allowDefaultDomainApiFallback: true,
        });
        if (verifyFailure) {
          return verifyFailure;
        }

        let result;
        try {
          result = await cloudbase.env.createHttpServiceRoute({
            EnvId: payload.EnvId,
            Domain: payload.Domain,
          } as any);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          if (message.includes("An error has occurred")) {
            let hint = t("gateway.create.backendError");
            if (
              payload.resolved.upstreamResourceType === "WEB_SCF" ||
              payload.resolved.upstreamResourceType === "SCF"
            ) {
              hint += t("gateway.create.backendErrorScfHint");
            }
            throw new Error(`${hint}${t("gateway.create.backendErrorSuffix", { message })}`);
          }
          throw err;
        }
        logCloudBaseResult(server.logger, result);

        // 探测 HTTP 网关总开关：未开启时提示 HTTPSERVICE_NONACTIVATED 风险并引导开启。
        // 探测失败不阻断路由创建结果，仅追加弱提示。
        let privilegeHint = "";
        let privilegeNextActions: NonNullable<
          GatewayToolEnvelope["nextActions"]
        > = [];
        try {
          const privilege = await getGatewayPrivilege();
          if (privilege.EnableService !== true) {
            privilegeHint = t("gateway.create.privilegeOffHint");
            privilegeNextActions = [
              {
                tool: "manageGateway",
                action: "enableService",
                reason: t("gateway.create.privilegeOffReason"),
              },
            ];
          }
        } catch {
          privilegeHint = t("gateway.create.privilegeUnknownHint");
        }

        return buildEnvelope(
          {
            action: input.action,
            model: "httpServiceRoute",
            targetName: payload.resolved.upstreamResourceName,
            domain: payload.resolved.domain,
            path: payload.resolved.path,
            upstreamResourceType: payload.resolved.upstreamResourceType,
            upstreamResourceName: payload.resolved.upstreamResourceName,
            auth: payload.resolved.enableAuth ?? null,
            enablePathTransmission:
              payload.resolved.enablePathTransmission ?? null,
            accessUrl: `https://${payload.resolved.domain}${payload.resolved.path}`,
            accessUrls: [`https://${payload.resolved.domain}${payload.resolved.path}`],
            accessUrlSource:
              input.domain && input.domain === payload.resolved.domain
                ? "gateway.custom"
                : "gateway.default",
            raw: result,
          },
          t("gateway.create.message", {
            upstreamResourceName: payload.resolved.upstreamResourceName,
            domain: payload.resolved.domain,
            path: payload.resolved.path,
            upstreamResourceType: payload.resolved.upstreamResourceType,
          }) +
            (payload.resolved.enablePathTransmission === true
              ? t("gateway.create.pathTransmissionOn")
              : payload.resolved.enablePathTransmission === false
                ? t("gateway.create.pathTransmissionOff")
                : t("gateway.create.pathTransmissionUnset")) +
            t("gateway.create.messageTail") +
            (privilegeHint ? ` ${privilegeHint}` : ""),
          [
            ...privilegeNextActions,
            ...(routeMutationNextActions(payload.resolved.upstreamResourceName) ??
              []),
          ],
        );
      }
      case "updateRoute": {
        const cloudbase = await getManager();
        const payload = await normalizeRoutePayload(input);
        const result = await cloudbase.env.modifyHttpServiceRoute({
          EnvId: payload.EnvId,
          Domain: payload.Domain,
        } as any);
        logCloudBaseResult(server.logger, result);
        const routeEnabled = payload.resolved.enable !== false;
        const accessUrl = routeEnabled
          ? `https://${payload.resolved.domain}${payload.resolved.path}`
          : undefined;

        return buildEnvelope(
          {
            action: input.action,
            model: "httpServiceRoute",
            domain: payload.resolved.domain,
            path: payload.resolved.path,
            upstreamResourceType: payload.resolved.upstreamResourceType,
            upstreamResourceName: payload.resolved.upstreamResourceName,
            auth: payload.resolved.enableAuth ?? null,
            enablePathTransmission:
              payload.resolved.enablePathTransmission ?? null,
            enable: payload.resolved.enable ?? null,
            ...(accessUrl
              ? {
                  accessUrl,
                  accessUrls: [accessUrl],
                  accessUrlReachable: true,
                }
              : {
                  accessUrls: [],
                  accessUrlReachable: false,
                  routeDisabled: true,
                  disabledAccessUrls: [
                    `https://${payload.resolved.domain}${payload.resolved.path}`,
                  ],
                }),
            accessUrlSource:
              input.domain && input.domain === payload.resolved.domain
                ? "gateway.custom"
                : "gateway.default",
            raw: result,
          },
          t("gateway.update.message", {
            domain: payload.resolved.domain,
            path: payload.resolved.path,
          }) +
            (payload.resolved.enable === false
              ? t("gateway.update.enableOff")
              : payload.resolved.enable === true
                ? t("gateway.update.enableOn")
                : "") +
            (payload.resolved.enablePathTransmission === true
              ? t("gateway.update.transmissionOn")
              : payload.resolved.enablePathTransmission === false
                ? t("gateway.update.transmissionOff")
                : "") +
            t("gateway.update.messageEnd"),
          routeMutationNextActions(payload.resolved.upstreamResourceName),
        );
      }
      case "enableRoute":
      case "disableRoute": {
        const enable = input.action === "enableRoute";
        const existing = await resolveExistingRouteForToggle({
          path: input.path,
          routePath: input.route?.path,
          domain: input.domain,
          targetName: input.targetName,
          routeServiceName: input.route?.serviceName,
        });

        const upstreamResourceType = resolveUpstreamResourceType({
          upstreamResourceType:
            input.upstreamResourceType ??
            (existing.UpstreamResourceType as UpstreamResourceType | undefined),
          routeUpstreamResourceType: input.route?.upstreamResourceType,
        });
        const upstreamResourceName =
          input.route?.serviceName ??
          input.targetName ??
          String(existing.UpstreamResourceName ?? "");
        if (!upstreamResourceName) {
          throw new Error(
            t("gateway.toggle.upstreamNameRequired", { action: input.action }),
          );
        }

        const normalizedPath = normalizeAccessPath(
          String(existing.Path ?? input.route?.path ?? input.path ?? "/"),
        );
        const domain = existing.Domain;
        const enableAuth =
          input.route?.auth !== undefined
            ? input.route.auth
            : input.auth !== undefined
              ? input.auth
              : (existing.EnableAuth as boolean | undefined);
        const enablePathTransmission =
          input.route?.enablePathTransmission !== undefined
            ? input.route.enablePathTransmission
            : input.enablePathTransmission !== undefined
              ? input.enablePathTransmission
              : (existing.EnablePathTransmission as boolean | undefined);

        const route: {
          Path: string;
          UpstreamResourceType: UpstreamResourceType;
          UpstreamResourceName: string;
          Enable: boolean;
          EnableAuth?: boolean;
          EnablePathTransmission?: boolean;
        } = {
          Path: normalizedPath,
          UpstreamResourceType: upstreamResourceType,
          UpstreamResourceName: upstreamResourceName,
          Enable: enable,
        };
        if (enableAuth !== undefined) {
          route.EnableAuth = enableAuth;
        }
        if (enablePathTransmission !== undefined) {
          route.EnablePathTransmission = enablePathTransmission;
        }

        const cloudbase = await getManager();
        const result = await cloudbase.env.modifyHttpServiceRoute({
          EnvId: await resolveEnvId(),
          Domain: {
            Domain: domain,
            Routes: [route],
          },
        } as any);
        logCloudBaseResult(server.logger, result);

        const verb = enable
          ? t("gateway.toggle.verbEnable")
          : t("gateway.toggle.verbDisable");
        const accessUrl = enable
          ? `https://${domain}${normalizedPath}`
          : undefined;
        return buildEnvelope(
          {
            action: input.action,
            model: "httpServiceRoute",
            domain,
            path: normalizedPath,
            upstreamResourceType,
            upstreamResourceName,
            enable,
            auth: enableAuth ?? null,
            enablePathTransmission: enablePathTransmission ?? null,
            ...(accessUrl
              ? {
                  accessUrl,
                  accessUrls: [accessUrl],
                  accessUrlReachable: true,
                }
              : {
                  accessUrls: [],
                  accessUrlReachable: false,
                  routeDisabled: true,
                  disabledAccessUrls: [`https://${domain}${normalizedPath}`],
                }),
            accessUrlSource: existing.IsDefault
              ? "gateway.default"
              : "gateway.custom",
            raw: result,
          },
          t("gateway.toggle.title", { verb, domain, path: normalizedPath, enable: String(enable) }) +
            (enable
              ? t("gateway.toggle.enabledTail")
              : t("gateway.toggle.disabledTail")) +
            t("gateway.toggle.messageEnd"),
          [
            {
              tool: "queryGateway",
              action: "getRoute",
              reason: t("gateway.toggle.verifyReason", { enable: String(enable) }),
            },
          ],
        );
      }
      case "deleteRoute": {
        const routePath = input.route?.path ?? input.path;
        if (!routePath) {
          throw new Error(t("gateway.deleteRoute.pathRequired"));
        }
        const cloudbase = await getManager();
        const domain = await resolveRouteDomain(input.domain);
        const normalizedPath = normalizeAccessPath(routePath);
        const result = await cloudbase.env.deleteHttpServiceRoute({
          EnvId: await resolveEnvId(),
          Domain: domain,
          Paths: [normalizedPath],
        } as any);
        logCloudBaseResult(server.logger, result);

        return buildEnvelope(
          {
            action: input.action,
            model: "httpServiceRoute",
            domain,
            path: normalizedPath,
            raw: result,
          },
          t("gateway.deleteRoute.message"),
        );
      }
      case "bindCustomDomain": {
        if (!input.domain) {
          throw new Error(t("gateway.bind.domainRequired"));
        }
        const accessType = input.accessType ?? "DIRECT";
        if (accessType === "CUSTOM" && !input.customCname) {
          throw new Error(
            t("gateway.bind.customCnameRequired"),
          );
        }
        if (accessType !== "CUSTOM" && input.customCname) {
          throw new Error(
            t("gateway.bind.customCnameNotAllowed"),
          );
        }

        const envId = await resolveEnvId();
        const cloudbase = await getManager();

        // Align CLI 3.8.1: verify before certificate resolution / bind.
        const verifyDomainParam: HTTPServiceDomainParam = {
          Domain: input.domain,
          CertId: input.certificateId || "",
          AccessType: accessType,
          Enable: input.enable !== undefined ? input.enable : true,
          ...(input.customCname ? { CustomCname: input.customCname } : {}),
        };
        const verifyFailure = await verifyHttpServiceRouteOrFail({
          envId,
          domainParam: verifyDomainParam,
          action: "bindCustomDomain",
        });
        if (verifyFailure) {
          return verifyFailure;
        }

        const certResolved = await resolveCertificateIdForBind(
          input.domain,
          input.certificateId,
        );
        if (!certResolved.ok) {
          return certResolved.envelope;
        }
        const certificateId = certResolved.certificateId;

        const result = await cloudbase.env.bindCustomDomain({
          EnvId: envId,
          Domain: {
            Domain: input.domain,
            CertId: certificateId,
            AccessType: accessType,
            ...(input.enable !== undefined
              ? { Enable: input.enable }
              : {}),
            ...(input.customCname
              ? { CustomCname: input.customCname }
              : {}),
          },
        } as any);
        logCloudBaseResult(server.logger, result);

        return buildEnvelope(
          {
            action: input.action,
            domain: input.domain,
            certificateId,
            accessType,
            ...(input.customCname
              ? { customCname: input.customCname }
              : {}),
            ...(input.enable !== undefined
              ? { enable: input.enable }
              : {}),
            raw: result,
          },
          t("gateway.bind.message", { accessType }),
          [
            {
              tool: "manageGateway",
              action: "createRoute",
              reason: t("gateway.bind.createRouteReason"),
            },
          ],
        );
      }
      case "deleteCustomDomain": {
        if (!input.domain) {
          throw new Error(t("gateway.deleteCustomDomain.domainRequired"));
        }
        const cloudbase = await getManager();
        try {
          const result = await cloudbase.env.deleteCustomDomain({
            EnvId: await resolveEnvId(),
            Domain: input.domain,
          });
          logCloudBaseResult(server.logger, result);

          return buildEnvelope(
            {
              action: input.action,
              domain: input.domain,
              raw: result,
            },
            t("gateway.deleteCustomDomain.message"),
          );
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          // SDK 在域名下仍有路由绑定时抛错，需先删路由再删域名
          if (/route binding/i.test(message)) {
            return {
              success: false,
              data: { action: input.action, domain: input.domain },
              message: t("gateway.deleteCustomDomain.routeBinding", {
                domain: input.domain,
                message,
              }),
              nextActions: [
                {
                  tool: "queryGateway",
                  action: "listRoutes",
                  reason: t("gateway.deleteCustomDomain.listRoutesReason"),
                },
                {
                  tool: "manageGateway",
                  action: "deleteRoute",
                  reason: t("gateway.deleteCustomDomain.deleteRoutesReason"),
                },
              ],
            };
          }
          throw error;
        }
      }
      case "enableService": {
        if (typeof input.enable !== "boolean") {
          throw new Error(t("gateway.enableService.enableRequired"));
        }
        const cloudbase = await getManager();
        const result = await cloudbase.access.switchAuth(input.enable);
        logCloudBaseResult(server.logger, result);

        return buildEnvelope(
          {
            action: input.action,
            enable: input.enable,
            raw: result,
          },
          input.enable
            ? t("gateway.enableService.onMessage")
            : t("gateway.enableService.offMessage"),
          [
            {
              tool: "queryGateway",
              action: "getPrivilege",
              reason: t("gateway.enableService.verifyReason"),
            },
          ],
        );
      }
      case "authSwitch": {
        if (typeof input.enable !== "boolean") {
          throw new Error(t("gateway.authSwitch.enableRequired"));
        }
        const cloudbase = await getManager();
        const result = await cloudbase
          .commonService("tcb", "2018-06-08")
          .call({
            Action: "ModifyCloudBaseGWPrivilege",
            Param: {
              ServiceId: await resolveEnvId(),
              EnableService: input.enable,
              Options: [
                {
                  Key: "authswitch",
                  Value: input.enable ? "true" : "false",
                },
              ],
            },
          });
        logCloudBaseResult(server.logger, result);

        return buildEnvelope(
          {
            action: input.action,
            enable: input.enable,
            raw: result,
          },
          input.enable
            ? t("gateway.authSwitch.onMessage")
            : t("gateway.authSwitch.offMessage"),
          [
            {
              tool: "queryGateway",
              action: "getPrivilege",
              reason: t("gateway.authSwitch.verifyReason"),
            },
          ],
        );
      }
      default:
        throw new Error(t("gateway.error.unsupportedAction", { action: input.action }));
    }
  };

  server.registerTool?.(
    "queryGateway",
    {
      title: "gateway.query.title",
      description: "gateway.query.description",
      inputSchema: {
        action: z
          .enum(QUERY_GATEWAY_ACTIONS)
          .describe("gateway.schema.query.action"),
        targetName: z
          .string()
          .optional()
          .describe("gateway.schema.query.targetName"),
        routeId: z.string().optional().describe("gateway.schema.query.routeId"),
        path: z.string().optional().describe("gateway.schema.query.path"),
        domain: z.string().optional().describe("gateway.schema.query.domain"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
        category: "gateway",
      },
    },
    async (input: QueryGatewayInput) =>
      withEnvelope(() => handleQueryGateway(input)),
  );

  server.registerTool?.(
    "manageGateway",
    {
      title: "gateway.manage.title",
      description: "gateway.manage.description",
      inputSchema: {
        action: z
          .enum(MANAGE_GATEWAY_ACTIONS)
          .describe("gateway.schema.manage.action"),
        targetName: z
          .string()
          .optional()
          .describe("gateway.schema.manage.targetName"),
        path: z.string().optional().describe("gateway.schema.manage.path"),
        upstreamResourceType: z
          .enum(UPSTREAM_RESOURCE_TYPES)
          .optional()
          .describe("gateway.schema.manage.upstreamResourceType"),
        auth: z.boolean().optional().describe("gateway.schema.manage.auth"),
        enablePathTransmission: z
          .boolean()
          .optional()
          .describe("gateway.schema.manage.enablePathTransmission"),
        route: z
          .object({
            path: z.string().optional(),
            serviceName: z
              .string()
              .optional()
              .describe("gateway.schema.manage.route.serviceName"),
            upstreamResourceType: z
              .enum(UPSTREAM_RESOURCE_TYPES)
              .optional()
              .describe("gateway.schema.manage.route.upstreamResourceType"),
            auth: z.boolean().optional(),
            enablePathTransmission: z
              .boolean()
              .optional()
              .describe("gateway.schema.manage.route.enablePathTransmission"),
            enable: z
              .boolean()
              .optional()
              .describe("gateway.schema.manage.route.enable"),
          })
          .optional()
          .describe("gateway.schema.manage.route"),
        domain: z.string().optional().describe("gateway.schema.manage.domain"),
        certificateId: z
          .string()
          .optional()
          .describe("gateway.schema.manage.certificateId"),
        accessType: z
          .enum(["DIRECT", "CDN", "CUSTOM"])
          .optional()
          .describe("gateway.schema.manage.accessType"),
        customCname: z
          .string()
          .optional()
          .describe("gateway.schema.manage.customCname"),
        enable: z.boolean().optional().describe("gateway.schema.manage.enable"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
        category: "gateway",
      },
    },
    async (input: ManageGatewayInput) =>
      withEnvelope(() => handleManageGateway(input)),
  );
}
