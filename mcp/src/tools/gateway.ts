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
      UpstreamResourceType: route.UpstreamResourceType,
      UpstreamResourceName: route.UpstreamResourceName,
    }));
    const envelope = toAccessUrlEnvelope(rankGatewayAccessUrls(candidates));
    return {
      ...(envelope.accessUrl ? { accessUrl: envelope.accessUrl } : {}),
      accessUrls: envelope.accessUrls,
      ...(envelope.accessUrlSource
        ? { accessUrlSource: envelope.accessUrlSource }
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
        (item) => item.Enable !== false && item.Status === "SUCCESS",
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
      }>;
    };
    resolved: {
      domain: string;
      path: string;
      upstreamResourceType: UpstreamResourceType;
      upstreamResourceName: string;
      enableAuth?: boolean;
      enablePathTransmission?: boolean;
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

    const route: {
      Path: string;
      UpstreamResourceType: UpstreamResourceType;
      UpstreamResourceName: string;
      EnableAuth?: boolean;
      EnablePathTransmission?: boolean;
    } = {
      Path: path,
      UpstreamResourceType: upstreamResourceType,
      UpstreamResourceName: upstreamResourceName,
      EnableAuth: enableAuth,
    };
    if (enablePathTransmission !== undefined) {
      route.EnablePathTransmission = enablePathTransmission;
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
      },
    };
  };

  const routeMutationNextActions = (
    targetName: string,
  ): GatewayToolEnvelope["nextActions"] => [
    {
      tool: "queryGateway",
      action: "getRoute",
      reason: "等待 30 秒到 3 分钟后再确认访问入口是否已生效",
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
              "⚠️ HTTP 网关总开关未开启，路由创建成功后访问仍将返回 HTTPSERVICE_NONACTIVATED（403）；请先调用 manageGateway(action=\"enableService\", enable=true) 开启，再等待 30 秒到 3 分钟访问。";
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
            `。注意：路由配置传播通常需要等待 30 秒到 3 分钟，请勿立即访问。该操作只创建网关入口，不会自动放开上游权限；若上游是云函数且需要匿名或浏览器直接访问，请继续检查函数资源权限。` +
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
            accessUrl: `https://${payload.resolved.domain}${payload.resolved.path}`,
            accessUrls: [`https://${payload.resolved.domain}${payload.resolved.path}`],
            accessUrlSource:
              input.domain && input.domain === payload.resolved.domain
                ? "gateway.custom"
                : "gateway.default",
            raw: result,
          },
          `HTTP 路由更新成功（${payload.resolved.domain}${payload.resolved.path}` +
            (payload.resolved.enablePathTransmission === true
              ? "，路径透传=开启"
              : payload.resolved.enablePathTransmission === false
                ? "，路径透传=关闭"
                : "") +
            `）`,
          routeMutationNextActions(payload.resolved.upstreamResourceName),
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
        if (!input.domain || !input.certificateId) {
          throw new Error(
            "action=bindCustomDomain 时必须提供 domain 和 certificateId",
          );
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
        const cloudbase = await getManager();
        const result = await cloudbase.env.bindCustomDomain({
          EnvId: await resolveEnvId(),
          Domain: {
            Domain: input.domain,
            CertId: input.certificateId,
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
            certificateId: input.certificateId,
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
        "CloudBase HTTP 网关统一写入口（Domain/Route）。createRoute/updateRoute/deleteRoute 把域名下的 path 转到上游；未传 domain 时用 DomainType=HTTPSERVICE 的 IsDefault 默认 HTTP 域名（形如 *.{region}.app.tcloudbase.com），不会使用静态托管 CDN 域名（*.tcloudbaseapp.com，DomainType=STATIC_STORE）。" +
        "这是网关默认域上的路径路由，不是 STATIC_STORE 上游绑定；STATIC_STORE 上游必须显式传 upstreamResourceType=STATIC_STORE。" +
        "创建后可用 queryGateway(action=\"listRoutes\") 核对 Domain / DomainType / Path / UpstreamResourceType。" +
        "上游类型只用一个参数 upstreamResourceType（也可写在 route.upstreamResourceType，route 优先）：" +
        "WEB_SCF=HTTP云函数，SCF=Event云函数，CBR=云托管，STATIC_STORE=静态托管，LH=轻量应用服务器；" +
        "配合 targetName 或 route.serviceName（云函数名/云托管服务名/静态托管实例名，常见 staticstore）。" +
        "createRoute 只建网关入口，不改上游权限。" +
        "enablePathTransmission：默认 false 剥触发路径前缀；true 透传完整路径（CBR 多路由、WEB_SCF 自管子路径常需 true；STATIC_STORE 自定义触发路径映射站点根通常 false）。" +
        "⚠️ 自定义域名访问：若环境已有自定义域名（先 queryGateway listCustomDomains），优先 createRoute 并显式传入该 domain，无需 certificateId；" +
        "仅首次绑定全新自定义域名时用 bindCustomDomain（需 certificateId）。CORS/安全域名用 envDomainManagement。" +
        "enableService/authSwitch：HTTP 网关总开关与访问鉴权开关；createRoute 后若访问报 HTTPSERVICE_NONACTIVATED，通常是总开关未开启（用 queryGateway getPrivilege 查询、enableService 开启）。",
      inputSchema: {
        action: z
          .enum(MANAGE_GATEWAY_ACTIONS)
          .describe(
            "写操作：createRoute/updateRoute/deleteRoute 管理路由；bindCustomDomain/deleteCustomDomain 管理自定义域名；" +
              "enableService/authSwitch 开关 HTTP 网关总开关与访问鉴权（需配合 enable 参数）。" +
              "createRoute/updateRoute 必须提供 upstreamResourceType。" +
              "已有自定义域名时优先 createRoute(domain=已有域名) 实现访问，不必再次 bindCustomDomain / 传入 certificateId；" +
              "bindCustomDomain 仅用于首次绑定新域名（需 certificateId；可选 accessType=DIRECT|CDN|CUSTOM，CUSTOM 需 customCname；普通场景用默认 DIRECT）。" +
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
          })
          .optional()
          .describe(
            "路由对象（可选写法）。例：云函数 {upstreamResourceType:\"WEB_SCF\",serviceName:\"fn\",path:\"/api\"}；" +
              "云托管 {upstreamResourceType:\"CBR\",serviceName:\"svc\",path:\"/api\"}；" +
              "静态托管 {upstreamResourceType:\"STATIC_STORE\",serviceName:\"staticstore\",path:\"/\"}。",
          ),
        domain: z
          .string()
          .optional()
          .describe(
            "域名。省略时自动使用环境 DomainType=HTTPSERVICE 的 IsDefault 默认 HTTP 域名（*.{region}.app.tcloudbase.com），不会回退到静态托管 CDN 域名（*.tcloudbaseapp.com，DomainType=STATIC_STORE）；也不是 STATIC_STORE 上游绑定。" +
              "可用 queryGateway(action=\"listRoutes\") 核对实际 Domain / DomainType。" +
              "已有自定义域名时请显式传入该域名并 createRoute/updateRoute/deleteRoute，即可实现自定义域名访问且无需证书 ID；" +
              "仅 bindCustomDomain 时表示要新绑定的域名。",
          ),
        certificateId: z
          .string()
          .optional()
          .describe(
            "证书 ID。仅首次 bindCustomDomain 必填。" +
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
            "开关目标状态（enableService / authSwitch 必填）：enable=true 开启，enable=false 关闭。" +
              "bindCustomDomain 可选：enable=false 表示绑定后禁用域名（默认启用）。" +
              "省略或非布尔值会返回参数错误。",
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
