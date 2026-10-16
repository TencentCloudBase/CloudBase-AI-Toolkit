import type { RequestId } from "@modelcontextprotocol/sdk/types.js";
import { getCachedEnvId } from "../cloudbase-manager.js";
import { t } from "../i18n/index.js";
import { isFormElicitationSupported, requestChoiceElicitation } from "./elicitation.js";
import { destructiveConfirmationKeys, resolveDestructiveAction } from "./destructive-actions.js";
import { debug } from "./logger.js";
import { isSkippedByList, parseSkipList } from "./skip-list.js";

/**
 * 破坏性动作的**执行前确认**（护栏，不是安全边界）。
 *
 * 定位：让一次不可逆的删除，在执行前变成一次看得见的选择。三条设计取舍：
 *
 *   1. **客户端没声明 form 能力 ⇒ 不弹、照常执行**（不阻塞、不降级成聊天里的二次询问）。
 *   2. **客户端自行应答（< 500ms）不算「人的决定」**：用户把客户端设成完全访问/不询问，本身就是在说
 *      "别问我"，拦住他等于替他做决定。这类应答按"未询问"放行，可用
 *      `CLOUDBASE_MCP_ELICIT_AUTO_APPROVE=block` 反过来拦下。判据是耗时，不是 `action` 的值。
 *   3. **被拦下时返回正常结果**（`isError` 不置位、`structuredContent` 里不放 `success`）：
 *      标成失败会让客户端渲染成出错、模型可能自动重试同一个删除。注意包装层会把
 *      `structuredContent.success === false` 自动标成 MCP 错误（见 tool-result.ts），所以这里不能带 `success`。
 *
 * 首次接线点：`tool-wrapper.ts` 的 `createWrappedHandler`（全部工具的唯一必经之路）。
 */

/** 确认窗口：必须窄于客户端的请求超时（60s），否则窗口会先被客户端关掉 */
export const CONFIRMATION_TIMEOUT_MS = 45_000;

/** 客户端自行应答的临界值。实测：客户端自行应答 0~2ms，人读完文案点按钮约 1s 以上 */
export const AUTO_ANSWER_THRESHOLD_MS = 500;

/** 逗号分隔的跳过清单：可写 `工具名` 或 `工具名.action`，区分大小写，无通配 */
export const SKIP_ENV_NAME = "CLOUDBASE_MCP_SKIP_ELICITATIONS";

/** 客户端自行应答时是否放行：`allow`（默认）/ `block` */
export const AUTO_APPROVE_ENV_NAME = "CLOUDBASE_MCP_ELICIT_AUTO_APPROVE";

export type ConfirmationStatus =
    | "not_applicable"
    | "accepted"
    | "auto_approved"
    | "auto_approved_blocked"
    | "skipped"
    | "unsupported"
    | "cancelled"
    | "timeout"
    | "error";

/** 包装层只需要知道两件事：要不要拦、以及拦下时返回什么 */
export type GuardDecision =
    | { intercept: false; status: ConfirmationStatus }
    | {
          intercept: true;
          status: ConfirmationStatus;
          result: {
              content: Array<{ type: "text"; text: string }>;
              structuredContent: Record<string, unknown>;
          };
      };

export type ConfirmationServer = {
    server?: {
        getClientCapabilities?: () => unknown;
        elicitInput?: (params: any, options?: any) => Promise<any>;
    };
    cloudBaseOptions?: { envId?: string };
    ide?: string;
    client?: string;
};

let warnedSkipEntries = false;

/**
 * 跳过清单的合法取值：名单内的工具名，或 `工具名.action`。
 * 未知取值**显式告警但只告警一次** —— 静默忽略会让用户以为已经关掉了。
 * （不做成启动即退出：一个拼错的变量名不该让整个 MCP 服务不可用。）
 */
function knownSkipNames(): Set<string> {
    const names = new Set<string>();
    for (const key of destructiveConfirmationKeys()) {
        names.add(key);
        names.add(key.slice(0, key.indexOf(".")));
    }
    return names;
}

export function readSkipList(): string[] {
    const entries = parseSkipList(process.env[SKIP_ENV_NAME]);
    const known = knownSkipNames();
    const unknown = entries.filter((entry) => !known.has(entry));
    if (unknown.length > 0 && !warnedSkipEntries) {
        warnedSkipEntries = true;
        console.error(
            `[cloudbase-mcp] ${SKIP_ENV_NAME} 含无法识别的条目，已忽略：${unknown.join(", ")}。` +
                `合法取值（区分大小写、无通配）：${[...known].sort().join(", ")}`,
        );
    }
    return entries;
}

/** 本次调用是否需要跳过确认 */
export function isSkipped(actionKey: string): boolean {
    const toolName = actionKey.slice(0, actionKey.indexOf("."));
    return isSkippedByList(readSkipList(), toolName, actionKey);
}

/** 客户端自行应答时是否放行；取值非法时告警并回落默认（放行） */
export function readAutoApprovePolicy(): "allow" | "block" {
    const raw = (process.env[AUTO_APPROVE_ENV_NAME] || "allow").trim().toLowerCase();
    if (raw === "allow" || raw === "block") {
        return raw;
    }
    console.error(
        `[cloudbase-mcp] ${AUTO_APPROVE_ENV_NAME} 只接受 allow / block，收到 "${raw}"，按 allow 处理。`,
    );
    return "allow";
}

function resolveEnvId(server: ConfirmationServer): string {
    const fromOptions = server.cloudBaseOptions?.envId;
    if (typeof fromOptions === "string" && fromOptions.length > 0) {
        return fromOptions;
    }
    try {
        return getCachedEnvId() ?? t("confirmation.message.unknownEnv");
    } catch {
        return t("confirmation.message.unknownEnv");
    }
}

function blockedText(
    status: ConfirmationStatus,
    actionKey: string,
    targetInfo: { resource: string; envId: string },
    params: Record<string, string | number>,
): string {
    const keyByStatus = {
        cancelled: "confirmation.blocked.cancelled",
        timeout: "confirmation.blocked.timeout",
        error: "confirmation.blocked.error",
        auto_approved_blocked: "confirmation.blocked.autoApprovedBlocked",
    } as const;
    const reasonKey = keyByStatus[status as keyof typeof keyByStatus] ?? "confirmation.blocked.error";
    return [
        t(reasonKey, params),
        t("confirmation.blocked.target", targetInfo),
        t("confirmation.hint.release", { action: actionKey }),
        `[elicit] status=${status} executed=false`,
    ].join("\n");
}

/**
 * 命中名单时先确认再执行。返回 `intercept: true` 表示**不要执行**，把 `result` 原样返回给客户端。
 * 任何内部异常都不能让工具调用失败：出错时按"未执行"处理（不同错误，也不放行）。
 */
export async function guardDestructiveAction(
    server: ConfirmationServer,
    params: { toolName: string; args: unknown; extra?: { requestId?: RequestId } },
): Promise<GuardDecision> {
    const resolved = resolveDestructiveAction(params.toolName, params.args);
    if (!resolved) {
        return { intercept: false, status: "not_applicable" };
    }
    const { key, spec } = resolved;

    if (isSkipped(key)) {
        debug("破坏性动作命中跳过清单，按不确认执行", { tool: params.toolName, action: key });
        return { intercept: false, status: "skipped" };
    }

    // 客户端没声明 form 能力 ⇒ 不弹、照常执行（绝不阻塞）。
    // 能力读取本身异常时同样按"不支持"处理：这时候也没法弹，但绝不能因此让工具调用失败。
    let formCapable = false;
    try {
        formCapable = isFormElicitationSupported(server);
    } catch (error) {
        debug("读取 elicitation 能力失败，按不支持处理", {
            tool: params.toolName,
            error: error instanceof Error ? error.message : String(error),
        });
    }
    if (!formCapable) {
        return { intercept: false, status: "unsupported" };
    }

    const confirmLabel = t("confirmation.option.confirm");
    const cancelLabel = t("confirmation.option.cancel");
    const target = spec.target((params.args ?? {}) as Record<string, unknown>);
    const targetInfo = {
        resource: target.resource ?? t("confirmation.message.unknownResource"),
        envId: resolveEnvId(server),
    };

    let outcome;
    try {
        outcome = await requestChoiceElicitation(server, {
            message: t(target.messageKey ?? spec.messageKey, {
                resource: targetInfo.resource,
                ...(typeof target.count === "number" ? { count: target.count } : {}),
                envId: targetInfo.envId,
            }),
            field: "confirm",
            // 受控选项：客户端只能回这两个值之一（不接受自由文本，见 MCP 规范 MUST NOT）
            options: [confirmLabel, cancelLabel],
            // 默认落在"取消"上：默认值就是"不执行"
            defaultOption: cancelLabel,
            timeoutMs: CONFIRMATION_TIMEOUT_MS,
            context: {
                toolName: params.toolName,
                ide: server.ide,
                client: server.client,
                relatedRequestId: params.extra?.requestId,
                cloudBaseOptions: server.cloudBaseOptions,
            },
        });
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        return {
            intercept: true,
            status: "error",
            result: {
                content: [{ type: "text", text: blockedText("error", key, targetInfo, { reason }) }],
                structuredContent: { status: "error", executed: false, tool: params.toolName },
            },
        };
    }

    // 表单里选了"确认"才算同意
    if (outcome.status === "accepted" && outcome.value === confirmLabel) {
        debug("破坏性动作已确认", { tool: params.toolName, action: key, durationMs: outcome.durationMs });
        return { intercept: false, status: "accepted" };
    }

    /** 拦下并给出说明；`durationMs` 只用于把"你点的取消"和"自动审批被拦"区分开 */
    const block = (status: ConfirmationStatus, extraParams: Record<string, string | number> = {}) => ({
        intercept: true as const,
        status,
        result: {
            content: [{ type: "text" as const, text: blockedText(status, key, targetInfo, extraParams) }],
            structuredContent: { status, executed: false, tool: params.toolName },
        },
    });

    // 客户端**填了表单**却选了取消 ⇒ 按取消处理。回得再快也不改变"它明确回了取消"这件事。
    if (outcome.status === "accepted") {
        return block("cancelled", { durationMs: outcome.durationMs, reason: "form_returned_cancel_option" });
    }

    // 只有"没带内容的 decline/cancel"才适用"即时应答＝客户端处于不询问模式"这条规则
    if (outcome.status === "declined") {
        const instant = outcome.durationMs < AUTO_ANSWER_THRESHOLD_MS;
        if (instant && readAutoApprovePolicy() === "allow") {
            debug("客户端自行应答，按未询问放行", {
                tool: params.toolName,
                action: key,
                durationMs: outcome.durationMs,
            });
            return { intercept: false, status: "auto_approved" };
        }
        return instant
            ? block("auto_approved_blocked", { durationMs: outcome.durationMs })
            : block("cancelled", { durationMs: outcome.durationMs, reason: outcome.reason });
    }

    if (outcome.status === "timeout") {
        return block("timeout", { seconds: Math.round(CONFIRMATION_TIMEOUT_MS / 1000) });
    }

    // 其余（error / 回值不在选项内 / elicitInput 不可用）一律不放行
    return block("error", { reason: outcome.reason ?? "unknown" });
}
