import { z } from "zod";
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
        ? "HTTP 服务域名配置预检未通过：域名归属权校验失败。请按 data.checks 中 ownership.dnsRecords 配置 DNS TXT 记录后重试。"
        : "HTTP 服务域名配置预检未通过。请根据 data.checks 修复问题后重试。",
      nextActions: [
        {
          tool: "manageGateway",
          action: params.action,
          reason: hasDns
            ? "配置 DNS TXT（主机记录/记录类型/记录值见 data.checks[].dnsRecords）后重新调用本 action"
            : "根据 data.checks 修复预检失败项后重新调用本 action",
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
        `获取 SSL 证书列表失败：${message}。请传入 certificateId，或确认账号有 SSL 证书服务权限。`,
      );
    }

    if (certificates.length === 0) {
      return {
        ok: false,
        envelope: {
          success: false,
          data: { action: "bindCustomDomain", domain, certificates: [] },
          message: `未找到域名 [${domain}] 相关的可用 SSL 证书。请在腾讯云 SSL 证书控制台上传/申请后传入 certificateId 重试。`,
          nextActions: [
            {
              tool: "manageGateway",
              action: "bindCustomDomain",
              reason:
                "上传或申请匹配该域名的证书后，传入 certificateId 再调用 bindCustomDomain",
            },
          ],
        },
      };
    }

    if (certificates.length === 1) {
      const only = certificates[0]?.CertificateId;
      if (!only) {
        throw new Error(
          `域名 [${domain}] 匹配到证书但缺少 CertificateId，请显式传入 certificateId。`,
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
        message: `找到 ${certificates.length} 个匹配证书，请选择其中一个 certificateId 后重试 bindCustomDomain（MCP 非交互，不会自动选择）。`,
        nextActions: options
          .filter((c) => c.certificateId)
          .map((c) => ({
            tool: "manageGateway",
            action: "bindCustomDomain",
            reason: `使用 certificateId=${c.certificateId}（domain=${c.domain ?? "-"}, 到期=${c.certEndTime ?? "-"}）重试`,
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
        ? "未知"
        : privilege.EnableService === true
          ? "已开启"
          : "未开启";
    const authStatus =
      privilege.EnableAuth === undefined
        ? "未知"
        : privilege.EnableAuth === true
          ? "已开启"
          : "未开启";
    return `HTTP 网关${serviceStatus}，访问鉴权${authStatus}`;
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
        "环境默认 HTTP 访问域名未就绪或未开通。请先在控制台开通 HTTP 访问服务，或用 queryGateway(action=\"listRoutes\") 确认 Domains 中是否存在 DomainType=HTTPSERVICE 且 IsDefault=true 的域名（形如 *.{region}.app.tcloudbase.com）；不要使用静态托管域名（*.tcloudbaseapp.com）。也可以显式传入 domain 后重试 createRoute/updateRoute/deleteRoute。",
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
      "必须提供 upstreamResourceType（或 route.upstreamResourceType）：" +
        "WEB_SCF=HTTP云函数，SCF=Event云函数，CBR=云托管，STATIC_STORE=静态托管，LH=轻量应用服务器。" +
        "禁止仅凭 targetName/serviceName 推断上游类型。",
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
        "必须提供 targetName 或 route.serviceName 作为上游资源名称：" +
          "云函数名、云托管服务名，或静态托管实例名（常见为 staticstore）。",
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
        "action=enableRoute/disableRoute 时必须提供 path 或 route.path（例如 \"/\" 或 \"/api\"）",
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
        `未找到路径 ${normalizedPath} 的路由` +
          (preferredDomain ? `（域名 ${preferredDomain}）` : "") +
          (upstreamName ? `（上游 ${upstreamName}）` : "") +
          "。请先用 queryGateway(action=\"listRoutes\") 确认 Domain / Path，再调用 enableRoute/disableRoute。" +
          "关闭静态托管默认域名（*.tcloudbaseapp.com）时，请显式传 domain=该 STATIC_STORE IsDefault 域名，并通常 path=\"/\"。",
      );
    }

    if (matches.length > 1) {
      const domains = [...new Set(matches.map((item) => item.Domain))];
      throw new Error(
        `路径 ${normalizedPath} 匹配到 ${matches.length} 条路由（域名：${domains.join(", ")}）。` +
          "请补充 domain（必要时再加 targetName/route.serviceName）精确定位后再 enableRoute/disableRoute。",
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
      reason:
        "创建后通常数秒到约 30 秒内生效；请立刻轮询 getRoute 或探测 accessUrl，勿盲等 60 秒以上",
    },
    {
      tool: "queryPermissions",
      action: "getResourcePermission",
      reason:
        "确认函数安全规则是否允许预期访问方；网关 EnableAuth/auth=false 不等于函数已允许匿名访问",
    },
    {
      tool: "managePermissions",
      action: "updateResourcePermission",
      reason:
        "只有在确认需要匿名或浏览器直连访问时，才按实际安全要求更新函数权限",
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
          `已获取 ${customDomains.length} 个自定义域名`,
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
          `已获取 ${result.TotalCount ?? routes.length} 条 HTTP 路由`,
        );
      }
      case "getRoute": {
        if (!input.routeId && !input.targetName && !input.path) {
          throw new Error(
            "action=getRoute 时至少需要提供 routeId、targetName 或 path",
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
            ? "未找到对应路由"
            : matches.length === 1
              ? "已获取路由详情"
              : `匹配到 ${matches.length} 条路由，请补充 path 或 domain 精确定位`,
          [
            {
              tool: "manageGateway",
              action: "createRoute",
              reason: "为该目标新增 Domain/Route 访问路径",
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
            (enableService
              ? ""
              : "；若路由创建成功但访问报 HTTPSERVICE_NONACTIVATED（403），请先开启 HTTP 网关"),
          enableService
            ? undefined
            : [
                {
                  tool: "manageGateway",
                  action: "enableService",
                  reason:
                    "开启 HTTP 网关总开关（EnableService），开启后路由即可通过默认域访问",
                },
              ],
        );
      }
      default:
        throw new Error(`不支持的操作类型: ${input.action}`);
    }
  };

  const handleManageGateway = async (
    input: ManageGatewayInput,
  ): Promise<GatewayToolEnvelope> => {
    switch (input.action) {
      case "createRoute": {
        const cloudbase = await getManager();
        const payload = await normalizeRoutePayload(input);

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
            let hint =
              "为目标资源配置访问路由失败（后端内部错误）。请确保：1) 目标云函数已成功创建并处于 Active 状态；2) 环境默认 HTTP 域名已完成初始化（IsDefault）；3) 该访问路径未被占用。";
            if (
              payload.resolved.upstreamResourceType === "WEB_SCF" ||
              payload.resolved.upstreamResourceType === "SCF"
            ) {
              hint +=
                "此外注意：HTTP 云函数必须用 upstreamResourceType=WEB_SCF，Event 云函数必须用 SCF；互标会导致此错误。";
            }
            throw new Error(`${hint} 原始错误：${message}`);
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
            privilegeHint =
              "⚠️ HTTP 网关总开关未开启，路由创建成功后访问仍将返回 HTTPSERVICE_NONACTIVATED（403）；请先调用 manageGateway(action=\"enableService\", enable=true) 开启，再立刻探测 accessUrl（通常数秒到约 30 秒内生效，勿盲等 60 秒以上）。";
            privilegeNextActions = [
              {
                tool: "manageGateway",
                action: "enableService",
                reason:
                  "开启 HTTP 网关总开关（EnableService），否则访问路由会报 HTTPSERVICE_NONACTIVATED（403）",
              },
            ];
          }
        } catch {
          privilegeHint =
            "（无法确认 HTTP 网关开关状态；若访问报 HTTPSERVICE_NONACTIVATED，请用 queryGateway(action=\"getPrivilege\") 查询后用 manageGateway(action=\"enableService\") 开启）";
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
          `已为目标 ${payload.resolved.upstreamResourceName} 在域名 ${payload.resolved.domain} 创建路由 ${payload.resolved.path}（${payload.resolved.upstreamResourceType}）` +
            (payload.resolved.enablePathTransmission === true
              ? "；已开启路径透传（后端收到完整请求路径）"
              : payload.resolved.enablePathTransmission === false
                ? "；路径透传关闭（网关会剥掉触发路径前缀后再转发给后端）"
                : "；路径透传未显式设置（平台默认 false，会剥掉触发路径前缀）") +
            `。注意：路由配置传播通常数秒到约 30 秒；请立刻用 queryGateway(getRoute) 或探测 accessUrl 确认，勿盲等 60 秒以上。该操作只创建网关入口，不会自动放开上游权限；若上游是云函数且需要匿名或浏览器直接访问，请继续检查函数资源权限。` +
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
          `HTTP 路由更新成功（${payload.resolved.domain}${payload.resolved.path}` +
            (payload.resolved.enable === false
              ? "，路由已禁用 Enable=false"
              : payload.resolved.enable === true
                ? "，路由已启用 Enable=true"
                : "") +
            (payload.resolved.enablePathTransmission === true
              ? "，路径透传=开启"
              : payload.resolved.enablePathTransmission === false
                ? "，路径透传=关闭"
                : "") +
            `）`,
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
            `action=${input.action} 无法解析上游资源名；请用 queryGateway(listRoutes) 确认后传入 targetName 或 route.serviceName。`,
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

        const verb = enable ? "启用" : "禁用";
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
          `HTTP 路由已${verb}（${domain}${normalizedPath}，Enable=${enable}）。` +
            (enable
              ? "启用后通常数秒到约 30 秒内可访问；请用 queryGateway(getRoute) 或探测 accessUrl 确认。"
              : "禁用后该路径将不可公网访问（GATEWAY_ROUTE_DISABLED）；关闭静态托管默认域名（*.tcloudbaseapp.com）时，请确认 DomainType=STATIC_STORE 且 IsDefault=true。") +
            " 底层对应 tcb ModifyHTTPServiceRoute（不是 ModifyGatewayRoute）。",
          [
            {
              tool: "queryGateway",
              action: "getRoute",
              reason: `复核路由 Enable=${enable} 是否已生效`,
            },
          ],
        );
      }
      case "deleteRoute": {
        const routePath = input.route?.path ?? input.path;
        if (!routePath) {
          throw new Error("action=deleteRoute 时必须提供 route.path 或 path");
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
          "HTTP 路由删除成功",
        );
      }
      case "bindCustomDomain": {
        if (!input.domain) {
          throw new Error("action=bindCustomDomain 时必须提供 domain");
        }
        const accessType = input.accessType ?? "DIRECT";
        if (accessType === "CUSTOM" && !input.customCname) {
          throw new Error(
            "action=bindCustomDomain 且 accessType=CUSTOM 时必须提供 customCname（自有 CDN/WAF 的回源/回填地址，不是 DNS 解析目标）。" +
              "说明：https://docs.cloudbase.net/service/custom-domain",
          );
        }
        if (accessType !== "CUSTOM" && input.customCname) {
          throw new Error(
            "customCname 仅在 accessType=CUSTOM 时可用；普通绑定用默认 DIRECT，不要传 customCname。" +
              "说明：https://docs.cloudbase.net/service/custom-domain",
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
          `自定义域名绑定成功（${accessType}）`,
          [
            {
              tool: "manageGateway",
              action: "createRoute",
              reason:
                "绑定后需 createRoute 添加访问路径，并完成 DNS CNAME 解析后才可访问",
            },
          ],
        );
      }
      case "deleteCustomDomain": {
        if (!input.domain) {
          throw new Error("action=deleteCustomDomain 时必须提供 domain");
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
            "自定义域名删除成功",
          );
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          // SDK 在域名下仍有路由绑定时抛错，需先删路由再删域名
          if (/route binding/i.test(message)) {
            return {
              success: false,
              data: { action: input.action, domain: input.domain },
              message:
                `域名 ${input.domain} 下仍有路由绑定，需先删除路由再删除域名。` +
                `原始错误：${message}`,
              nextActions: [
                {
                  tool: "queryGateway",
                  action: "listRoutes",
                  reason: "查看该域名下的路由，确认需要删除的路径",
                },
                {
                  tool: "manageGateway",
                  action: "deleteRoute",
                  reason:
                    "先删除该域名下的全部路由（逐个 deleteRoute），再重试 deleteCustomDomain",
                },
              ],
            };
          }
          throw error;
        }
      }
      case "enableService": {
        if (typeof input.enable !== "boolean") {
          throw new Error(
            'action=enableService 时必须提供 enable 参数（boolean），如 enable=true 开启 HTTP 网关总开关、enable=false 关闭；禁止省略或传非布尔值。',
          );
        }
        const cloudbase = await getManager();
        const result = await cloudbase.access.switchAuth(input.enable);
        logCloudBaseResult(server.logger, result);

        const serviceText = input.enable ? "开启" : "关闭";
        return buildEnvelope(
          {
            action: input.action,
            enable: input.enable,
            raw: result,
          },
          `HTTP 网关总开关${serviceText}成功`,
          [
            {
              tool: "queryGateway",
              action: "getPrivilege",
              reason: "复核 HTTP 网关总开关与访问鉴权状态",
            },
          ],
        );
      }
      case "authSwitch": {
        if (typeof input.enable !== "boolean") {
          throw new Error(
            'action=authSwitch 时必须提供 enable 参数（boolean），如 enable=true 开启访问鉴权、enable=false 关闭；禁止省略或传非布尔值。',
          );
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

        const serviceText = input.enable ? "开启" : "关闭";
        return buildEnvelope(
          {
            action: input.action,
            enable: input.enable,
            raw: result,
          },
          `HTTP 访问服务鉴权${serviceText}成功`,
          [
            {
              tool: "queryGateway",
              action: "getPrivilege",
              reason: "复核 HTTP 网关总开关与访问鉴权状态",
            },
          ],
        );
      }
      default:
        throw new Error(`不支持的操作类型: ${input.action}`);
    }
  };

  server.registerTool?.(
    "queryGateway",
    {
      title: "查询 CloudBase 网关",
      description:
        "CloudBase HTTP 网关统一只读入口（Domain/Route）。查询域名下路径路由及其上游：" +
        "WEB_SCF/SCF=云函数，CBR=云托管，STATIC_STORE=静态托管，LH=轻量应用服务器。" +
        "主键为 Domain + Path；listRoutes / getRoute / listCustomDomains / getPrivilege。" +
        "getPrivilege 查询 HTTP 网关总开关（enableService）与访问鉴权（enableAuth）状态。" +
        "实现自定义域名访问前，先 listCustomDomains：若已有自定义域名，优先 createRoute 挂路由（无需证书 ID）；仅在没有可用自定义域名时才 bindCustomDomain。",
      inputSchema: {
        action: z
          .enum(QUERY_GATEWAY_ACTIONS)
          .describe(
            "只读操作类型：listRoutes、getRoute、listCustomDomains、getPrivilege。" +
              "getPrivilege 无需其他参数，直接返回 HTTP 网关总开关与访问鉴权状态。" +
              "自定义域名访问场景先 listCustomDomains 确认是否已有域名可复用。",
          ),
        targetName: z
          .string()
          .optional()
          .describe(
            "上游资源名过滤（UpstreamResourceName）：云函数名、云托管服务名，或静态托管实例名（常见 staticstore）。",
          ),
        routeId: z.string().optional().describe("路由 ID。getRoute 时可选"),
        path: z
          .string()
          .optional()
          .describe("路由路径。getRoute / listRoutes 过滤时可选"),
        domain: z
          .string()
          .optional()
          .describe("域名。getRoute / listRoutes 过滤时可选"),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
        category: "gateway",
      },
    },
    async (input: QueryGatewayInput) =>
      withEnvelope(() => handleQueryGateway(input)),
  );

  server.registerTool?.(
    "manageGateway",
    {
      title: "管理 CloudBase 网关",
      description:
        "CloudBase HTTP 网关统一写入口（Domain/Route）。createRoute/updateRoute/deleteRoute 把域名下的 path 转到上游；" +
        "enableRoute/disableRoute 启用或禁用已有路由（底层 ModifyHTTPServiceRoute 的 Routes[].Enable，不是 ModifyGatewayRoute）。" +
        "未传 domain 时用 DomainType=HTTPSERVICE 的 IsDefault 默认 HTTP 域名（形如 *.{region}.app.tcloudbase.com），不会使用静态托管 CDN 域名（*.tcloudbaseapp.com，DomainType=STATIC_STORE）。" +
        "这是网关默认域上的路径路由，不是 STATIC_STORE 上游绑定；STATIC_STORE 上游必须显式传 upstreamResourceType=STATIC_STORE。" +
        "关闭静态托管默认域名（*.tcloudbaseapp.com）：先 queryGateway(listRoutes) 找到 DomainType=STATIC_STORE 且 IsDefault=true 的 domain，再 manageGateway(action=\"disableRoute\", domain=该域名, path=\"/\")；勿用 manageHosting。" +
        "创建后可用 queryGateway(action=\"listRoutes\") 核对 Domain / DomainType / Path / UpstreamResourceType。" +
        "上游类型只用一个参数 upstreamResourceType（也可写在 route.upstreamResourceType，route 优先）：" +
        "WEB_SCF=HTTP云函数，SCF=Event云函数，CBR=云托管，STATIC_STORE=静态托管，LH=轻量应用服务器；" +
        "配合 targetName 或 route.serviceName（云函数名/云托管服务名/静态托管实例名，常见 staticstore）。" +
        "createRoute 只建网关入口，不改上游权限。" +
        "enablePathTransmission：默认 false 剥触发路径前缀；true 透传完整路径（CBR 多路由、WEB_SCF 自管子路径常需 true；STATIC_STORE 自定义触发路径映射站点根通常 false）。" +
        "⚠️ 自定义域名访问：若环境已有自定义域名（先 queryGateway listCustomDomains），优先 createRoute 并显式传入该 domain，无需 certificateId；" +
        "仅首次绑定全新自定义域名时用 bindCustomDomain（certificateId 可选：未传时按域名自动检索证书，单证书自动选用、多证书返回选择指引）。" +
        "createRoute / bindCustomDomain 创建前会调用 VerifyHTTPServiceRoute 做归属权等预检（探测→创建）；失败时返回 data.checks 与 DNS TXT 指引，配置后重试。CORS/安全域名用 envDomainManagement。" +
        "enableService/authSwitch：HTTP 网关总开关与访问鉴权开关；createRoute 后若访问报 HTTPSERVICE_NONACTIVATED，通常是总开关未开启（用 queryGateway getPrivilege 查询、enableService 开启）。",
      inputSchema: {
        action: z
          .enum(MANAGE_GATEWAY_ACTIONS)
          .describe(
            "写操作：createRoute/updateRoute/deleteRoute 管理路由；enableRoute/disableRoute 启用或禁用已有路由（需 path，建议显式传 domain）；" +
              "bindCustomDomain/deleteCustomDomain 管理自定义域名；" +
              "enableService/authSwitch 开关 HTTP 网关总开关与访问鉴权（需配合 enable 参数）。" +
              "createRoute/updateRoute 必须提供 upstreamResourceType；enableRoute/disableRoute 会先 listRoutes 定位已有路由，通常不必重填上游。" +
              "updateRoute 也可传 enable/route.enable 直接改 Routes[].Enable。" +
              "关闭 *.tcloudbaseapp.com 默认静态托管域：disableRoute + domain=该 STATIC_STORE IsDefault 域名 + path=\"/\"。" +
              "已有自定义域名时优先 createRoute(domain=已有域名) 实现访问，不必再次 bindCustomDomain / 传入 certificateId；" +
              "bindCustomDomain 仅用于首次绑定新域名（certificateId 可选，未传则按域名自动检索；可选 accessType=DIRECT|CDN|CUSTOM，CUSTOM 需 customCname；普通场景用默认 DIRECT）。" +
              "createRoute/bindCustomDomain 创建前会 VerifyHTTPServiceRoute 预检；失败时按返回的 DNS TXT 指引配置后重试。" +
              "接入说明：https://docs.cloudbase.net/service/custom-domain",
          ),
        targetName: z
          .string()
          .optional()
          .describe(
            "上游资源名称（UpstreamResourceName），与 route.serviceName 二选一（route 优先）。" +
              "云函数=函数名；云托管=服务名；静态托管=实例名（常见 staticstore）。不会自动推断上游类型。",
          ),
        path: z
          .string()
          .optional()
          .describe(
            "触发路径（网关匹配前缀），默认 /{上游名}。例：云函数 /api/hello、云托管 /api、静态托管 / 或 /app。" +
              "只建网关入口；与 enablePathTransmission 共同决定上游实际收到的路径。",
          ),
        upstreamResourceType: z
          .enum(UPSTREAM_RESOURCE_TYPES)
          .optional()
          .describe(
            "上游类型（与 route.upstreamResourceType 二选一，route 优先）。" +
              "WEB_SCF=HTTP云函数，SCF=Event云函数，CBR=云托管，STATIC_STORE=静态托管，LH=轻量应用服务器。" +
              "createRoute/updateRoute 必填其一；勿把 manageFunctions 的 type=HTTP|Event 传到本字段。",
          ),
        auth: z
          .boolean()
          .optional()
          .describe(
            "网关路径鉴权（EnableAuth）。匿名/浏览器公网访问通常 false。" +
              "只控制网关入口；云函数安全规则、云托管鉴权、静态托管权限需各自工具另行配置。",
          ),
        enablePathTransmission: z
          .boolean()
          .optional()
          .describe(
            "路径透传（EnablePathTransmission），平台默认 false。例 path=/api 且请求 /api/users：" +
              "false→上游收到 /users；true→上游收到 /api/users。" +
              "CBR 云托管（Express 等自管子路由）与 WEB_SCF 多路径函数常需 true；" +
              "STATIC_STORE 把触发路径映射到站点根目录（如 /app → 托管 /）时通常 false；" +
              "单入口/根路径处理保持 false。也可用 route.enablePathTransmission（route 优先）。",
          ),
        route: z
          .object({
            path: z.string().optional(),
            serviceName: z
              .string()
              .optional()
              .describe(
                "上游实例名：云函数名 / 云托管服务名 / 静态托管实例名（常见 staticstore）/ LH 实例。优先于顶层 targetName。",
              ),
            upstreamResourceType: z
              .enum(UPSTREAM_RESOURCE_TYPES)
              .optional()
              .describe(
                "同顶层 upstreamResourceType。route 内设置时优先于顶层。",
              ),
            auth: z.boolean().optional(),
            enablePathTransmission: z
              .boolean()
              .optional()
              .describe(
                "同顶层 enablePathTransmission。route 内设置时优先于顶层。",
              ),
            enable: z
              .boolean()
              .optional()
              .describe(
                "路由级开关（Routes[].Enable / Route.Enable）。createRoute/updateRoute 可用：" +
                  "enable=false 禁用该 Domain+Path（访问返回 GATEWAY_ROUTE_DISABLED）；" +
                  "enable=true 重新启用。updateRoute 也可用顶层 enable 表达同一语义；" +
                  "也可用专用 action enableRoute/disableRoute。route.enable 优先于顶层 enable。",
              ),
          })
          .optional()
          .describe(
            "路由对象（可选写法）。例：云函数 {upstreamResourceType:\"WEB_SCF\",serviceName:\"fn\",path:\"/api\"}；" +
              "云托管 {upstreamResourceType:\"CBR\",serviceName:\"svc\",path:\"/api\"}；" +
              "静态托管 {upstreamResourceType:\"STATIC_STORE\",serviceName:\"staticstore\",path:\"/\"}；" +
              "禁用路由 {path:\"/\",enable:false}（配合 updateRoute，或直接用 disableRoute）。",
          ),
        domain: z
          .string()
          .optional()
          .describe(
            "域名。省略时自动使用环境 DomainType=HTTPSERVICE 的 IsDefault 默认 HTTP 域名（*.{region}.app.tcloudbase.com），不会回退到静态托管 CDN 域名（*.tcloudbaseapp.com，DomainType=STATIC_STORE）；也不是 STATIC_STORE 上游绑定。" +
              "可用 queryGateway(action=\"listRoutes\") 核对实际 Domain / DomainType。" +
              "enableRoute/disableRoute 操作 *.tcloudbaseapp.com 时必须显式传入该域名。" +
              "已有自定义域名时请显式传入该域名并 createRoute/updateRoute/deleteRoute，即可实现自定义域名访问且无需证书 ID；" +
              "仅 bindCustomDomain 时表示要新绑定的域名。",
          ),
        certificateId: z
          .string()
          .optional()
          .describe(
            "证书 ID。仅 bindCustomDomain 使用：显式传入时跳过自动检索；" +
              "省略时按 domain 调用 describeCertificates(SearchKey=domain)——" +
              "单证书自动选用，无证书报错，多证书返回结构化选择指引（MCP 非交互）。" +
              "在已有自定义域名上 createRoute / updateRoute / deleteRoute 不需要 certificateId。",
          ),
        accessType: z
          .enum(["DIRECT", "CDN", "CUSTOM"])
          .optional()
          .describe(
            "绑定类型（仅 bindCustomDomain，默认 DIRECT）。" +
              "DIRECT=直连（普通绑域名用这个）；CDN=云开发 CDN；CUSTOM=自有 CDN/WAF（需 customCname）。" +
              "详见 https://docs.cloudbase.net/service/custom-domain",
          ),
        customCname: z
          .string()
          .optional()
          .describe(
            "自有 CDN/WAF 的回源/回填地址（仅 bindCustomDomain 且 accessType=CUSTOM）。" +
              "不是 DNS 里用户域名要解析到的那个 CNAME；DIRECT/CDN 不要传。" +
              "详见 https://docs.cloudbase.net/service/custom-domain",
          ),
        enable: z
          .boolean()
          .optional()
          .describe(
            "开关目标状态：enableService / authSwitch 必填（true 开启 / false 关闭）；" +
              "bindCustomDomain 可选：enable=false 表示绑定后禁用域名（默认启用）；" +
              "updateRoute 可选：映射到 Routes[].Enable（也可用 route.enable，route 优先；" +
              "也可用专用 action enableRoute/disableRoute）。" +
              "省略或非布尔值在 enableService/authSwitch 会返回参数错误。",
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
        category: "gateway",
      },
    },
    async (input: ManageGatewayInput) =>
      withEnvelope(() => handleManageGateway(input)),
  );
}
