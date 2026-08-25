import { z } from "zod";
import { getCloudBaseManager } from "../cloudbase-manager.js";
import { ExtendedMcpServer } from "../server.js";
import {
  CloudApiRequestFn,
  MsgPushAction,
  MsgPushQbaseResponse,
} from "../types.js";
import { buildJsonToolResult } from "../utils/tool-result.js";

const CATEGORY = "消息推送";

/** 消息推送 qbase CGI 对应的 Cloud API service 名（宿主按后端契约确认） */
const MSG_PUSH_SERVICE = "qbase";
/** 消息推送 Cloud API version（宿主按后端契约确认） */
const MSG_PUSH_VERSION = "2018-06-08";

/**
 * 虚拟支付默认事件集合。
 * manageMessagePush(action=subscribe) 未传 event_types 时默认订阅这 7 个事件。
 */
export const XPAY_EVENT_TYPES = [
  "xpay_goods_deliver_notify",
  "xpay_coin_pay_notify",
  "xpay_complaint_notify",
  "xpay_subscribe_signing_result_notify",
  "xpay_subscribe_pay_fail_notify",
  "xpay_subscribe_ios_refund_query_notify",
  "xpay_refund_notify",
] as const;

/** 配置不存在的业务码（getappconfig 返回该码时视为空配置） */
const RET_CONFIG_NOT_EXISTS = 80209;
/**
 * uploadappconfig version 乐观锁冲突业务码（实测：用旧 version 覆盖写返回 ret=80208）。
 * Prefer structured ret over errmsg regex; regex remains a fallback.
 */
const RET_VERSION_CONFLICT = 80208;
/** 消息推送条目类型（虚拟支付回调等事件均为 event） */
const MSG_TYPE_EVENT = "event";
/**
 * manageMessagePush 可操作的消息类型。
 * - event：事件类（需 event_types；event 字段为具体事件名）
 * - text/image/voice/video/miniprogrampage：消息类型条目（event 固定空串 ""）
 */
export const MSG_TYPES = [
  "event",
  "text",
  "image",
  "voice",
  "video",
  "miniprogrampage",
] as const;
export type MsgType = (typeof MSG_TYPES)[number];
/** Empty event field for non-event message-type callback entries */
const EMPTY_EVENT = "";

/** 单条消息推送回调配置（对应 uploadappconfig.config.callbacks 条目） */
export interface CallbackEntry {
  msgType: string;
  event: string;
  env: string;
  functionName: string;
  enable?: boolean;
}

/** getappconfig 解析后的消息推送配置状态 */
export interface CallbackConfigState {
  version: number;
  enable: boolean;
  list: CallbackEntry[];
}

/** getcallbacksupportlist 返回的合法事件约束 */
export interface SupportedEventConstraint {
  msgType: string;
  event?: string;
}

/** 消息推送 merge 结果（声明式期望集合，对齐 kubectl apply 幂等语义） */
export interface MergeResult {
  list: CallbackEntry[];
  changed: boolean;
  added: string[];
  rebound: string[];
  removed: string[];
  matched: string[];
}

/** qbase CGI 业务错误（code 为 ret 或内部错误码） */
export class QbaseError extends Error {
  code: number | string;
  constructor(code: number | string, message: string) {
    super(message);
    this.name = "QbaseError";
    this.code = code;
  }
}

function canonicalEntry(entry: CallbackEntry): string {
  return JSON.stringify([
    entry.msgType,
    entry.event,
    entry.env,
    entry.functionName,
    entry.enable ?? false,
  ]);
}

function sameCallbackList(a: CallbackEntry[], b: CallbackEntry[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = a.map(canonicalEntry).sort();
  const sortedB = b.map(canonicalEntry).sort();
  return sortedA.every((v, i) => v === sortedB[i]);
}

/**
 * subscribe 幂等 merge：对每个目标事件，
 * - 已存在完全相同 (msgType, event, env, functionName) 的条目 → 保留原条目（含 enable，幂等）
 * - 该事件已绑定到其他云函数 → 移除旧条目并重绑到目标函数（一事一函数）；重绑保留原 enable
 * - 全新事件条目 → 默认 enable=true
 * 未变化时 changed=false，调用方跳过 POST。
 */
export function mergeSubscribeList(
  current: CallbackEntry[],
  targets: string[],
  envId: string,
  functionName: string,
  msgType = MSG_TYPE_EVENT,
): MergeResult {
  const uniqueTargets = [...new Set(targets)];
  const kept: CallbackEntry[] = [];
  const keptEvents = new Set<string>();
  const rebound: string[] = [];
  /** enable to preserve when rebinding an existing event onto a different function */
  const reboundEnableByEvent = new Map<string, boolean>();

  for (const entry of current) {
    if (entry.msgType === msgType && uniqueTargets.includes(entry.event)) {
      if (entry.env === envId && entry.functionName === functionName) {
        if (keptEvents.has(entry.event)) {
          continue; // 防御：同事件重复条目只保留一条
        }
        keptEvents.add(entry.event);
        kept.push(entry);
      } else {
        rebound.push(entry.event);
        if (!reboundEnableByEvent.has(entry.event)) {
          reboundEnableByEvent.set(entry.event, entry.enable ?? false);
        }
      }
    } else {
      kept.push(entry);
    }
  }

  const added: string[] = [];
  for (const target of uniqueTargets) {
    const exists = kept.some(
      (e) =>
        e.msgType === msgType &&
        e.event === target &&
        e.env === envId &&
        e.functionName === functionName,
    );
    if (!exists) {
      // Rebound keeps prior enable; brand-new events default to enabled
      const enable = reboundEnableByEvent.has(target)
        ? reboundEnableByEvent.get(target)!
        : true;
      kept.push({ msgType, event: target, env: envId, functionName, enable });
      added.push(target);
    }
  }

  return {
    list: kept,
    changed: !sameCallbackList(current, kept),
    added,
    rebound: [...new Set(rebound)],
    removed: [],
    matched: [],
  };
}

/**
 * unsubscribe merge：仅移除匹配 (msgType, event, env, functionName) 的条目，
 * 其他配置全部保留；无匹配条目时 changed=false（幂等 no-op）。
 */
export function mergeUnsubscribeList(
  current: CallbackEntry[],
  targets: string[],
  envId: string,
  functionName: string,
  msgType = MSG_TYPE_EVENT,
): MergeResult {
  const uniqueTargets = new Set(targets);
  const removed: string[] = [];
  const list = current.filter((entry) => {
    if (
      entry.msgType === msgType &&
      uniqueTargets.has(entry.event) &&
      entry.env === envId &&
      entry.functionName === functionName
    ) {
      removed.push(entry.event);
      return false;
    }
    return true;
  });

  return {
    list,
    changed: !sameCallbackList(current, list),
    added: [],
    rebound: [],
    removed: [...new Set(removed)],
    matched: [],
  };
}

/**
 * setEnable merge：翻转匹配条目的 enable 字段；无匹配条目或值未变化时 changed=false。
 */
export function mergeSetEnableList(
  current: CallbackEntry[],
  targets: string[],
  envId: string,
  functionName: string,
  enable: boolean,
  msgType = MSG_TYPE_EVENT,
): MergeResult {
  const uniqueTargets = new Set(targets);
  const matched: string[] = [];
  const list = current.map((entry) => {
    if (
      entry.msgType === msgType &&
      uniqueTargets.has(entry.event) &&
      entry.env === envId &&
      entry.functionName === functionName
    ) {
      matched.push(entry.event);
      if ((entry.enable ?? false) === enable) return entry;
      return { ...entry, enable };
    }
    return entry;
  });

  return {
    list,
    changed: !sameCallbackList(current, list),
    added: [],
    rebound: [],
    removed: [],
    matched: [...new Set(matched)],
  };
}

function getTransport(server: ExtendedMcpServer): CloudApiRequestFn | undefined {
  return server.cloudBaseOptions?.requestFn;
}

function parseConfigString(config: unknown): { enable: boolean; callbacks: CallbackEntry[] } {
  if (typeof config !== "string" || !config) {
    throw new QbaseError("PARSE_ERROR", "getappconfig 返回的 config 为空或非 JSON 字符串");
  }
  try {
    const parsed = JSON.parse(config);
    return {
      enable: parsed?.enable !== false,
      callbacks: Array.isArray(parsed?.callbacks) ? parsed.callbacks : [],
    };
  } catch (e) {
    throw new QbaseError(
      "PARSE_ERROR",
      `getappconfig 返回的 config 解析失败: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

/**
 * 经现有 CloudApiRequestFn（cloudBaseOptions.requestFn）领域语义调用 qbase CGI。
 * 与 databaseNoSQL/functions 完全一致：包内只表达 service/action/payload，不感知 URL；
 * 由宿主（微信 IDE）注入的 requestFn 负责路由到 wxa-dev-qbase/apihttpagent 并附加登录态。
 */
async function callQbase(
  server: ExtendedMcpServer,
  appid: string,
  action: MsgPushAction,
  payload: Record<string, unknown>,
): Promise<MsgPushQbaseResponse> {
  const requestFn = getTransport(server);
  if (!requestFn) {
    throw new QbaseError(
      "TRANSPORT_UNAVAILABLE",
      "未注入 Cloud API 请求通道（cloudBaseOptions.requestFn）",
    );
  }
  const service = server.pluginOptions?.msgPush?.service ?? MSG_PUSH_SERVICE;
  try {
    // Pass appid as a top-level optional field so hosts can select the correct
    // WeChat login session in multi-appid scenarios (additive, non-breaking).
    const result = await requestFn({
      service,
      action,
      version: MSG_PUSH_VERSION,
      region: "",
      payload,
      appid,
    });
    return (result ?? {}) as MsgPushQbaseResponse;
  } catch (e) {
    throw new QbaseError(
      "TRANSPORT_ERROR",
      `qbase 请求失败(${service}/${action}): ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

/** 读取当前消息推送配置（乐观锁：version + 全量列表） */
async function readCallbackConfig(
  server: ExtendedMcpServer,
  appid: string,
): Promise<CallbackConfigState> {
  const resp = await callQbase(server, appid, "getAppConfig", { type: 1 });
  const ret = resp.base_resp?.ret;
  if (ret !== undefined && ret !== 0) {
    if (ret === RET_CONFIG_NOT_EXISTS) {
      return { version: 0, enable: false, list: [] };
    }
    throw new QbaseError(
      ret,
      `getappconfig 失败(ret=${ret}): ${resp.base_resp?.errmsg ?? "未知错误"}`,
    );
  }
  const config = parseConfigString(resp.config);
  return {
    version: Number(resp.version ?? 0),
    enable: config.enable,
    list: config.callbacks,
  };
}

/** 读取合法事件约束列表 */
async function fetchSupportedEvents(
  server: ExtendedMcpServer,
  appid: string,
): Promise<SupportedEventConstraint[]> {
  const resp = await callQbase(server, appid, "getCallbackSupportList", {});
  const ret = resp.base_resp?.ret;
  if (ret !== undefined && ret !== 0) {
    throw new QbaseError(
      ret,
      `getcallbacksupportlist 失败(ret=${ret}): ${resp.base_resp?.errmsg ?? "未知错误"}`,
    );
  }
  const raw = resp.data;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed?.list) ? parsed.list : [];
    } catch {
      return [];
    }
  }
  if (typeof raw === "object" && raw !== null && Array.isArray((raw as any).list)) {
    return (raw as any).list;
  }
  return [];
}

/** 全量覆盖写入配置（带 version 乐观锁；冲突时抛 VERSION_CONFLICT） */
async function uploadCallbackConfig(
  server: ExtendedMcpServer,
  appid: string,
  state: CallbackConfigState,
): Promise<void> {
  const resp = await callQbase(server, appid, "uploadAppConfig", {
    type: 1,
    version: state.version,
    config: JSON.stringify({ enable: state.enable, callbacks: state.list }),
  });
  const ret = resp.base_resp?.ret;
  if (ret !== undefined && ret !== 0) {
    const errmsg = resp.base_resp?.errmsg ?? "";
    // Prefer structured ret (80208); fall back to errmsg regex for older/unknown backends
    const isVersionConflict =
      ret === RET_VERSION_CONFLICT || /version|版本|conflict|冲突/i.test(errmsg);
    if (isVersionConflict) {
      throw new QbaseError(
        "VERSION_CONFLICT",
        `uploadappconfig version 冲突（ret=${ret}，本地 version=${state.version}，服务端已被其他操作修改）: ${errmsg || "system error"}。` +
          `请重新调用 queryMessagePush(action=list) 获取最新配置后重试（RFC 7232 If-Match 语义：重读 → merge → 重试）。`,
      );
    }
    throw new QbaseError(
      ret,
      `uploadappconfig 失败(ret=${ret}): ${errmsg || "未知错误"}。请重新查询最新配置后重试。`,
    );
  }
}

interface ContainerCallbackConfig {
  qbase_open?: boolean;
  qbase_env?: string;
  qbase_container_path?: string;
  text_mode?: number;
  [key: string]: unknown;
}

/** Push mode derived from getContainerCallbackConfig.qbase_open */
export type MsgPushMode = "cloudfunction" | "container";

export function resolvePushMode(
  container: ContainerCallbackConfig | null | undefined,
): MsgPushMode {
  return container?.qbase_open === true ? "container" : "cloudfunction";
}

/** Public subset of container callback fields returned to agents */
export function pickContainerConfigPublic(
  container: ContainerCallbackConfig | null | undefined,
): {
  qbase_container_path?: string;
  qbase_env?: string;
  text_mode?: number;
  qbase_open?: boolean;
} | undefined {
  if (!container) return undefined;
  return {
    qbase_open: container.qbase_open === true,
    qbase_container_path:
      typeof container.qbase_container_path === "string"
        ? container.qbase_container_path
        : undefined,
    qbase_env:
      typeof container.qbase_env === "string" ? container.qbase_env : undefined,
    text_mode:
      typeof container.text_mode === "number" ? container.text_mode : undefined,
  };
}

const CONTAINER_MODE_BLOCK_NOTE =
  "当前为云托管模式（整包接收），云函数 callbacks 存在但不生效；如需云函数模式请调 ensureCloudFunctionMode 切换";

const CONTAINER_MODE_WRITE_ERROR =
  "当前 pushMode=container（云托管整包接收），云函数回调配置存在但不生效。" +
  "如需云函数模式请调 action=ensureCloudFunctionMode 切换。";

/** 读取云托管消息推送配置；无配置（云函数模式）返回 null */
async function readContainerConfig(
  server: ExtendedMcpServer,
  appid: string,
): Promise<ContainerCallbackConfig | null> {
  const resp = await callQbase(server, appid, "getContainerCallbackConfig", {});
  const ret = resp.base_resp?.ret;
  if (ret !== undefined && ret !== 0) {
    if (ret === RET_CONFIG_NOT_EXISTS) {
      return null;
    }
    throw new QbaseError(
      ret,
      `getcontainercallbackconfig 失败(ret=${ret}): ${resp.base_resp?.errmsg ?? "未知错误"}`,
    );
  }
  const { base_resp: _base, ...config } = resp;
  return config as ContainerCallbackConfig;
}

async function setContainerConfig(
  server: ExtendedMcpServer,
  appid: string,
  cfg: Record<string, unknown>,
): Promise<void> {
  const resp = await callQbase(server, appid, "setContainerCallbackConfig", cfg);
  const ret = resp.base_resp?.ret;
  if (ret !== undefined && ret !== 0) {
    throw new QbaseError(
      ret,
      `setcontainercallbackconfig 失败(ret=${ret}): ${resp.base_resp?.errmsg ?? "未知错误"}`,
    );
  }
}

function buildContainerModeBlockedPayload(action: string) {
  return buildJsonToolResult({
    ok: false,
    code: "CONTAINER_MODE_ACTIVE",
    pushMode: "container" as const,
    message: CONTAINER_MODE_WRITE_ERROR,
    next_step: {
      tool: "manageMessagePush",
      action: "ensureCloudFunctionMode",
      required_params: ["appid", "env_id", "function_name", "confirm"],
      hint: `先切换到云函数模式后再执行 ${action}`,
    },
  });
}

/**
 * Verify function_name exists in envId via optional host hook or CloudBase Manager list.
 * Returns an error tool result when missing / unreadable; null when OK.
 */
async function assertCloudFunctionExists(
  server: ExtendedMcpServer,
  envId: string,
  functionName: string,
): Promise<ReturnType<typeof buildJsonToolResult> | null> {
  const override = server.pluginOptions?.msgPush?.listCloudFunctions;
  let names: string[];
  try {
    if (override) {
      names = await override(envId);
    } else {
      const manager = await getCloudBaseManager({
        cloudBaseOptions: {
          ...(server.cloudBaseOptions ?? {}),
          envId,
        },
      });
      const result = await manager.functions.getFunctionList(100, 0);
      names = (result.Functions ?? [])
        .map((f: { FunctionName?: string }) => f.FunctionName)
        .filter((n: string | undefined): n is string => !!n);
    }
  } catch (e) {
    return buildJsonToolResult({
      ok: false,
      code: "FUNCTION_LOOKUP_FAILED",
      message:
        `无法校验云函数是否存在于环境 ${envId}：${e instanceof Error ? e.message : String(e)}。` +
        `请确认已登录腾讯云开发并绑定该环境后重试，或先用 queryFunctions(action=listFunctions) 核对。`,
      next_step: {
        tool: "queryFunctions",
        action: "listFunctions",
        hint: "确认云函数列表后再 subscribe",
      },
    });
  }
  if (!names.includes(functionName)) {
    return buildJsonToolResult({
      ok: false,
      code: "FUNCTION_NOT_FOUND",
      message: `云函数 ${functionName} 不存在于环境 ${envId}，请先创建或修正参数`,
      envId,
      function_name: functionName,
      next_step: {
        tool: "manageFunctions",
        action: "createFunction",
        required_params: ["functionName"],
      },
    });
  }
  return null;
}

function buildTransportUnavailablePayload(toolName: string, action?: string) {
  return buildJsonToolResult({
    ok: false,
    code: "MSG_PUSH_TRANSPORT_UNAVAILABLE",
    message:
      "消息推送配置依赖微信小程序云开发 qbase 管理接口（需要微信 IDE 登录态），" +
      "当前 CloudBase MCP 进程未注入 Cloud API 请求通道（cloudBaseOptions.requestFn），无法直连 qbase" +
      "（安全边界：腾讯云身份不可调用微信登录态 CGI）。\n" +
      "可用方案：\n" +
      "- 在微信开发者工具 MCP 中使用 cloud_msg_push_query / cloud_msg_push_manage（微信 IDE 已注入 qbase 通道）\n" +
      "- 或由宿主（微信 IDE）在 createCloudBaseMcpServer 时注入 cloudBaseOptions.requestFn，并在 pluginsEnabled 中启用 msg-push 插件",
    next_step: {
      tool: toolName,
      action,
      hint: "需在微信 IDE 登录态通道中调用",
    },
  });
}

function buildConfirmPayload({
  toolName,
  action,
  message,
  requiredParams,
}: {
  toolName: string;
  action: string;
  message: string;
  requiredParams: string[];
}) {
  return buildJsonToolResult({
    ok: false,
    code: "CONFIRM_REQUIRED",
    message:
      `${message}\n\n请核对后传入 confirm="yes" 确认执行；如需取消或修改，请勿传 confirm="yes"，改传其他参数重试。`,
    confirmation_acknowledgement: {
      text: "我已知晓并确认执行上述消息推送配置变更",
      required: true,
    },
    next_step: { tool: toolName, action, requiredParams },
  });
}

function buildInvalidEventPayload(action: string, invalid: string[]) {
  return buildJsonToolResult({
    ok: false,
    code: "INVALID_EVENT_TYPE",
    message:
      `${action} 包含不在合法约束内的事件：${invalid.join(", ")}。` +
      `请先调用 queryMessagePush(action=listSupportedEvents) 查询该小程序全部合法事件（含虚拟支付 7 个 xpay_* 事件），` +
      `确认事件名称后重试。`,
    invalid_events: invalid,
    next_step: {
      tool: "queryMessagePush",
      action: "listSupportedEvents",
      required_params: ["appid"],
    },
  });
}

function buildMergeDiffText(
  action: string,
  result: MergeResult,
  envId: string,
  functionName: string,
): string {
  const lines: string[] = [];
  if (action === "subscribe") {
    if (result.added.length) {
      lines.push(`- 新增订阅（${envId}/${functionName}）: ${result.added.join(", ")}`);
    }
    if (result.rebound.length) {
      lines.push(
        `- 重绑事件（原绑定其他云函数，按"一事一函数"约束改绑到 ${envId}/${functionName}）: ${result.rebound.join(", ")}`,
      );
    }
  } else if (action === "unsubscribe") {
    lines.push(`- 移除订阅（${envId}/${functionName}）: ${result.removed.join(", ")}`);
  } else if (action === "setEnable") {
    lines.push(
      `- ${result.matched.length ? "" : "未匹配到条目"}订阅状态变更（${envId}/${functionName}）: ${result.matched.join(", ")}`,
    );
  }
  return lines.join("\n");
}

export function registerMsgPushTools(server: ExtendedMcpServer) {
  const logger = server.logger;

  // ─── queryMessagePush（只读）───────────────────────────────────────────────
  server.registerTool?.(
    "queryMessagePush",
    {
      title: "查询小程序消息推送配置",
      description:
        "查询小程序云开发消息推送配置（qbase getappconfig）或全部合法消息推送事件约束（getcallbacksupportlist）。" +
        "推送模式有两种：云函数（默认，按 (msgType,event) 逐条回调）与云托管（qbase_open=true，整包接收所有消息到容器 path）。" +
        "action=list 同时返回 pushMode（cloudfunction|container）、containerConfig、callbacks 与 version；" +
        "云托管模式下 callbacks 可能仍存在但不生效（见 note），需 ensureCloudFunctionMode 切回云函数模式后才会按回调推送。" +
        "action=listSupportedEvents 返回全部合法约束（按消息类型分组）。" +
        "需要微信 IDE 登录态通道（宿主注入 cloudBaseOptions.requestFn）。",
      inputSchema: {
        appid: z
          .string()
          .describe("小程序 AppID（必填，与微信开发者工具一致；用于选择微信登录态会话）"),
        env: z.string().optional().describe("可选：环境 ID；传入时 list 仅返回该环境的订阅条目"),
        action: z
          .enum(["list", "listSupportedEvents"])
          .describe(
            "list: 查询当前消息推送配置列表（含 pushMode/containerConfig）\nlistSupportedEvents: 查询全部合法消息推送事件约束（按 msgType 分组）",
          ),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
        category: CATEGORY,
      },
    },
    async ({ appid, env, action }: { appid: string; env?: string; action: string }) => {
      if (!getTransport(server)) {
        return buildTransportUnavailablePayload("queryMessagePush", action);
      }
      if (action === "list") {
        const [state, container] = await Promise.all([
          readCallbackConfig(server, appid),
          readContainerConfig(server, appid),
        ]);
        const pushMode = resolvePushMode(container);
        const callbacks = env
          ? state.list.filter((c) => c.env === env)
          : state.list;
        return buildJsonToolResult({
          ok: true,
          success: true,
          message: "查询消息推送配置成功",
          version: state.version,
          enable: state.enable,
          pushMode,
          containerConfig: pickContainerConfigPublic(container),
          callbacks,
          note: pushMode === "container" ? CONTAINER_MODE_BLOCK_NOTE : undefined,
          filteredByEnv: env ?? undefined,
          next_steps:
            pushMode === "container"
              ? [
                  "当前为云托管模式：云函数 subscribe/unsubscribe/setEnable 会被拒绝",
                  "manageMessagePush(action=ensureCloudFunctionMode) 切回云函数模式",
                  "manageMessagePush(action=setContainerCallback) 更新云托管 path/env/text_mode",
                ]
              : [
                  "manageMessagePush(action=subscribe) 订阅事件（缺省 event_types 时默认订阅虚拟支付 7 事件）",
                  "manageMessagePush(action=ensureContainerMode) 切换到云托管整包接收",
                  "queryMessagePush(action=listSupportedEvents) 查看全部合法事件",
                ],
        });
      }
      if (action === "listSupportedEvents") {
        const constraints = await fetchSupportedEvents(server, appid);
        const grouped: Array<{ msgType: string; events: string[] }> = [];
        const byMsgType = new Map<string, string[]>();
        for (const c of constraints) {
          // Ensure every msgType appears (message types like text have empty event)
          if (!byMsgType.has(c.msgType)) {
            byMsgType.set(c.msgType, []);
          }
          if (c.event) {
            byMsgType.get(c.msgType)!.push(c.event);
          }
        }
        for (const [msgType, events] of byMsgType) {
          grouped.push({ msgType, events });
        }
        const supportedSet = new Set(
          constraints.filter((c) => c.event).map((c) => c.event),
        );
        const xpaySupported = XPAY_EVENT_TYPES.filter((e) => supportedSet.has(e));
        const xpayMissing = XPAY_EVENT_TYPES.filter((e) => !supportedSet.has(e));
        return buildJsonToolResult({
          ok: true,
          success: true,
          message: "获取合法消息推送事件约束成功",
          msgTypes: grouped,
          totalEvents: supportedSet.size,
          xpay_default_events: {
            supported: xpaySupported,
            missing: xpayMissing,
            hint: xpayMissing.length
              ? "以下默认事件不在当前小程序合法约束中（可能未开通虚拟支付），订阅时服务端可能拒绝"
              : undefined,
          },
          hint:
            "manageMessagePush 的 event_types 仅接受上述合法事件；subscribe 缺省 event_types 时默认订阅虚拟支付 7 事件。" +
            "消息类型条目（text/image/voice/video/miniprogrampage，events 为空数组）请用 manageMessagePush(msg_type=...) 管理，无需 event_types。",
        });
      }
      throw new Error(`不支持的操作类型: ${action}`);
    },
  );

  // ─── manageMessagePush（写，需确认）────────────────────────────────────────
  server.registerTool?.(
    "manageMessagePush",
    {
      title: "管理小程序消息推送配置",
      description:
        "管理小程序云开发消息推送配置（写操作，需 confirm=\"yes\" 确认）。" +
        "推送模式：云函数（默认，按 (msgType,event) 回调）vs 云托管（整包接收；云托管模式下 subscribe/unsubscribe/setEnable 会被拒绝，先 ensureCloudFunctionMode）。" +
        "基于「读全量 → merge → 全量覆盖（带 version 乐观锁）」实现声明式幂等。" +
        "msg_type 缺省 \"event\"；消息类型用 msg_type=text|image|voice|video|miniprogrampage。" +
        "action=subscribe 前会校验 function_name 在环境中真实存在。" +
        "action=ensureCloudFunctionMode 关闭云托管整包接收；action=ensureContainerMode 开启云托管（需 qbase_container_path/qbase_env/text_mode）；" +
        "action=setContainerCallback 更新云托管 path/env/text_mode。" +
        "集合无变化时不发起写请求（幂等 no-op）。需要微信 IDE 登录态通道。",
      inputSchema: {
        appid: z
          .string()
          .describe("小程序 AppID（必填，与微信开发者工具一致；用于选择微信登录态会话）"),
        env_id: z
          .string()
          .describe(
            "环境 ID（云函数订阅绑定的云开发环境；ensureContainerMode/setContainerCallback 未传 qbase_env 时也可作为云托管环境默认值）",
          ),
        function_name: z
          .string()
          .describe(
            "接收消息推送的云函数名（subscribe/unsubscribe/setEnable/ensureCloudFunctionMode 使用；云托管相关 action 可传占位）",
          ),
        action: z
          .enum([
            "subscribe",
            "unsubscribe",
            "setEnable",
            "ensureCloudFunctionMode",
            "ensureContainerMode",
            "setContainerCallback",
          ])
          .describe(
            "subscribe: 订阅到指定云函数（云托管模式下拒绝）\n" +
              "unsubscribe: 移除匹配订阅（云托管模式下拒绝）\n" +
              "setEnable: 启用/停用匹配订阅（云托管模式下拒绝）\n" +
              "ensureCloudFunctionMode: 切到云函数推送模式（关闭 qbase_open）\n" +
              "ensureContainerMode: 切到云托管整包接收（需 qbase_container_path + text_mode）\n" +
              "setContainerCallback: 更新云托管回调 path/env/text_mode",
          ),
        msg_type: z
          .enum(MSG_TYPES)
          .optional()
          .describe(
            '消息类型（缺省 "event"）。' +
              '"event"：事件类条目，需配合 event_types（subscribe 可缺省=虚拟支付 7 事件）。' +
              '"text"|"image"|"voice"|"video"|"miniprogrampage"：消息类型条目（event 固定空串），勿传 event_types。',
          ),
        event_types: z
          .array(z.string())
          .optional()
          .describe(
            "要操作的事件列表（仅 msg_type=\"event\" 时使用；可先 queryMessagePush(action=listSupportedEvents) 查询全量约束）。" +
              "subscribe 缺省时默认订阅虚拟支付 7 个事件；unsubscribe / setEnable 且 msg_type=event 时必填。",
          ),
        enable: z.boolean().optional().describe("setEnable 时必填：true 启用订阅 / false 停用订阅"),
        qbase_container_path: z
          .string()
          .optional()
          .describe(
            "云托管回调路径/URL（ensureContainerMode 必填；setContainerCallback 可选更新）",
          ),
        qbase_env: z
          .string()
          .optional()
          .describe(
            "云托管服务所在环境 ID（ensureContainerMode/setContainerCallback 可选；缺省用 env_id）",
          ),
        text_mode: z
          .union([z.literal(1), z.literal(2)])
          .optional()
          .describe(
            "云托管消息正文编码：1=json，2=xml（ensureContainerMode 必填；setContainerCallback 可选更新）",
          ),
        confirm: z
          .string()
          .optional()
          .describe(
            '写操作确认：确认执行请传 confirm="yes"；不传或传其他值将返回待确认的配置摘要（CONFIRM_REQUIRED），核对后再重试。集合无变化时无需确认。',
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
        category: CATEGORY,
      },
    },
    async ({
      appid,
      env_id,
      function_name,
      action,
      msg_type,
      event_types,
      enable,
      qbase_container_path,
      qbase_env,
      text_mode,
      confirm,
    }: {
      appid: string;
      env_id: string;
      function_name: string;
      action: string;
      msg_type?: MsgType;
      event_types?: string[];
      enable?: boolean;
      qbase_container_path?: string;
      qbase_env?: string;
      text_mode?: 1 | 2;
      confirm?: string;
    }) => {
      if (!getTransport(server)) {
        return buildTransportUnavailablePayload("manageMessagePush", action);
      }
      const confirmed = confirm === "yes";
      const resolvedMsgType: MsgType = msg_type ?? MSG_TYPE_EVENT;
      const isEventMsgType = resolvedMsgType === MSG_TYPE_EVENT;

      if (action === "ensureCloudFunctionMode") {
        const current = await readContainerConfig(server, appid);
        if (!current || current.qbase_open === false) {
          return buildJsonToolResult({
            ok: true,
            success: true,
            code: "NO_CHANGE",
            message: "当前已是云函数推送模式（云托管整包接收未开启），无需变更",
            pushMode: "cloudfunction",
            containerConfig: pickContainerConfigPublic(current),
          });
        }
        if (!confirmed) {
          return buildConfirmPayload({
            toolName: "manageMessagePush",
            action,
            message:
              `切换后停止云托管整包接收（qbase_open=false），消息按云函数回调推送；若 callbacks 为空则收不到任何消息。\n` +
              `当前云托管配置：环境 ${current.qbase_env ?? "-"}，路径 ${current.qbase_container_path ?? "-"}，text_mode=${current.text_mode ?? "-"}。`,
            requiredParams: ["appid", "env_id", "function_name", "confirm"],
          });
        }
        await setContainerConfig(server, appid, {
          ...current,
          qbase_open: false,
        });
        logger?.({
          type: "toolInfo",
          toolName: "manageMessagePush",
          message: "已切换到云函数推送模式",
          appid,
          envId: env_id,
        });
        return buildJsonToolResult({
          ok: true,
          success: true,
          message: "已切换到云函数推送模式（setcontainercallbackconfig qbase_open=false 成功）",
          action,
          pushMode: "cloudfunction",
        });
      }

      if (action === "ensureContainerMode") {
        const path = qbase_container_path?.trim();
        const containerEnv = (qbase_env ?? env_id)?.trim();
        if (!path) {
          throw new Error(
            'ensureContainerMode 必须提供 qbase_container_path（云托管回调路径/URL）',
          );
        }
        if (text_mode !== 1 && text_mode !== 2) {
          throw new Error(
            "ensureContainerMode 必须提供 text_mode（1=json / 2=xml）",
          );
        }
        if (!containerEnv) {
          throw new Error(
            "ensureContainerMode 必须提供 qbase_env 或 env_id（云托管服务所在环境）",
          );
        }
        const current = await readContainerConfig(server, appid);
        const alreadySame =
          current?.qbase_open === true &&
          current.qbase_container_path === path &&
          current.qbase_env === containerEnv &&
          Number(current.text_mode) === text_mode;
        if (alreadySame) {
          return buildJsonToolResult({
            ok: true,
            success: true,
            code: "NO_CHANGE",
            message: "当前已是云托管推送模式且配置一致，无需变更",
            pushMode: "container",
            containerConfig: pickContainerConfigPublic(current),
          });
        }
        if (!confirmed) {
          return buildConfirmPayload({
            toolName: "manageMessagePush",
            action,
            message:
              `切换后所有消息类型整包推送到云托管服务（path=${path}，env=${containerEnv}，text_mode=${text_mode}），云函数回调失效。\n` +
              `当前：pushMode=${resolvePushMode(current)}，` +
              `path=${current?.qbase_container_path ?? "-"}，env=${current?.qbase_env ?? "-"}，text_mode=${current?.text_mode ?? "-"}。`,
            requiredParams: [
              "appid",
              "env_id",
              "qbase_container_path",
              "text_mode",
              "confirm",
            ],
          });
        }
        const nextCfg = {
          ...(current ?? {}),
          qbase_open: true,
          qbase_container_path: path,
          qbase_env: containerEnv,
          text_mode,
        };
        await setContainerConfig(server, appid, nextCfg);
        logger?.({
          type: "toolInfo",
          toolName: "manageMessagePush",
          message: "已切换到云托管推送模式",
          appid,
          envId: containerEnv,
        });
        return buildJsonToolResult({
          ok: true,
          success: true,
          message: "已切换到云托管推送模式（qbase_open=true）",
          action,
          pushMode: "container",
          containerConfig: pickContainerConfigPublic(nextCfg),
        });
      }

      if (action === "setContainerCallback") {
        const current = await readContainerConfig(server, appid);
        const nextPath =
          qbase_container_path?.trim() ||
          (typeof current?.qbase_container_path === "string"
            ? current.qbase_container_path
            : undefined);
        const nextEnv =
          (qbase_env ?? env_id)?.trim() ||
          (typeof current?.qbase_env === "string" ? current.qbase_env : undefined);
        const nextTextMode =
          text_mode === 1 || text_mode === 2
            ? text_mode
            : typeof current?.text_mode === "number"
              ? (current.text_mode as 1 | 2)
              : undefined;
        if (!nextPath) {
          throw new Error(
            "setContainerCallback 需要 qbase_container_path（或当前已有配置可沿用）",
          );
        }
        if (!nextEnv) {
          throw new Error(
            "setContainerCallback 需要 qbase_env 或 env_id（或当前已有配置可沿用）",
          );
        }
        if (nextTextMode !== 1 && nextTextMode !== 2) {
          throw new Error(
            "setContainerCallback 需要 text_mode（1=json / 2=xml，或当前已有配置可沿用）",
          );
        }
        const nextCfg = {
          ...(current ?? {}),
          qbase_open: current?.qbase_open === true,
          qbase_container_path: nextPath,
          qbase_env: nextEnv,
          text_mode: nextTextMode,
        };
        const same =
          current?.qbase_container_path === nextPath &&
          current?.qbase_env === nextEnv &&
          Number(current?.text_mode) === nextTextMode &&
          (current?.qbase_open === true) === (nextCfg.qbase_open === true);
        if (same) {
          return buildJsonToolResult({
            ok: true,
            success: true,
            code: "NO_CHANGE",
            message: "云托管回调配置无变化（幂等）",
            pushMode: resolvePushMode(current),
            containerConfig: pickContainerConfigPublic(current),
          });
        }
        if (!confirmed) {
          const before = pickContainerConfigPublic(current) ?? {};
          const after = pickContainerConfigPublic(nextCfg) ?? {};
          return buildConfirmPayload({
            toolName: "manageMessagePush",
            action,
            message:
              `即将更新云托管回调配置：\n` +
              `- 旧: path=${before.qbase_container_path ?? "-"}, env=${before.qbase_env ?? "-"}, text_mode=${before.text_mode ?? "-"}, qbase_open=${before.qbase_open ?? false}\n` +
              `- 新: path=${after.qbase_container_path ?? "-"}, env=${after.qbase_env ?? "-"}, text_mode=${after.text_mode ?? "-"}, qbase_open=${after.qbase_open ?? false}`,
            requiredParams: ["appid", "confirm"],
          });
        }
        await setContainerConfig(server, appid, nextCfg);
        return buildJsonToolResult({
          ok: true,
          success: true,
          message: "已更新云托管回调配置",
          action,
          pushMode: resolvePushMode(nextCfg),
          before: pickContainerConfigPublic(current),
          after: pickContainerConfigPublic(nextCfg),
        });
      }

      // Message-type entries use a fixed empty event; event_types must not be supplied
      if (!isEventMsgType && event_types && event_types.length > 0) {
        throw new Error(
          `msg_type="${resolvedMsgType}" 时不应传 event_types（消息类型条目的 event 固定为空串 ""）；` +
            `请去掉 event_types，仅传 msg_type / function_name / enable（setEnable 时）`,
        );
      }

      // Reject cloud-function callback writes while container mode is active (silent-failure guard)
      {
        const container = await readContainerConfig(server, appid);
        if (resolvePushMode(container) === "container") {
          return buildContainerModeBlockedPayload(action);
        }
      }

      // subscribe / unsubscribe / setEnable 共用流程：读 → 校验 → merge → 确认 → 覆盖写
      let eventList: string[];
      if (!isEventMsgType) {
        // Non-event message types: single entry keyed by (msgType, event="")
        eventList = [EMPTY_EVENT];
      } else {
        const targets = event_types ? [...new Set(event_types)] : undefined;
        if (action === "subscribe" && !targets) {
          // 缺省 = 虚拟支付默认事件集合
        } else if (!targets || targets.length === 0) {
          throw new Error(
            `${action} 必须提供 event_types（要操作的事件列表，可先 queryMessagePush(action=listSupportedEvents) 查询）；` +
              `若操作消息类型条目请传 msg_type（如 "text"），勿传 event_types`,
          );
        }
        eventList = targets ?? [...XPAY_EVENT_TYPES];
      }

      // 1. 读当前配置（乐观锁基础：必须读全量再 merge，禁止用本地列表直接覆盖）
      const state = await readCallbackConfig(server, appid);

      // 2. 合法性校验
      let warnings: string[] = [];
      if (!isEventMsgType) {
        // Validate msg_type exists in support list (message types have empty/missing event)
        try {
          const constraints = await fetchSupportedEvents(server, appid);
          const supportedMsgTypes = new Set(constraints.map((c) => c.msgType));
          if (!supportedMsgTypes.has(resolvedMsgType)) {
            return buildJsonToolResult({
              ok: false,
              code: "INVALID_MSG_TYPE",
              message:
                `msg_type="${resolvedMsgType}" 不在 getcallbacksupportlist 合法消息类型内。` +
                `请先 queryMessagePush(action=listSupportedEvents) 查看可用 msgTypes。`,
              next_step: { tool: "queryMessagePush", action: "listSupportedEvents" },
            });
          }
        } catch {
          // Constraint fetch failure does not block; server still validates on write
        }
      } else if (action === "subscribe" && event_types && event_types.length > 0) {
        // 显式 event_types 时严格校验合法性（默认集合仅警告，服务端为准）
        const constraints = await fetchSupportedEvents(server, appid);
        const supported = new Set(
          constraints.filter((c) => c.event).map((c) => c.event),
        );
        const invalid = eventList.filter((e) => !supported.has(e));
        if (invalid.length > 0) {
          return buildInvalidEventPayload(action, invalid);
        }
      } else if (action === "subscribe") {
        try {
          const constraints = await fetchSupportedEvents(server, appid);
          const supported = new Set(
            constraints.filter((c) => c.event).map((c) => c.event),
          );
          warnings = eventList.filter((e) => !supported.has(e));
        } catch {
          // 约束获取失败不阻塞默认订阅（服务端仍会校验）
        }
      }

      // 3. merge（纯函数，幂等；透传 resolvedMsgType）
      let result: MergeResult;
      if (action === "subscribe") {
        result = mergeSubscribeList(
          state.list,
          eventList,
          env_id,
          function_name,
          resolvedMsgType,
        );
      } else if (action === "unsubscribe") {
        result = mergeUnsubscribeList(
          state.list,
          eventList,
          env_id,
          function_name,
          resolvedMsgType,
        );
      } else if (action === "setEnable") {
        if (enable === undefined) {
          throw new Error("setEnable 必须提供 enable（true=启用 / false=停用）");
        }
        result = mergeSetEnableList(
          state.list,
          eventList,
          env_id,
          function_name,
          enable,
          resolvedMsgType,
        );
      } else {
        throw new Error(`不支持的操作类型: ${action}`);
      }

      const targetLabel = isEventMsgType
        ? eventList.join(", ")
        : `msg_type=${resolvedMsgType}`;

      // 4. 集合无变化 → 幂等成功，不 POST（无需确认）
      if (!result.changed) {
        return buildJsonToolResult({
          ok: true,
          success: true,
          code: "NO_CHANGE",
          message:
            action === "subscribe"
              ? `订阅已处于期望状态，无变更（幂等，未发起写请求）：${targetLabel} 均已绑定 ${env_id}/${function_name}`
              : action === "unsubscribe"
                ? `未找到可移除的匹配订阅，无变更（幂等，未发起写请求）`
                : `目标订阅状态已一致，无变更（幂等，未发起写请求）`,
          action,
          msg_type: resolvedMsgType,
          warnings: warnings.length ? warnings : undefined,
        });
      }

      // 4b. subscribe：校验云函数真实存在（仅有变更时）
      if (action === "subscribe") {
        const missing = await assertCloudFunctionExists(
          server,
          env_id,
          function_name,
        );
        if (missing) return missing;
      }

      // 5. 有变更 → 需确认
      const diffText = buildMergeDiffText(action, result, env_id, function_name);
      if (!confirmed) {
        return buildConfirmPayload({
          toolName: "manageMessagePush",
          action,
          message:
            `即将执行消息推送配置变更（${env_id}/${function_name}，msg_type=${resolvedMsgType}，version=${state.version}）：\n${diffText}`,
          requiredParams: ["appid", "env_id", "function_name", "confirm"],
        });
      }

      // 6. 全量覆盖写（带 version 乐观锁）
      try {
        await uploadCallbackConfig(server, appid, {
          version: state.version,
          enable: action === "subscribe" ? true : state.enable,
          list: result.list,
        });
      } catch (e) {
        if (e instanceof QbaseError && e.code === "VERSION_CONFLICT") {
          return buildJsonToolResult({
            ok: false,
            code: "VERSION_CONFLICT",
            retryable: true,
            message: e.message,
            next_step: { tool: "queryMessagePush", action: "list" },
          });
        }
        if (e instanceof QbaseError) {
          return buildJsonToolResult({
            ok: false,
            code: "QBASE_ERROR",
            retryable: true,
            message: e.message,
            next_step: {
              tool: "queryMessagePush",
              action: "list",
              hint: "重新读取最新配置后重试",
            },
          });
        }
        throw e;
      }

      logger?.({
        type: "toolInfo",
        toolName: "manageMessagePush",
        message: `${action} 成功`,
        appid,
        envId: env_id,
        functionName: function_name,
        msgType: resolvedMsgType,
        events: eventList,
      });

      const changedText =
        action === "subscribe"
          ? [
              result.added.length ? `新增 ${result.added.length} 个` : null,
              result.rebound.length ? `重绑 ${result.rebound.length} 个` : null,
            ]
              .filter(Boolean)
              .join("、")
          : action === "unsubscribe"
            ? `移除 ${result.removed.length} 个`
            : `更新 ${result.matched.length} 个`;
      return buildJsonToolResult({
        ok: true,
        success: true,
        message: `${action} 成功（${changedText}），version=${state.version} → 服务端已更新`,
        action,
        msg_type: resolvedMsgType,
        added: result.added,
        rebound: result.rebound,
        removed: result.removed,
        matched: result.matched,
        warnings: warnings.length ? warnings : undefined,
        callbacks: result.list,
      });
    },
  );
}
