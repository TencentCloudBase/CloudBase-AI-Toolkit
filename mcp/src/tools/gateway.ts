import { z } from "zod";
import { getCloudBaseManager, logCloudBaseResult } from "../cloudbase-manager.js";
import { ExtendedMcpServer } from "../server.js";

const QUERY_GATEWAY_ACTIONS = [
  "getAccess",
  "listDomains",
] as const;

const MANAGE_GATEWAY_ACTIONS = [
  "createAccess",
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
};

type ManageGatewayInput = {
  action: ManageGatewayAction;
  targetType: GatewayTargetType;
  targetName: string;
  path?: string;
  type?: "Event" | "HTTP";
  auth?: boolean;
};

function jsonContent(body: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(body, null, 2),
      },
    ],
  };
}

function normalizeAccessPath(path: string | undefined): string {
  if (!path) {
    return "/";
  }

  return path.startsWith("/") ? path : `/${path}`;
}

export function registerGatewayTools(server: ExtendedMcpServer) {
  const cloudBaseOptions = server.cloudBaseOptions;
  const getManager = () => getCloudBaseManager({ cloudBaseOptions });

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
      const cloudbase = await getManager();
      const accessPath = normalizeAccessPath(input.path || `/${input.targetName}`);
      const result = await cloudbase.access.createAccess({
        name: input.targetName,
        path: accessPath,
        type: ((input.type || "Event") === "HTTP" ? 6 : 1) as 1 | 2,
        auth: input.auth,
      });
      logCloudBaseResult(server.logger, result);

      return buildEnvelope(
        {
          action: input.action,
          targetType: input.targetType,
          targetName: input.targetName,
          path: accessPath,
          raw: result,
        },
        `已为目标 ${input.targetName} 创建网关访问路径`,
        [
          {
            tool: "queryGateway",
            action: "getAccess",
            reason: "确认访问入口是否已生效",
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
        "网关域统一写入口。通过 action 创建目标访问入口，后续承接更通用的网关配置能力。",
      inputSchema: {
        action: z.enum(MANAGE_GATEWAY_ACTIONS).describe("写操作类型，例如 createAccess"),
        targetType: z
          .enum(["function"])
          .describe("目标资源类型。当前支持 function，后续可扩展"),
        targetName: z.string().describe("目标资源名称"),
        path: z.string().optional().describe("访问路径，默认 /{targetName}"),
        type: z.enum(["Event", "HTTP"]).optional().describe("函数接入类型"),
        auth: z.boolean().optional().describe("是否开启鉴权"),
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
