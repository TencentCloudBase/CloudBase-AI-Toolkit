import { z } from "zod";
import { getCloudBaseManager, logCloudBaseResult } from "../cloudbase-manager.js";
import { ExtendedMcpServer } from "../server.js";
import { jsonContent } from "../utils/json-content.js";

const QUERY_GATEWAY_ACTIONS = [
  "getAccess",
  "listDomains",
  "listRoutes",
  "getRoute",
  "listCustomDomains",
] as const;

const MANAGE_GATEWAY_ACTIONS = [
  "createAccess",
  "createRoute",
  "updateRoute",
  "deleteRoute",
  "bindCustomDomain",
  "deleteCustomDomain",
  "deleteAccess",
  "updatePathAuth",
] as const;

type QueryGatewayAction = (typeof QUERY_GATEWAY_ACTIONS)[number];
type ManageGatewayAction = (typeof MANAGE_GATEWAY_ACTIONS)[number];
type GatewayTargetType = "function";

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
  targetType?: GatewayTargetType;
  targetName?: string;
  routeId?: string;
};

type ManageGatewayInput = {
  action: ManageGatewayAction;
  targetType?: GatewayTargetType;
  targetName?: string;
  path?: string;
  type?: "Event" | "HTTP";
  auth?: boolean;
  route?: {
    routeId?: string;
    path?: string;
    serviceType?: string;
    serviceName?: string;
    auth?: boolean;
  };
  domain?: string;
  certificateId?: string;
  accessName?: string;
};

function normalizeAccessPath(path: string | undefined): string {
  if (!path) {
    return "/";
  }

  return path.startsWith("/") ? path : `/${path}`;
}

function ensureGatewayEnvId(cloudBaseOptions?: { envId?: string }) {
  const envId = cloudBaseOptions?.envId;
  if (!envId) {
    throw new Error("当前网关操作需要已绑定 envId");
  }
  return envId;
}

export function registerGatewayTools(server: ExtendedMcpServer) {
  const cloudBaseOptions = server.cloudBaseOptions;
  const getManager = () => getCloudBaseManager({ cloudBaseOptions });
  const getGatewayEnvId = () => ensureGatewayEnvId(cloudBaseOptions);

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

  const listGatewayDomains = async () => {
    const cloudbase = await getManager();
    const result = await cloudbase.access.getDomainList();
    logCloudBaseResult(server.logger, result);

    const domains = [
      result.DefaultDomain,
      ...(result.ServiceSet || []).map((item) => item.Domain),
    ].filter(Boolean);

    return {
      domains,
      enableService: result.EnableService,
      raw: result,
    };
  };

  const listHttpServiceRoutes = async (domain?: string) => {
    const cloudbase = await getManager();
    const result = await cloudbase.env.describeHttpServiceRoute({
      EnvId: getGatewayEnvId(),
      ...(domain
        ? {
            Filters: [
              {
                Name: "Domain",
                Values: [domain],
              },
            ],
          }
        : {}),
    });
    logCloudBaseResult(server.logger, result);
    return result;
  };

  const flattenRoutes = (result: any) =>
    (result.Domains ?? []).flatMap((domainItem: any) =>
      (domainItem.Routes ?? []).map((route: any) => ({
        Domain: domainItem.Domain,
        DomainType: domainItem.DomainType,
        AccessType: domainItem.AccessType,
        ...route,
      })),
    );

  const resolveRouteDomain = async (preferredDomain?: string) => {
    if (preferredDomain) {
      return preferredDomain;
    }
    const routeInfo = await listHttpServiceRoutes();
    return routeInfo.OriginDomain;
  };

  const normalizeRoutePayload = async (
    route: ManageGatewayInput["route"],
    fallback: Pick<ManageGatewayInput, "path" | "targetName" | "targetType" | "auth">,
    domain?: string,
  ) => {
    const path = normalizeAccessPath(route?.path ?? fallback.path);
    const serviceType = route?.serviceType ?? fallback.targetType;
    const serviceName = route?.serviceName ?? fallback.targetName;

    if (!serviceType || !serviceName) {
      throw new Error("route.serviceType 和 route.serviceName 为必填项");
    }

    return {
      EnvId: getGatewayEnvId(),
      Domain: {
        Domain: await resolveRouteDomain(domain),
        Routes: [
          {
            Path: path,
            UpstreamResourceType: serviceType === "function" ? "SCF" : "CBR",
            UpstreamResourceName: serviceName,
            EnableAuth:
              route?.auth !== undefined
                ? route.auth
                : fallback.auth !== undefined
                  ? fallback.auth
                  : undefined,
          },
        ],
      },
    };
  };

  const handleQueryGateway = async (
    input: QueryGatewayInput,
  ): Promise<GatewayToolEnvelope> => {
    switch (input.action) {
    case "listDomains": {
      const result = await listGatewayDomains();
      return buildEnvelope(
        {
          action: input.action,
          domains: result.domains,
          enableService: result.enableService,
          raw: result.raw,
        },
        `已获取 ${result.domains.length} 个网关域名`,
        [
          {
            tool: "queryGateway",
            action: "getAccess",
            reason: "查看某个目标当前的访问入口",
          },
        ],
      );
    }
    case "listCustomDomains": {
      const result = await listGatewayDomains();
      return buildEnvelope(
        {
          action: input.action,
          domains: result.raw.ServiceSet ?? [],
          total: (result.raw.ServiceSet ?? []).length,
          raw: result.raw,
        },
        `已获取 ${(result.raw.ServiceSet ?? []).length} 个自定义域名`,
      );
    }
    case "listRoutes": {
      const result = await listHttpServiceRoutes();
      const routes = flattenRoutes(result);

      return buildEnvelope(
        {
          action: input.action,
          routes,
          total: result.TotalCount ?? routes.length,
          raw: result,
        },
        `已获取 ${result.TotalCount ?? routes.length} 条 HTTP 路由`,
      );
    }
    case "getRoute": {
      const result = await listHttpServiceRoutes();
      const route =
        flattenRoutes(result).find(
          (item: any) =>
            (input.routeId && item.RouteId === input.routeId) ||
            (input.targetName && item.UpstreamResourceName === input.targetName),
        ) ?? null;

      return buildEnvelope(
        {
          action: input.action,
          routeId: input.routeId ?? null,
          route,
          raw: result,
        },
        route ? "已获取路由详情" : "未找到对应路由",
      );
    }
    case "getAccess": {
      if (!input.targetName) {
        throw new Error("getAccess 操作时，targetName 参数是必需的");
      }

      const cloudbase = await getManager();
      const [accessList, domainInfo] = await Promise.all([
        cloudbase.access.getAccessList({ name: input.targetName }),
        listGatewayDomains(),
      ]);

      logCloudBaseResult(server.logger, accessList);

      const urls = Array.from(
        new Set(
          (accessList.APISet || []).flatMap((api) =>
            domainInfo.domains.map((domain) => {
              const normalizedPath = normalizeAccessPath(api.Path);
              return `https://${domain}${normalizedPath}`;
            }),
          ),
        ),
      );

      return buildEnvelope(
        {
          action: input.action,
          targetType: input.targetType ?? "function",
          targetName: input.targetName,
          apis: accessList.APISet || [],
          total: accessList.Total || 0,
          domains: domainInfo.domains,
          urls,
          enableService:
            accessList.EnableService ?? domainInfo.enableService ?? false,
          raw: {
            accessList,
            domainList: domainInfo.raw,
          },
        },
        `已获取目标 ${input.targetName} 的网关访问配置`,
        [
          {
            tool: "manageGateway",
            action: "createAccess",
            reason: "为该目标新增访问路径",
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
    case "createAccess": {
      if (!input.targetName || !input.targetType) {
        throw new Error("action=createAccess 时必须提供 targetType 和 targetName");
      }
      if (!input.type) {
        throw new Error(
          "action=createAccess 时必须提供 type 参数（Event 或 HTTP），不可省略。" +
            "如果目标云函数是 HTTP 类型，type 必须传 HTTP；如果是 Event 类型，type 传 Event。" +
            "省略 type 会导致网关默认使用 Event 模式，对 HTTP 函数将产生 FUNCTION_PARAM_INVALID 错误。",
        );
      }
      const cloudbase = await getManager();
      const accessPath = normalizeAccessPath(input.path || `/${input.targetName}`);
      let result;
      try {
        result = await cloudbase.access.createAccess({
          name: input.targetName,
          path: accessPath,
          type: (input.type === "HTTP" ? 6 : 1) as 1 | 2,
          auth: input.auth,
        });
      } catch (err: any) {
        if (err.message && err.message.includes("An error has occurred")) {
          let hint = "为目标资源配置访问路由失败（后端内部错误）。请确保：1) 目标云函数已成功创建并处于 Active 状态；2) 环境默认 HTTP 域名已完成初始化；3) 该访问路径未被占用。";
          if (input.type === "HTTP") {
            hint += "此外注意：如果目标函数最初是作为 Event 函数创建的，这里 type 必须传 Event，传 HTTP 会导致此错误。";
          }
          throw new Error(`${hint} 原始错误：${err.message}`);
        }
        throw err;
      }
      logCloudBaseResult(server.logger, result);

      return buildEnvelope(
        {
          action: input.action,
          targetType: input.targetType,
          targetName: input.targetName,
          path: accessPath,
          raw: result,
        },
        `已为目标 ${input.targetName} 创建网关访问路径。注意：路由配置传播通常需要等待 30 秒到 3 分钟，请勿立即访问。该操作只创建网关入口，不会自动放开函数安全规则；若需要匿名或浏览器直接访问，请继续检查函数资源权限。`,
        [
          {
            tool: "queryGateway",
            action: "getAccess",
            reason: "等待 30 秒到 3 分钟后再确认访问入口是否已生效",
          },
          {
            tool: "queryPermissions",
            action: "getResourcePermission",
            reason: "确认函数安全规则是否允许预期访问方；网关 auth=false 不等于函数已允许匿名访问",
          },
          {
            tool: "managePermissions",
            action: "updateResourcePermission",
            reason: "只有在确认需要匿名或浏览器直连访问时，才按实际安全要求更新函数权限",
          },
        ],
      );
    }
    case "createRoute": {
      const cloudbase = await getManager();
      const result = await cloudbase.env.createHttpServiceRoute(
        (await normalizeRoutePayload(input.route, input, input.domain)) as any,
      );
      logCloudBaseResult(server.logger, result);

      return buildEnvelope(
        {
          action: input.action,
          route: input.route ?? null,
          raw: result,
        },
        "HTTP 路由创建成功",
      );
    }
    case "updateRoute": {
      const cloudbase = await getManager();
      const result = await cloudbase.env.modifyHttpServiceRoute(
        (await normalizeRoutePayload(input.route, input, input.domain)) as any,
      );
      logCloudBaseResult(server.logger, result);

      return buildEnvelope(
        {
          action: input.action,
          route: input.route ?? null,
          raw: result,
        },
        "HTTP 路由更新成功",
      );
    }
    case "deleteRoute": {
      const routePath = input.route?.path ?? input.path;
      if (!routePath) {
        throw new Error("action=deleteRoute 时必须提供 route.path 或 path");
      }
      const cloudbase = await getManager();
      const domain = await resolveRouteDomain(input.domain);
      const result = await cloudbase.env.deleteHttpServiceRoute({
        EnvId: getGatewayEnvId(),
        Domain: domain,
        Paths: [normalizeAccessPath(routePath)],
      } as any);
      logCloudBaseResult(server.logger, result);

      return buildEnvelope(
        {
          action: input.action,
          domain,
          path: normalizeAccessPath(routePath),
          raw: result,
        },
        "HTTP 路由删除成功",
      );
    }
    case "bindCustomDomain": {
      if (!input.domain || !input.certificateId) {
        throw new Error("action=bindCustomDomain 时必须提供 domain 和 certificateId");
      }
      const cloudbase = await getManager();
      const result = await cloudbase.env.bindCustomDomain({
        EnvId: getGatewayEnvId(),
        Domain: {
          Domain: input.domain,
          CertId: input.certificateId,
        },
      } as any);
      logCloudBaseResult(server.logger, result);

      return buildEnvelope(
        {
          action: input.action,
          domain: input.domain,
          certificateId: input.certificateId,
          raw: result,
        },
        "自定义域名绑定成功",
      );
    }
    case "deleteCustomDomain": {
      if (!input.domain) {
        throw new Error("action=deleteCustomDomain 时必须提供 domain");
      }
      const cloudbase = await getManager();
      const result = await cloudbase.env.deleteCustomDomain({
        EnvId: getGatewayEnvId(),
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
    }
    case "deleteAccess": {
      const cloudbase = await getManager();
      const accessPath = input.path ? normalizeAccessPath(input.path) : undefined;
      const result = await cloudbase.access.deleteAccess({
        ...(input.targetName ? { name: input.targetName } : {}),
        ...(accessPath ? { path: accessPath } : {}),
      });
      logCloudBaseResult(server.logger, result);

      return buildEnvelope(
        {
          action: input.action,
          targetName: input.targetName ?? null,
          path: accessPath ?? null,
          raw: result,
        },
        "网关访问入口删除成功",
      );
    }
    case "updatePathAuth": {
      if (!input.targetName && !input.path) {
        throw new Error("action=updatePathAuth 时至少需要提供 targetName 或 path");
      }
      if (input.auth === undefined) {
        throw new Error("action=updatePathAuth 时必须提供 auth");
      }

      const cloudbase = await getManager();
      const accessPath = input.path ? normalizeAccessPath(input.path) : undefined;
      const accessList = await cloudbase.access.getAccessList({
        ...(input.targetName ? { name: input.targetName } : {}),
        ...(accessPath ? { path: accessPath } : {}),
      });
      const apiIds = (accessList.APISet ?? []).map((item) => item.APIId).filter(Boolean);
      if (apiIds.length === 0) {
        throw new Error("未找到可更新鉴权状态的访问入口");
      }

      const result = await cloudbase.access.switchPathAuth({
        apiIds,
        auth: input.auth,
      });
      logCloudBaseResult(server.logger, result);

      return buildEnvelope(
        {
          action: input.action,
          targetName: input.targetName ?? null,
          path: accessPath ?? null,
          auth: input.auth,
          apiIds,
          raw: result,
        },
        "网关路径鉴权更新成功",
      );
    }
    default:
      throw new Error(`不支持的操作类型: ${input.action}`);
    }
  };

  server.registerTool?.(
    "queryGateway",
    {
      title: "查询网关域资源",
      description:
        "网关域统一只读入口。通过 action 查询网关域名、访问入口和目标暴露情况。",
      inputSchema: {
        action: z
          .enum(QUERY_GATEWAY_ACTIONS)
          .describe("只读操作类型，例如 getAccess、listDomains"),
        targetType: z
          .enum(["function"])
          .optional()
          .describe("目标资源类型。当前支持 function，后续可扩展"),
        targetName: z
          .string()
          .optional()
          .describe("目标资源名称。getAccess 时必填"),
        routeId: z.string().optional().describe("路由 ID。getRoute 时可选"),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
        category: "gateway",
      },
    },
    async (input: QueryGatewayInput) => withEnvelope(() => handleQueryGateway(input)),
  );

  server.registerTool?.(
    "manageGateway",
    {
      title: "管理网关域资源",
      description:
        "网关域统一写入口。通过 action 创建目标访问入口，后续承接更通用的网关配置能力。为已存在的 HTTP 云函数补默认域名访问时，通常使用 createAccess 并提供 targetType=\"function\"、targetName、type=\"HTTP\" 与期望 path。注意 createAccess 只创建网关入口，不会自动修改函数资源权限。",
      inputSchema: {
        action: z
          .enum(MANAGE_GATEWAY_ACTIONS)
          .describe("写操作类型，例如 createAccess。为已有函数补默认域名访问入口时使用 createAccess"),
        targetType: z
          .enum(["function"])
          .optional()
          .describe("目标资源类型。当前支持 function，后续可扩展"),
        targetName: z
          .string()
          .optional()
          .describe("目标资源名称。createAccess 到云函数时填写函数名"),
        path: z
          .string()
          .optional()
          .describe("访问路径，默认 /{targetName}。例如为 HTTP 函数暴露 /api/hello 时传 /api/hello。该参数只创建网关入口，不会自动放开函数资源权限。"),
        type: z
          .enum(["Event", "HTTP"])
          .optional()
          .describe("目标函数的运行时类型，不是接入协议。createAccess 到已创建的 HTTP 云函数时传 HTTP；给 Event 函数补网关访问时传 Event 或省略。"),
        auth: z
          .boolean()
          .optional()
          .describe("是否开启网关路径鉴权。若要走默认域名做匿名或浏览器访问，通常设为 false；该开关仅控制网关入口本身，不会修改函数资源权限，仍需检查并按需调整函数安全规则。"),
        route: z
          .object({
            routeId: z.string().optional(),
            path: z.string().optional(),
            serviceType: z.string().optional(),
            serviceName: z.string().optional(),
            auth: z.boolean().optional(),
          })
          .optional()
          .describe("HTTP 路由配置对象"),
        domain: z.string().optional().describe("自定义域名"),
        certificateId: z.string().optional().describe("证书 ID"),
        accessName: z.string().optional().describe("访问入口名称，保留字段"),
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
