import type { RequestId } from "@modelcontextprotocol/sdk/types.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { debug } from "./logger.js";
import {
    extractClientCapabilities,
    reportElicitationResult,
    type McpClientCapabilities,
    type McpClientInfo,
} from "./telemetry.js";

/**
 * 表单式 elicitation 的发起 + 结果上报（specs/mcp-adoption-levers 需求 5 / 任务 16）。
 *
 * 协议上两条硬约束，决定了这里的形状：
 *   1. **服务端不能主动发起 elicitation**，只能在**处理某次在途请求时**请求输入
 *      ⇒ 所以必须有 `relatedRequestId`（工具 handler 的 extra.requestId），不能"连上就弹"。
 *   2. **表单模式禁止收密码 / API key / token**（规范的 MUST NOT；凭据走 URL 模式）
 *      ⇒ 本模块只问「选择题」这一类非敏感输入。
 *
 * 上报口径（A4）：`requested` / `accepted` / `declined` / `timeout` / `unsupported` / `error`。
 * `unsupported` 与 `declined` 必须分开 —— 前者是「压根没弹」（客户端没声明能力），
 * 后者是「弹了但用户拒了」，两者处置完全不同。
 *
 * @todo 本模块**尚未接线**：发起方（挂在 `auth` 上，`specs/mcp-adoption-levers` 任务 10）
 *   属另一个改动项，落地前不会产生任何 `toolkit_elicitation` 事件。先落地它是因为
 *   埋点字段与事件形状是验收对象，且这段逻辑（能力判定 / 超时 / 四种终态 / 不抛错）
 *   与接线位置无关 —— 接线时只需要一次调用 + 一个回退分支。
 */

/** 默认超时：规范建议交互 ≤3~5 步且必须有超时，避免把工具调用挂死 */
export const ELICITATION_DEFAULT_TIMEOUT_MS = 60_000;

export type ChoiceOutcome =
    | { status: 'accepted'; value: string }
    | { status: 'declined' | 'timeout' | 'unsupported' | 'error'; reason: string };

export type ElicitationContext = {
    /** 发起 elicitation 的工具名（如 auth） */
    toolName?: string;
    ide?: string;
    client?: string;
    mcpClientInfo?: McpClientInfo;
    cloudBaseOptions?: any;
    /** 在途请求 id：协议要求 elicitation 与某次请求关联 */
    relatedRequestId?: RequestId;
};

type ElicitationCapableServer = {
    server?: {
        getClientCapabilities?: () => unknown;
        elicitInput?: (params: any, options?: any) => Promise<any>;
    };
};

/**
 * 客户端是否声明了表单式 elicitation。
 * 空 `{}` 在 SDK 里会被预处理成 `{ form: {} }`，所以这里只认 `elicitationForm`。
 */
export function isFormElicitationSupported(server: ElicitationCapableServer): boolean {
    const caps = extractClientCapabilities(server?.server?.getClientCapabilities?.());
    return Boolean(caps?.elicitationForm);
}

/** 只读取能力，不触发调用；供工具在拼返回内容时决定走表单还是走文本 */
export function readCapabilitiesForElicitation(
    server: ElicitationCapableServer,
): McpClientCapabilities | undefined {
    return extractClientCapabilities(server?.server?.getClientCapabilities?.());
}

/**
 * 发一次单选表单，并把结果上报。**任何失败都不抛错**（降级由调用方决定），
 * 返回值只描述发生什么，便于调用方回退到文本引导。
 */
export async function requestChoiceElicitation(
    server: ElicitationCapableServer,
    params: {
        message: string;
        /** 字段名（上报用，同时是回传的 key） */
        field: string;
        options: string[];
        defaultOption?: string;
        timeoutMs?: number;
        context?: ElicitationContext;
    },
): Promise<ChoiceOutcome> {
    const { message, field, options, defaultOption, context } = params;
    const timeoutMs = params.timeoutMs ?? ELICITATION_DEFAULT_TIMEOUT_MS;
    const report = (phase: Parameters<typeof reportElicitationResult>[0]['phase'], extra: {
        durationMs?: number;
        value?: string;
        error?: string;
    } = {}) =>
        reportElicitationResult({
            phase,
            field,
            optionCount: options.length,
            toolName: context?.toolName,
            ide: context?.ide,
            client: context?.client,
            mcpClientInfo: context?.mcpClientInfo,
            cloudBaseOptions: context?.cloudBaseOptions,
            mcpClientCapabilities: readCapabilitiesForElicitation(server),
            ...extra,
        }).catch(() => undefined);

    if (!isFormElicitationSupported(server)) {
        await report('unsupported');
        return { status: 'unsupported', reason: 'client_declares_no_form_elicitation' };
    }

    const elicitInput = server?.server?.elicitInput;
    if (typeof elicitInput !== 'function') {
        await report('error', { error: 'elicitInput_unavailable' });
        return { status: 'error', reason: 'elicitInput_unavailable' };
    }

    await report('requested');
    const startedAt = Date.now();

    try {
        const result = await elicitInput(
            {
                mode: 'form',
                message,
                // 单选题：字段类型是 string + enum。**不放 password 类字段**（规范禁止）。
                requestedSchema: {
                    type: 'object',
                    properties: {
                        [field]: {
                            type: 'string',
                            enum: options,
                            ...(defaultOption ? { default: defaultOption } : {}),
                        },
                    },
                    required: [field],
                },
            },
            {
                // 与在途请求关联；同时给 SDK 一个超时，避免悬挂的 elicitation 拖住会话
                ...(context?.relatedRequestId !== undefined
                    ? { relatedRequestId: context.relatedRequestId }
                    : {}),
                timeout: timeoutMs,
            },
        );

        const durationMs = Date.now() - startedAt;
        const action = result?.action;

        if (action === 'accept') {
            const raw = result?.content?.[field];
            const value = typeof raw === 'string' ? raw : '';
            if (!options.includes(value)) {
                // 客户端回了个不在选项里的值：协议用法有误，按 error 上报而不是当成功
                await report('error', { durationMs, error: `unexpected_value:${value.slice(0, 40)}` });
                return { status: 'error', reason: 'unexpected_value' };
            }
            await report('accepted', { durationMs, value });
            return { status: 'accepted', value };
        }

        if (action === 'decline' || action === 'cancel') {
            // cancel 也归到 declined（用户没作答），原始动作放 error 里保留可区分性
            await report('declined', { durationMs, error: action === 'cancel' ? 'cancel' : undefined });
            return { status: 'declined', reason: action };
        }

        await report('error', { durationMs, error: `unexpected_action:${String(action).slice(0, 40)}` });
        return { status: 'error', reason: `unexpected_action:${String(action)}` };
    } catch (err) {
        const durationMs = Date.now() - startedAt;
        const isTimeout = err instanceof McpError && err.code === ErrorCode.RequestTimeout;
        if (isTimeout) {
            await report('timeout', { durationMs });
            return { status: 'timeout', reason: `no_answer_within_${timeoutMs}ms` };
        }
        const reason = err instanceof Error ? err.message : String(err);
        debug('elicitation 失败，调用方应回退到文本引导', { field, error: reason });
        await report('error', { durationMs, error: reason });
        return { status: 'error', reason };
    }
}
