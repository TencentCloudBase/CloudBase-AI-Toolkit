import { z } from "zod";
import { getCloudBaseManager, logCloudBaseResult } from "../cloudbase-manager.js";
import { TCB_ACTION_INDEX_MAP } from "../generated/tcb-action-index.js";
import { t } from "../i18n/index.js";
import { ExtendedMcpServer } from "../server.js";

const CATEGORY = "cloud-api";
const CLOUDBASE_CONTROL_PLANE_DOC_URL = "https://cloud.tencent.com/document/product/876/34809";
const CLOUDBASE_DEPENDENCY_API_DOC_URL = "https://cloud.tencent.com/document/product/876/34808";

export const ALLOWED_SERVICES = [
    "tcb",
    "tcbr",
    "scf",
    "sts",
    "cam",
    "lowcode",
    "cdn",
    "vpc",
    "monitor",
    "postgres",
] as const;

type AllowedService = (typeof ALLOWED_SERVICES)[number];

/**
 * Legacy tcb small-tenant CloudRun (CloudBase Run) API family — blocked.
 *
 * CloudRun must use tcbr (CreateCloudRunEnv / CreateCloudRunServer). tcb
 * CreateCloudBaseRunResource is the 2018 small-tenant open API and is no longer
 * publicly listed; calling it on an env without a large-tenant record creates
 * wrong small-tenant services/versions (user incident 2026-08-13; ATO research
 * efec7cc5). Describe/Delete of the same family are blocked too. Matching is
 * case-insensitive so Action casing variants cannot bypass the check.
 */
const TCB_CLOUDRUN_FORBIDDEN_ACTIONS = [
    "CreateCloudBaseRunResource",
    "DescribeCloudBaseRunResource",
    "DeleteCloudBaseRunResource",
] as const;

const TCB_CLOUDRUN_FORBIDDEN_ACTIONS_LOWER = new Set(
    TCB_CLOUDRUN_FORBIDDEN_ACTIONS.map((name) => name.toLowerCase()),
);

function buildTcbCloudRunForbiddenHint(): string {
    return t("capi.tcbForbiddenHint", {
        actions: TCB_CLOUDRUN_FORBIDDEN_ACTIONS.join(" / "),
    });
}

/**
 * Reject legacy tcb small-tenant CloudRun APIs; throw with tcbr guidance when blocked.
 */
export function assertTcbCloudRunActionAllowed(service: string, action: string): void {
    if (service === "tcb" && TCB_CLOUDRUN_FORBIDDEN_ACTIONS_LOWER.has(action.toLowerCase())) {
        throw new Error(
            t("capi.tcbForbiddenPrefix", {
                service,
                action,
                hint: buildTcbCloudRunForbiddenHint(),
            }),
        );
    }
}

export function resolveCloudApiRegionAndParams(args: {
    region?: string;
    params?: Record<string, any>;
}): { region?: string; params: Record<string, any> } {
    const raw = { ...(args.params ?? {}) };
    const nestedRegion =
        typeof raw.Region === "string" && raw.Region.trim()
            ? raw.Region.trim()
            : typeof raw.region === "string" && raw.region.trim()
                ? raw.region.trim()
                : undefined;
    delete raw.Region;
    delete raw.region;
    const region =
        (typeof args.region === "string" && args.region.trim()
            ? args.region.trim()
            : undefined) || nestedRegion;
    return { region, params: raw };
}

function levenshteinDistance(left: string, right: string) {
    const rows = left.length + 1;
    const cols = right.length + 1;
    const matrix = Array.from({ length: rows }, () => Array(cols).fill(0));

    for (let row = 0; row < rows; row += 1) {
        matrix[row][0] = row;
    }
    for (let col = 0; col < cols; col += 1) {
        matrix[0][col] = col;
    }

    for (let row = 1; row < rows; row += 1) {
        for (let col = 1; col < cols; col += 1) {
            const substitutionCost = left[row - 1] === right[col - 1] ? 0 : 1;
            matrix[row][col] = Math.min(
                matrix[row - 1][col] + 1,
                matrix[row][col - 1] + 1,
                matrix[row - 1][col - 1] + substitutionCost,
            );
        }
    }

    return matrix[left.length][right.length];
}

/**
 * Remove empty string parameters from the params object.
 * Tencent Cloud APIs reject empty strings for required parameters like StartTime/EndTime.
 */
export function removeEmptyStringParams(params: Record<string, any>): Record<string, any> {
    const cleaned: Record<string, any> = {};
    for (const [key, value] of Object.entries(params)) {
        if (value !== "") {
            cleaned[key] = value;
        }
    }
    return cleaned;
}

function findTcbActionEntry(action: string) {
    if (TCB_ACTION_INDEX_MAP[action]) {
        return TCB_ACTION_INDEX_MAP[action];
    }

    const normalizedAction = action.toLowerCase();
    return Object.values(TCB_ACTION_INDEX_MAP).find(
        (entry) => entry.action.toLowerCase() === normalizedAction,
    );
}

function suggestTcbActions(action: string, limit = 3) {
    const normalizedAction = action.toLowerCase();

    return Object.values(TCB_ACTION_INDEX_MAP)
        .map((entry) => {
            const normalizedCandidate = entry.action.toLowerCase();
            let score = levenshteinDistance(normalizedAction, normalizedCandidate);

            if (normalizedCandidate.startsWith(normalizedAction)) {
                score -= 3;
            }
            if (normalizedCandidate.includes(normalizedAction)) {
                score -= 2;
            }
            if (normalizedAction.startsWith(normalizedCandidate)) {
                score -= 1;
            }

            return { entry, score };
        })
        .sort((left, right) => {
            if (left.score !== right.score) {
                return left.score - right.score;
            }
            return left.entry.action.localeCompare(right.entry.action);
        })
        .slice(0, limit)
        .map(({ entry }) => entry.action);
}

function formatTcbParamKeys(keys: string[]) {
    return keys.map((item: string) => `\`${item}\``).join("、");
}

function formatTcbParamsTypeHint(action: string) {
    const entry = findTcbActionEntry(action);
    if (!entry) {
        return undefined;
    }

    return `参数类型参考：\n\`\`\`ts\n${entry.paramsType}\n\`\`\``;
}

function buildCapiDocGuidance(service: AllowedService) {
    if (service === "tcb" || service === "tcbr" || service === "lowcode" || service === "scf") {
        return `优先查阅 CloudBase API 概览 ${CLOUDBASE_CONTROL_PLANE_DOC_URL} 与云开发依赖资源接口指引 ${CLOUDBASE_DEPENDENCY_API_DOC_URL}。`;
    }

    if (service === "monitor") {
        return `请优先核对云监控（腾讯云可观测平台）官方 API 文档：API 概览 https://cloud.tencent.com/document/product/649/30343 ，单 Action 详细文档在 https://cloud.tencent.com/document/api/248/ 产品线下。`;
    }

    return `请优先核对对应官方云 API 文档；若你的场景其实是通过 HTTP 协议直接集成 auth/functions/cloudrun/storage/mysqldb 等 CloudBase 业务 API，请优先使用 OpenAPI / Swagger 或 searchKnowledgeBase(mode="openapi")，不要继续猜测管控面 Action。`;
}

/** Match CAM / authorization failures from Tencent Cloud control-plane APIs. */
export const CAM_AUTH_ERROR_PATTERN =
    /UnauthorizedOperation|AuthFailure|not authorized|cam.*denied|Forbidden/i;

/**
 * Guidance when control-plane calls fail due to CAM / API Key scope limits.
 * Shared by callCloudApi and manageCloudRun error builders.
 */
export function buildCamAuthGuidance(): string {
    return t("capi.camAuthGuidance");
}

export function isCamAuthError(message: string): boolean {
    return CAM_AUTH_ERROR_PATTERN.test(message);
}

export function buildCapiErrorMessage(service: AllowedService, action: string, error: unknown): string {
    const baseMessage = error instanceof Error ? error.message : String(error);
    const suggestions: string[] = [];
    const tcbEntry = service === "tcb" ? findTcbActionEntry(action) : undefined;
    const hasInvalidActionError = /invalid or not found|does not exist|not recognized/i.test(baseMessage);
    const hasParameterError = /parameter\s+`?.+?`?\s+is not recognized|MissingParameter|missing parameter|missing required/i.test(baseMessage);
    const hasInvalidParameterValueError = /invalid parameter value/i.test(baseMessage);
    const hasCamAuthError = isCamAuthError(baseMessage);

    if (hasCamAuthError) {
        suggestions.push(buildCamAuthGuidance());
    }

    if (hasInvalidActionError) {
        suggestions.push(
            t("capi.errorInvalidAction", { action, service }),
        );
        if (service === "tcb") {
            const candidates = suggestTcbActions(action);
            if (candidates.length > 0) {
                suggestions.push(t("capi.errorSuggestedActions", { candidates: candidates.map((item) => `\`${item}\``).join("、") }));
            }
        }
        suggestions.push(buildCapiDocGuidance(service));
    }

    if (/parameter\s+`?Region`?\s+is not recognized/i.test(baseMessage)) {
        suggestions.push(t("capi.errorRegionParam"));
    }

    if (hasParameterError) {
        suggestions.push(t("capi.errorParameterMismatch"));
        if (service === "tcb" && tcbEntry) {
            const paramHint = [
                tcbEntry.paramKeys.length > 0
                    ? t("capi.errorParamKeys", { keys: formatTcbParamKeys(tcbEntry.paramKeys) })
                    : "",
                tcbEntry.requiredKeys.length > 0
                    ? t("capi.errorRequiredKeys", { keys: formatTcbParamKeys(tcbEntry.requiredKeys) })
                    : "",
            ].filter(Boolean);
            if (paramHint.length > 0) {
                suggestions.push(t("capi.errorTcbEntryHint", { action: tcbEntry.action, paramHint: paramHint.join("；") }));
            }
            const paramsTypeHint = formatTcbParamsTypeHint(tcbEntry.action);
            if (paramsTypeHint) {
                suggestions.push(paramsTypeHint);
            }
        }
    }

    if (hasInvalidParameterValueError) {
        suggestions.push(t("capi.errorInvalidValueIntro"));
        suggestions.push(t("capi.errorInvalidValue1"));
        suggestions.push(t("capi.errorInvalidValue2"));
        suggestions.push(t("capi.errorInvalidValue3"));
        suggestions.push(t("capi.errorInvalidValue4"));
        if (service === "tcb" && tcbEntry) {
            const paramsTypeHint = formatTcbParamsTypeHint(tcbEntry.action);
            if (paramsTypeHint) {
                suggestions.push(t("capi.errorInvalidValueTypeIntro"));
                suggestions.push(paramsTypeHint);
            }
        }
    }

    if (/ECONNRESET|socket hang up|ETIMEDOUT|ENOTFOUND/i.test(baseMessage)) {
        suggestions.push(t("capi.errorNetwork"));
    }

    if (suggestions.length === 0) {
        suggestions.push(`${t("capi.errorGenericFallback")}${buildCapiDocGuidance(service)}`);
        if (service === "tcb" && tcbEntry && tcbEntry.paramKeys.length > 0) {
            suggestions.push(t("capi.errorTcbEntryHintKeys", { action: tcbEntry.action, keys: formatTcbParamKeys(tcbEntry.paramKeys) }));
            const paramsTypeHint = formatTcbParamsTypeHint(tcbEntry.action);
            if (paramsTypeHint) {
                suggestions.push(paramsTypeHint);
            }
        }
    }

    return t("capi.errorBuild", {
        service,
        action,
        baseMessage,
        suggestions: suggestions.join(" "),
        controlPlaneUrl: CLOUDBASE_CONTROL_PLANE_DOC_URL,
        dependencyUrl: CLOUDBASE_DEPENDENCY_API_DOC_URL,
    });
}

/**
 * Register Common Service based Cloud API tool.
 * The tool is intentionally generic; callers must read project rules or
 * skills to ensure correct API usage before invoking.
 */
export function registerCapiTools(server: ExtendedMcpServer) {
    const cloudBaseOptions = server.cloudBaseOptions;
    const logger = server.logger;
    // commonService 透传调用只依赖凭据上下文（secretId/secretKey/token/region），
    // EnvId 由 params 携带，不依赖 MCP 绑定的环境。强制绑定会在「已登录但未绑环境」
    // 场景把 DescribeEnvs/CreateEnv/CAM 等无 env 依赖的 Action 全部挡在 ENV_REQUIRED，
    // 并诱发无头客户端原样重试风暴（2026-08-20 单日 15 万次报错），故豁免环境绑定。
    const getManager = () => getCloudBaseManager({ cloudBaseOptions, requireEnvId: false });

    server.registerTool?.(
        "callCloudApi",
        {
            title: "capi.title",
            description: "capi.description",
            inputSchema: {
                service: z
                    .enum(ALLOWED_SERVICES)
                    .describe(
                        "选择要访问的服务。可选：tcb、tcbr、scf、sts、cam、lowcode、cdn、vpc、monitor（云监控/告警，version 需传 2018-07-24）、postgres（云数据库 PostgreSQL，version 需传 2017-03-12）。对于 tcb / scf / lowcode 等 CloudBase 管控面 Action，请优先查官方文档，不要直接猜测 Action。云托管统一走 tcbr（version 需传 2022-02-17）。",
                    ),
                action: z
                    .string()
                    .min(1)
                    .describe("具体 Action 名称，需符合对应服务的官方 API 定义。若不确定正确 Action，请先查官方文档；不要用近义词或历史命名进行猜测。tcb 常用 Action：环境管理 CreateEnv/ModifyEnv/DescribeEnvs/DestroyEnv、用户管理 CreateUser/ModifyUser/DescribeUserList/DeleteUsers、认证配置 EditAuthConfig、云函数 DescribeFunctions/CreateFunction、数据库 CreateMySQLInstance 等。tcbr 常用 Action：CreateCloudRunEnv（初始化云托管）、DescribeEnvBaseInfo（查询单个环境基础信息，EnvId 必填）、DescribeCloudRunEnvs（查询环境列表/资源信息，EnvId 可选过滤）、CreateCloudRunServer/DescribeCloudRunServers。"),
                version: z
                    .string()
                    .optional()
                    .describe("API 版本（可选）。缺省时按 service 使用 SDK 内置默认版本；tcbr 必须传 \"2022-02-17\"（否则请求缺少 X-TC-Version 会失败），monitor 必须传 \"2018-07-24\"、postgres 必须传 \"2017-03-12\"（这两个 service 无内置默认版本，不传会失败）。示例：service=\"tcbr\", version=\"2022-02-17\", action=\"CreateCloudRunEnv\", params={EnvId:\"env-xxx\",PackageType:\"Standard\"}。"),
                params: z
                    .record(z.any())
                    .optional()
                    .describe(
                        "Action 对应的参数对象，键名需与官方 API 定义一致。某些 Action 需要携带 EnvId 等信息；如不确定参数结构，请先查官方文档。tcb 示例：`{ \"service\": \"tcb\", \"action\": \"DestroyEnv\", \"params\": { \"EnvId\": \"env-xxx\", \"BypassCheck\": true } }`，如果环境已经处于隔离期，可再补 `IsForce: true`；更新环境别名则可用 `{ \"service\": \"tcb\", \"action\": \"ModifyEnv\", \"params\": { \"EnvId\": \"env-xxx\", \"Alias\": \"demo\" } }`。不要把 Region 放进 params（会报 The parameter Region is not recognized）；跨地域请用顶层 region，例如 `{ \"service\": \"tcb\", \"action\": \"DescribeEnvs\", \"region\": \"ap-singapore\" }`。若你的场景是通过 HTTP 协议直接集成 auth/functions/cloudrun/storage/mysqldb 等 CloudBase 业务 API，请优先使用 OpenAPI / Swagger 或 searchKnowledgeBase(mode=\"openapi\")，而不是优先使用 callCloudApi。",
                    ),
                region: z
                    .string()
                    .optional()
                    .describe(
                        "云 API 地域（X-TC-Region）。例如 ap-shanghai、ap-guangzhou、ap-singapore。DescribeEnvs 等接口按地域查询，跨地域必须传此顶层参数，不要写入 params.Region。⚠️ ap-singapore 同时属于国内站与国际站，未显式指定站点时会被判定为国际站（site=intl）：若你要操作的是国内站的 ap-singapore 环境，请先用 auth(action=\"start_auth\"|\"login_by_api_key\", site=\"domestic\") 或设置 TCB_SITE=domestic 明确站点，否则请求会静默打到国际站账号。",
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
            version,
            region,
        }: {
            service: AllowedService;
            action: string;
            params?: Record<string, any>;
            version?: string;
            region?: string;
        }) => {
            if (!ALLOWED_SERVICES.includes(service)) {
                throw new Error(
                    `Service ${service} is not allowed. Allowed services: ${ALLOWED_SERVICES.join(", ")}`,
                );
            }

            assertTcbCloudRunActionAllowed(service, action);

            const { region: resolvedRegion, params: bodyParams } =
                resolveCloudApiRegionAndParams({ region, params });
            const cloudbase = await getCloudBaseManager({
                cloudBaseOptions: resolvedRegion
                    ? { ...cloudBaseOptions, region: resolvedRegion }
                    : cloudBaseOptions,
            });
            if (['1', 'true'].includes(process.env.CLOUDBASE_EVALUATE_MODE ?? '')) {
                if (service === 'lowcode') {
                    throw new Error(t("capi.evalModeNotExposed", { service, action }));
                }
                if (service === 'tcb') {
                    const tcbCapiForbidList = [
                        // Cloud APIs not clearly public
                        'DescribeStorageACL', 'ModifyStorageACL', 'DescribeSecurityRule',
                        // Legacy small-tenant CloudRun open/query/delete (no longer public; also blocked by assertTcbCloudRunActionAllowed)
                        "CreateCloudBaseRunResource",
                        "DescribeCloudBaseRunResource",
                        "DeleteCloudBaseRunResource",

                        // Cloud APIs scheduled for retirement
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
                        throw new Error(t("capi.evalModeNotExposed", { service, action }));
                    }
                }
            }

            let result: unknown;
            try {
                const cleanedParams = removeEmptyStringParams(bodyParams);
                result = await cloudbase.commonService(service, version).call({
                    Action: action,
                    Param: cleanedParams,
                });
            } catch (error) {
                throw new Error(buildCapiErrorMessage(service, action, error));
            }
            logCloudBaseResult(logger, result);

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(
                            result,
                            null,
                            2,
                        ),
                    },
                ],
            };
        },
    );
}
