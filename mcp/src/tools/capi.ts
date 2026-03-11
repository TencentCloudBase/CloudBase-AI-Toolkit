import { z } from "zod";
import { getCloudBaseManager, logCloudBaseResult } from "../cloudbase-manager.js";
import { ExtendedMcpServer } from "../server.js";
import { successResult, toMCPResponse } from "../utils/response-builder.js";

const CATEGORY = "cloud-api";

const ALLOWED_SERVICES = [
    "tcb",
    "scf",
    "sts",
    "cam",
    "lowcode",
    "cdn",
    "vpc",
] as const;

type AllowedService = (typeof ALLOWED_SERVICES)[number];

/**
 * Register Common Service based Cloud API tool.
 * The tool is intentionally generic; callers must read project rules or
 * skills to ensure correct API usage before invoking.
 */
export function registerCapiTools(server: ExtendedMcpServer) {
    const cloudBaseOptions = server.cloudBaseOptions;
    const logger = server.logger;
    const getManager = () => getCloudBaseManager({ cloudBaseOptions });

    server.registerTool?.(
        "callCloudApi",
        {
            title: "调用云API",
            description:
                "通用的云 API 调用工具，使用前请务必先阅读相关rules或skills，确认所需服务、Action 与 Param 的正确性和安全性",
            inputSchema: {
                service: z
                    .enum(ALLOWED_SERVICES)
                    .describe(
                        "选择要访问的服务，必须先查看规则/技能确认是否可用。可选：tcb、scf、sts、cam、lowcode、cdn、vpc。",
                    ),
                action: z
                    .string()
                    .min(1)
                    .describe("具体 Action 名称，需符合对应服务的 API 定义。"),
                params: z
                    .record(z.any())
                    .optional()
                    .describe(
                        "Action 对应的参数对象，键名需与官方 API 定义一致。某些 Action 需要携带 EnvId 等信息，如不清楚请在调用前查看rules/skill。",
                    ),
            },
            annotations: {
                readOnlyHint: false,
                destructiveHint: true,
                idempotentHint: false,
                openWorldHint: true,
                category: CATEGORY,
            },
        },
        async ({
            service,
            action,
            params,
        }: {
            service: AllowedService;
            action: string;
            params?: Record<string, any>;
        }) => {
            if (!ALLOWED_SERVICES.includes(service)) {
                throw new Error(
                    `Service ${service} is not allowed. Allowed services: ${ALLOWED_SERVICES.join(", ")}`,
                );
            }

            const cloudbase = await getManager();
            if (['1', 'true'].includes(process.env.CLOUDBASE_EVALUATE_MODE ?? '')) {
                if (service === 'lowcode') {
                    throw new Error(`${service}/${action} Cloud API is not exposed or does not exist. Please use another API.`);
                }
                if (service === 'tcb') {
                    const tcbCapiForbidList = [
                        // 未明确对外的云API
                        'DescribeStorageACL', 'ModifyStorageACL', 'DescribeSecurityRule',

                        // 要下线的云API
                        "ListTables",
                        "DescribeCloudBaseGWAPI",
                        "DescribeCloudBaseGWService",
                        "CreateCloudBaseGWAPI",
                        "DeleteCloudBaseGWAPI",
                        "ModifyCloudBaseGWAPI",
                        "DeleteCloudBaseGWDomain",
                        "BindCloudBaseGWDomain",
                        "BindCloudBaseAccessDomain"

                    ];

                    if (tcbCapiForbidList.includes(action)) {
                        throw new Error(`${service}/${action} Cloud API is not exposed or does not exist. Please use another API.`);
                    }
                }
            }

            const result = await cloudbase.commonService(service).call({
                Action: action,
                Param: params ?? {},
            });
            logCloudBaseResult(logger, result);

            return toMCPResponse(successResult(
                result,
                `成功调用 ${service}/${action} API`
                // No nextActions - generic API call, result is complete
            ));
        },
    );
}

