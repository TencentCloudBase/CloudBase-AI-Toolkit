import { createHash } from "node:crypto";
import { t } from "../i18n/index.js";
import { AUTO_ANSWER_THRESHOLD_MS, CONFIRMATION_TIMEOUT_MS } from "./confirmation-guard.js";
import { isFormElicitationSupported, requestChoiceElicitation } from "./elicitation.js";
import { debug } from "./logger.js";
import { isSkippedByList, parseSkipList } from "./skip-list.js";

/**
 * 凭证形态入参的**执行前软确认**（与 #1153 的破坏性确认并列，先于它执行）。
 *
 * 定位：**服务端不判凭证对错**，只在"参数里出现凭证形态字符串"时，要求客户端拿这串与它自己那份
 * 原始来源做一次**真实的**比对确认；确认过了才写。
 *
 * 为什么不做验签：真实 case（公开 issue #1156）里那串是**用户先粘进客户端/对话、模型再转写进参数**的，
 * 「用户原始提供的那份」服务端永远拿不到——能做比对的只有客户端。所以验签是用最难的方式解错题。
 *
 * 三条设计取舍：
 *   1. **零网络**：本模块不发任何网络请求，只做本地浅扫描 + 走既有 elicitation 通道。
 *   2. **消息里不放明文**：只给长度、分段长度、指纹（sha256 前 12 位）。这三样同样是凭证派生数据，
 *      **不得进日志/遥测**。
 *   3. **秒回一律不算"人的核对"**：`< AUTO_ANSWER_THRESHOLD_MS` 的应答 ⇒ 不写。⚠️ 这与 #1153
 *      的默认语义相反（那边把秒回当"客户端替你放行"）——凭证场景里秒回在物理上不可能包含任何
 *      人工比对动作，所以必须翻过来。
 *   4. **客户端不支持表单 elicitation ⇒ 放行**（软设计不许把普通用户整个封死；#1153 的 P0 就是
 *      栽在"拦死"这一类上）。
 */

/** 跳过清单的环境变量名（与 #1153 的清单同形：逗号分隔、`工具名` 或 `工具名.action`、区分大小写、无通配） */
export const CREDENTIAL_GUARD_SKIP_ENV_NAME = "CLOUDBASE_MCP_SKIP_CREDENTIAL_GUARD";

/** 扫描上限：只扫字符串值，避免大参数树拖慢 */
const MAX_DEPTH = 8;
const MAX_ARRAY_ITEMS = 500;

/** 三段式凭证（JWT）：`header.payload.signature`，三段均为 base64url */
const JWT_PATTERN = /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

/** 不透明密钥形态：`cb_secret_…` / `cb_publishable_…` */
const OPAQUE_KEY_PATTERN = /^cb_(secret|publishable)_[A-Za-z0-9_-]+$/;

export type CredentialKind = "jwt" | "opaque-key";

export type CredentialCandidate = {
    /** 命中的 JSON 路径（仅键名，**不含值**），用于日志定位 */
    path: string;
    /** 命中的字符串值（仅在本模块内部流转，绝不外泄） */
    value: string;
    kind: CredentialKind;
};

/** 一次调用的终态。`confirmed` 之外的都意味着"不执行 handler"。 */
export type CredentialGuardStatus =
    | "not_applicable"
    | "skipped"
    | "unsupported"
    | "confirmed"
    | "instant"
    | "cancelled"
    | "timeout"
    | "error";

/** 包装层只需要知道两件事：要不要拦、以及拦下时返回什么 */
export type CredentialGuardDecision =
    | { intercept: false; status: CredentialGuardStatus }
    | {
          intercept: true;
          status: CredentialGuardStatus;
          result: {
              content: Array<{ type: "text"; text: string }>;
              structuredContent: Record<string, unknown>;
          };
      };

export type CredentialGuardServer = {
    server?: {
        getClientCapabilities?: () => unknown;
        elicitInput?: (params: any, options?: any) => Promise<any>;
    };
    cloudBaseOptions?: { envId?: string };
    ide?: string;
    client?: string;
};

function classify(value: string): CredentialKind | undefined {
    if (JWT_PATTERN.test(value)) {
        return "jwt";
    }
    if (OPAQUE_KEY_PATTERN.test(value)) {
        return "opaque-key";
    }
    return undefined;
}

/**
 * 保守扫描参数树，返回看起来像凭证的字符串（附 JSON 路径）。
 *
 * 只扫**字符串值**；深度上限 {@link MAX_DEPTH}、每个数组上限 {@link MAX_ARRAY_ITEMS}。
 * 没有任何网络调用 —— 没扫到凭证形态字符串时后续一切照旧、零额外开销。
 */
export function findCredentialCandidates(args: unknown): CredentialCandidate[] {
    const found: CredentialCandidate[] = [];
    walk(args, "", 0, found);
    return found;
}

function walk(node: unknown, path: string, depth: number, out: CredentialCandidate[]): void {
    if (depth > MAX_DEPTH || node === null || node === undefined) {
        return;
    }

    if (typeof node === "string") {
        const kind = classify(node);
        if (kind) {
            out.push({ path, value: node, kind });
        }
        return;
    }

    if (typeof node !== "object") {
        return;
    }

    if (Array.isArray(node)) {
        const limit = Math.min(node.length, MAX_ARRAY_ITEMS);
        for (let i = 0; i < limit; i += 1) {
            walk(node[i], `${path}[${i}]`, depth + 1, out);
        }
        return;
    }

    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        walk(value, path ? `${path}.${key}` : key, depth + 1, out);
    }
}

/**
 * 把凭证值折成可安全外发的摘要：总长度、分段长度（JWT 三段）、指纹（sha256 前 12 位十六进制）。
 *
 * ⚠️ 返回值**只能**进 elicitation 的 message（给客户端），**不得**进日志或遥测。
 */
function summarize(candidate: CredentialCandidate): {
    length: number;
    segments: string;
    fingerprint: string;
} {
    return {
        length: candidate.value.length,
        segments: candidate.value
            .split(".")
            .map((segment) => segment.length)
            .join(" / "),
        fingerprint: createHash("sha256").update(candidate.value).digest("hex").slice(0, 12),
    };
}

function readSkipEntries(): string[] {
    return parseSkipList(process.env[CREDENTIAL_GUARD_SKIP_ENV_NAME]);
}

/** 本次调用是否命中跳过清单（`工具名` 或 `工具名.action`） */
export function isCredentialGuardSkipped(toolName: string, actionKey?: string): boolean {
    return isSkippedByList(readSkipEntries(), toolName, actionKey);
}

function actionKeyOf(toolName: string, args: unknown): string {
    const action = (args as Record<string, unknown> | undefined)?.action;
    return typeof action === "string" && action.length > 0 ? `${toolName}.${action}` : toolName;
}

function blockedText(
    status: CredentialGuardStatus,
    actionKey: string,
    params: Record<string, string | number>,
): string {
    const keyByStatus = {
        instant: "credential.blocked.instant",
        cancelled: "credential.blocked.cancelled",
        timeout: "credential.blocked.timeout",
        error: "credential.blocked.error",
    } as const;
    const reasonKey = keyByStatus[status as keyof typeof keyByStatus] ?? "credential.blocked.error";
    return [
        t(reasonKey, params),
        t("credential.hint.release", { action: actionKey }),
        `[credential] status=${status} executed=false`,
    ].join("\n");
}

/**
 * 命中凭证形态时先做一次客户端核对再执行。返回 `intercept: true` 表示**不要执行**，
 * 把 `result` 原样返回给客户端。任何内部异常都不能让工具调用变成 MCP 错误。
 */
export async function guardCredentialWrite(
    server: CredentialGuardServer,
    params: { toolName: string; args: unknown; extra?: { requestId?: unknown } },
): Promise<CredentialGuardDecision> {
    const actionKey = actionKeyOf(params.toolName, params.args);

    if (isCredentialGuardSkipped(params.toolName, actionKey)) {
        debug("凭证护栏命中跳过清单，跳过核对", { tool: params.toolName, action: actionKey });
        return { intercept: false, status: "skipped" };
    }

    const candidates = findCredentialCandidates(params.args);
    if (candidates.length === 0) {
        return { intercept: false, status: "not_applicable" };
    }

    // 软设计：客户端不支持表单 elicitation 就放行（不把普通用户封死）。只记一条日志。
    let formCapable = false;
    try {
        formCapable = isFormElicitationSupported(server);
    } catch (error) {
        debug("读取 elicitation 能力失败，凭证护栏按不支持处理", {
            tool: params.toolName,
            error: error instanceof Error ? error.message : String(error),
        });
    }
    if (!formCapable) {
        debug("客户端不支持表单 elicitation，凭证核对放行", { tool: params.toolName, action: actionKey });
        return { intercept: false, status: "unsupported" };
    }

    // 只取第一处候选做摘要（消息里只给长度/分段长度/指纹三样，不放明文、不放计数）
    const candidate = candidates[0];
    const summary = summarize(candidate);
    const message =
        candidate.kind === "jwt"
            ? t("credential.message.confirmJwt", summary)
            : t("credential.message.confirmOpaque", { ...summary, kind: candidate.kind });

    const confirmLabel = t("credential.option.confirm");
    const cancelLabel = t("credential.option.cancel");

    debug("凭证形态命中，发起写入前核对", {
        tool: params.toolName,
        action: actionKey,
        kind: candidate.kind,
        path: candidate.path,
        candidates: candidates.length,
    });

    let outcome;
    try {
        outcome = await requestChoiceElicitation(server, {
            message,
            field: "confirm",
            options: [confirmLabel, cancelLabel],
            // 默认落在"取消"上：默认值就是"不写"
            defaultOption: cancelLabel,
            timeoutMs: CONFIRMATION_TIMEOUT_MS,
            context: {
                toolName: params.toolName,
                ide: server.ide,
                client: server.client,
                relatedRequestId: params.extra?.requestId as any,
                cloudBaseOptions: server.cloudBaseOptions,
            },
        });
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        return {
            intercept: true,
            status: "error",
            result: {
                content: [{ type: "text", text: blockedText("error", actionKey, { reason }) }],
                structuredContent: { status: "error", executed: false, tool: params.toolName },
            },
        };
    }

    const instant = outcome.durationMs < AUTO_ANSWER_THRESHOLD_MS;

    // 只有"人真的比对过"才算数：确认 + 非秒回
    if (outcome.status === "accepted" && outcome.value === confirmLabel && !instant) {
        debug("凭证核对通过，放行写入", { tool: params.toolName, action: actionKey, durationMs: outcome.durationMs });
        return { intercept: false, status: "confirmed" };
    }

    const block = (status: CredentialGuardStatus, extraParams: Record<string, string | number> = {}) => ({
        intercept: true as const,
        status,
        result: {
            content: [{ type: "text" as const, text: blockedText(status, actionKey, extraParams) }],
            structuredContent: { status, executed: false, tool: params.toolName },
        },
    });

    if (outcome.status === "timeout") {
        return block("timeout", { seconds: Math.round(CONFIRMATION_TIMEOUT_MS / 1000) });
    }

    if (outcome.status === "unsupported") {
        // 客户端能力在核对过程中丢失：按"不支持"放行（软设计），而不是拦下
        debug("核对过程中客户端能力不可用，凭证核对放行", { tool: params.toolName, action: actionKey });
        return { intercept: false, status: "unsupported" };
    }

    if (outcome.status === "error") {
        return block("error", { reason: outcome.reason ?? "unknown" });
    }

    // 秒回（含"秒回同意"）⇒ 没有任何人类参与核对 ⇒ 不写。⚠️ 与 #1153 的默认语义相反。
    if (instant) {
        return block("instant", { durationMs: outcome.durationMs });
    }

    if (outcome.status === "accepted" || outcome.status === "declined") {
        return block("cancelled", { durationMs: outcome.durationMs });
    }

    return block("error", { reason: outcome.reason ?? "unknown" });
}
