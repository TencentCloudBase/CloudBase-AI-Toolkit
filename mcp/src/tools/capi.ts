import { z } from "zod";
import { getCloudBaseManager, logCloudBaseResult } from "../cloudbase-manager.js";
import { TCB_ACTION_INDEX_MAP } from "../generated/tcb-action-index.js";
import { t } from "../i18n/index.js";
import { ExtendedMcpServer } from "../server.js";

const CATEGORY = "cloud-api";
const CLOUDBASE_CONTROL_PLANE_DOC_URL = "https://cloud.tencent.com/document/product/876/34809";
const CLOUDBASE_DEPENDENCY_API_DOC_URL = "https://cloud.tencent.com/document/product/876/34808";

/**
 * 支持的 service 白名单 + 官方 API 版本映射。
 *
 * **这是枚举白名单**：`service` 只接受下表里的产品标识，其余取值（对象存储 COS 这类
 * 不在云 API 体系内的产品、以及任何拼写错误）在请求出网前就被 schema 拦下。
 *
 * 数组语义：
 * - **一个元素**：该产品官方只有一个在用的 API 版本，调用时 `version` 可省略，自动使用该值；
 * - **多个元素**：该产品有多个仍在用的官方版本，**必须显式传 `version`** —— 缺省会报错并列出
 *   可选项，而不是替你猜一个（猜错会表现为「Action 不存在」，很难排查）。
 *
 * 版本号来源：官方 SDK 目录 `tencentcloud/<service>/v<YYYYMMDD>`。
 * 新增 service 时补一行 + 跑 `pnpm test`（`capi.test.ts` 会校验枚举与表的对应关系）。
 */
export const SERVICE_VERSIONS: Readonly<Record<string, readonly string[]>> = {
    // 云开发 / 管控面
    tcb: ["2018-06-08"],
    tcbr: ["2022-02-17"],
    scf: ["2018-04-16"],
    sts: ["2018-08-13"],
    cam: ["2019-01-16"],
    cloudaudit: ["2019-03-19"],
    tag: ["2018-08-13"],
    billing: ["2018-07-09"],
    region: ["2022-06-27"],
    // 计算 / 容器 / 存储
    cvm: ["2017-03-12"],
    lighthouse: ["2020-03-24"],
    tke: ["2018-05-25", "2022-05-01"],
    cbs: ["2017-03-12"],
    cfs: ["2019-07-19"],
    tcr: ["2019-09-24"],
    // 数据库
    cdb: ["2017-03-20"],
    mariadb: ["2017-03-12"],
    postgres: ["2017-03-12"],
    sqlserver: ["2018-03-28"],
    redis: ["2018-04-12"],
    mongodb: ["2018-04-08", "2019-07-25"],
    cynosdb: ["2019-01-07"],
    dcdb: ["2018-04-11"],
    tcaplusdb: ["2019-08-23"],
    keewidb: ["2022-03-08"],
    // 网络 / 域名 / 证书
    vpc: ["2017-03-12"],
    clb: ["2018-03-17"],
    cdn: ["2018-06-06"],
    ecdn: ["2019-10-12"],
    dnspod: ["2021-03-23"],
    privatedns: ["2020-10-28"],
    domain: ["2018-08-08"],
    ssl: ["2019-12-05"],
    teo: ["2022-01-06", "2022-09-01"],
    gaap: ["2018-05-29"],
    // 安全
    kms: ["2019-01-18"],
    ssm: ["2019-09-23"],
    waf: ["2018-01-25"],
    cwp: ["2018-02-28"],
    tcss: ["2020-11-01"],
    // 中间件 / 消息
    ckafka: ["2019-08-19"],
    tdmq: ["2020-02-17"],
    tdmysql: ["2021-11-22"],
    apigateway: ["2018-08-08"],
    // 可观测 / 运维
    monitor: ["2018-07-24", "2023-06-16"],
    cls: ["2020-10-16"],
    apm: ["2021-06-22"],
    tsf: ["2018-03-26"],
    tat: ["2020-10-28"],
    // AI / 音视频
    hunyuan: ["2023-09-01"],
    lkeap: ["2024-05-22"],
    tts: ["2019-08-23"],
    trtc: ["2019-07-22"],
    live: ["2018-08-01"],
    vod: ["2018-07-17", "2024-07-18"],
    // 通信
    sms: ["2019-07-11", "2021-01-11"],
    ses: ["2020-10-02"],
};

/** 白名单取值，直接作为工具 schema 的枚举。 */
export const ALLOWED_SERVICES = Object.keys(SERVICE_VERSIONS) as [string, ...string[]];

/** 有多个在用官方版本、因此必须显式传 version 的 service。 */
const MULTI_VERSION_SERVICES = Object.entries(SERVICE_VERSIONS)
    .filter(([, versions]) => versions.length > 1)
    .map(([name]) => name);

/**
 * 未收录 service 的命名指引。枚举已经拦掉这些取值，这段只在直接用函数调用时兜底。
 */
const SERVICE_NAMING_HINT =
    `service 必须与官方 SDK 目录名一致（tencentcloud/<service>/v<YYYYMMDD>），部分产品的标识与中文名不同 —— ` +
    `云数据库 MySQL 是 \`cdb\`、日志服务是 \`cls\`、DNS 解析是 \`dnspod\`、证书是 \`ssl\`；` +
    `对象存储 COS 走独立 XML API，不在云 API 体系内。需要新增产品请补 \`SERVICE_VERSIONS\` 白名单。`;

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

/**
 * Resolve the API version for a service.
 *
 * - 显式传入的 version 永远优先；
 * - 白名单里只有一个官方版本的 service（绝大多数）缺省时自动补上，不必让调用方记版本号；
 * - 多版本 service 缺省时直接报错并列出可选项 —— 替你猜一个会造成「版本错配被服务端
 *   报成 Action 不存在」，比报错难排查得多。
 * - 不在白名单内的 service 直接拒绝（正常路径下 schema 已经拦掉，这里兜直接调用）。
 */
export function resolveServiceVersion(service: string, version?: string): string {
    if (version) {
        return version;
    }

    const versions = SERVICE_VERSIONS[service];
    if (!versions) {
        throw new Error(
            `service \`${service}\` 不在支持列表内。当前支持：${ALLOWED_SERVICES.join("、")}。${SERVICE_NAMING_HINT}`,
        );
    }

    if (versions.length === 1) {
        return versions[0];
    }

    throw new Error(
        `[${service}] 缺少 version：该 service 有多个在用的官方 API 版本（${versions.join("、")}），` +
            `必须显式传 version，否则无法判断你要调用的 Action 属于哪一版。`,
    );
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

function buildCapiDocGuidance(service: string) {
    if (service === "tcb" || service === "tcbr" || service === "scf") {
        return `优先查阅 CloudBase API 概览 ${CLOUDBASE_CONTROL_PLANE_DOC_URL} 与云开发依赖资源接口指引 ${CLOUDBASE_DEPENDENCY_API_DOC_URL}。`;
    }

    if (service === "monitor") {
        return `请优先核对云监控（腾讯云可观测平台）官方 API 文档：API 概览 https://cloud.tencent.com/document/product/649/30343 ，单 Action 详细文档在 https://cloud.tencent.com/document/api/248/ 产品线下。`;
    }

    const versions = SERVICE_VERSIONS[service];
    if (versions) {
        return `请对照 \`${service}\`（官方版本 ${versions.join(" / ")}）的官方 API 文档核对 Action 与参数：腾讯云 API 文档 https://cloud.tencent.com/document/api ，SDK 源码 tencentcloud/${service}/v<YYYYMMDD>。`;
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

export function buildCapiErrorMessage(service: string, action: string, error: unknown): string {
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
        suggestions.push(t("capi.errorNetwork", { service }));
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
            // ⚠️ 不能写成 `description: "capi.description"`（纯词典 key）：注册包装层解析
            // key 时**不带插值参数**，而 {controlPlaneUrl}/{dependencyUrl} 只在错误路径
            // （下方 t("capi.errorBuild", …)）传入 → 描述里的占位符永远替换不了，
            // tools/list 在 zh 与 en 下都会吐字面 `{controlPlaneUrl}`。
            // 因此这里按实例语言先解析成最终文案（与 env.ts 的 envQuery 别名同款处理）。
            description: t(
                "capi.description",
                {
                    controlPlaneUrl: CLOUDBASE_CONTROL_PLANE_DOC_URL,
                    dependencyUrl: CLOUDBASE_DEPENDENCY_API_DOC_URL,
                },
                server.lang,
            ),
            inputSchema: {
                service: z
                    .enum(ALLOWED_SERVICES)
                    .describe(
                        `腾讯云产品标识，**取值只能来自本字段的 enum 白名单（共 ${ALLOWED_SERVICES.length} 个）**，决定请求域名 https://<service>.tencentcloudapi.com。名单外的取值一律拒绝，不要臆造；COS 不在云 API 体系内。产品名与 Action 对照见 skill cloud-api-operations。云托管统一走 tcbr。`,
                    ),
                action: z
                    .string()
                    .min(1)
                    .describe("具体 Action 名称，需符合对应服务的官方 API 定义。**不确定时先查官方文档，不要用近义词或历史命名猜测**（猜错会被服务端报成 action invalid，很难排查）。常用 Action 见 skill cloud-api-operations。"),
                version: z
                    .string()
                    .optional()
                    .describe(
                        `API 版本（多数场景可省略）。白名单里**只有一个官方版本的产品会自动补齐**，不必传；` +
                            `以下多版本产品必须显式传，缺省会报错并列出可选项：${MULTI_VERSION_SERVICES.join("、")}。` +
                            `示例：service="tcbr", version="2022-02-17", action="CreateCloudRunEnv", params={EnvId:"env-xxx",PackageType:"Standard"}；` +
                            `service="monitor" 需显式传 "2018-07-24"（告警策略族 Action 属于该版本）。`,
                    ),
                params: z
                    .record(z.any())
                    .optional()
                    .describe(
                        "Action 对应的参数对象，键名与官方 API 定义一致，不确定时先查文档。**不要把 Region 放这里**，跨地域用顶层 region。CloudBase 业务 API 请优先用 searchKnowledgeBase(mode=\"openapi\")，不要用本工具。示例见 skill cloud-api-operations。",
                    ),
                region: z
                    .string()
                    .optional()
                    .describe(
                        "云 API 地域（X-TC-Region），如 ap-shanghai。跨地域必须传此顶层参数，不要写进 params。⚠️ ap-singapore 同属国内站与国际站，未指定站点按国际站（site=intl）处理：要操作国内站该地域环境，先 auth(action=\"start_auth\", site=\"domestic\") 或设 TCB_SITE=domestic。",
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
            service: string;
            action: string;
            params?: Record<string, any>;
            version?: string;
            region?: string;
        }) => {
            const resolvedVersion = resolveServiceVersion(service, version);

            assertTcbCloudRunActionAllowed(service, action);

            const { region: resolvedRegion, params: bodyParams } =
                resolveCloudApiRegionAndParams({ region, params });
            const cloudbase = await getCloudBaseManager({
                cloudBaseOptions: resolvedRegion
                    ? { ...cloudBaseOptions, region: resolvedRegion }
                    : cloudBaseOptions,
            });
            if (['1', 'true'].includes(process.env.CLOUDBASE_EVALUATE_MODE ?? '')) {
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
                result = await cloudbase.commonService(service, resolvedVersion).call({
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
