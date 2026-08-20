import { z } from "zod";
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
/** 消息推送条目类型（虚拟支付回调等事件均为 event） */
const MSG_TYPE_EVENT = "event";

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
 * - 已存在完全相同 (msgType, event, env, functionName) 的条目 → 保留（幂等，不重复添加）
 * - 该事件已绑定到其他云函数 → 移除旧条目并重绑到目标函数（一事一函数，与控制台一致）
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
      kept.push({ msgType, event: target, env: envId, functionName, enable: true });
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
    const result = await requestFn({
      service,
      action,
      version: MSG_PUSH_VERSION,
      region: "",
      payload,
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
    if (/version|版本|conflict|冲突/i.test(errmsg)) {
      throw new QbaseError(
        "VERSION_CONFLICT",
        `uploadappconfig version 冲突（本地 version=${state.version}，服务端已被其他操作修改）: ${errmsg}。` +
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
        "消息推送把小程序事件（含虚拟支付回调）送到云函数，无需自建服务器。" +
        "action=list 返回当前配置列表（msgType/event/env/functionName/enable）与 version（乐观锁版本号）；" +
        "action=listSupportedEvents 返回全部合法事件（按消息类型分组，含虚拟支付 7 个 xpay_* 事件），供 manageMessagePush 的 event_types 使用。" +
        "需要微信 IDE 登录态通道（宿主注入 cloudBaseOptions.requestFn），独立 CloudBase MCP 运行会返回指引错误。",
      inputSchema: {
        appid: z
          .string()
          .describe("小程序 AppID（必填，与微信开发者工具一致；用于选择微信登录态会话）"),
        env: z.string().optional().describe("可选：环境 ID；传入时 list 仅返回该环境的订阅条目"),
        action: z
          .enum(["list", "listSupportedEvents"])
          .describe(
            "list: 查询当前消息推送配置列表\nlistSupportedEvents: 查询全部合法消息推送事件约束（按 msgType 分组）",
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
        const state = await readCallbackConfig(server, appid);
        const callbacks = env
          ? state.list.filter((c) => c.env === env)
          : state.list;
        return buildJsonToolResult({
          ok: true,
          success: true,
          message: "查询消息推送配置成功",
          version: state.version,
          enable: state.enable,
          callbacks,
          filteredByEnv: env ?? undefined,
          next_steps: [
            "manageMessagePush(action=subscribe) 订阅事件（缺省 event_types 时默认订阅虚拟支付 7 事件）",
            "queryMessagePush(action=listSupportedEvents) 查看全部合法事件",
          ],
        });
      }
      if (action === "listSupportedEvents") {
        const constraints = await fetchSupportedEvents(server, appid);
        const grouped: Array<{ msgType: string; events: string[] }> = [];
        const byMsgType = new Map<string, string[]>();
        for (const c of constraints) {
          if (!c.event) continue;
          const list = byMsgType.get(c.msgType) ?? [];
          list.push(c.event);
          byMsgType.set(c.msgType, list);
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
          hint: "manageMessagePush 的 event_types 仅接受上述合法事件；subscribe 缺省 event_types 时默认订阅虚拟支付 7 事件",
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
        "基于「读全量 → merge → 全量覆盖（带 version 乐观锁）」实现声明式幂等（对齐 kubectl apply：event_types 是期望集合，重复执行收敛到同一状态；" +
        "version 冲突即 RFC 7232 If-Match 412，返回可重试错误：重读 → merge → 重试）。" +
        "action=subscribe 订阅事件到指定云函数（event_types 缺省时默认订阅虚拟支付 7 个 xpay_* 事件；显式传入支持任意合法事件）；" +
        "同一事件只能推到一个云函数（一事一函数），已绑定其他函数的事件会自动重绑并说明。" +
        "action=unsubscribe 移除指定事件订阅（event_types 必填，只移除匹配条目，保留其他配置）。" +
        "action=setEnable 启用/停用指定事件订阅（event_types + enable 必填）。" +
        "action=ensureCloudFunctionMode 确保推送模式为云函数（若为云托管整包接收则切换 qbase_open=false，需确认）。" +
        "集合无变化时不发起写请求（幂等 no-op，无需确认）。" +
        "需要微信 IDE 登录态通道（宿主注入 cloudBaseOptions.requestFn）。",
      inputSchema: {
        appid: z
          .string()
          .describe("小程序 AppID（必填，与微信开发者工具一致；用于选择微信登录态会话）"),
        env_id: z.string().describe("环境 ID（订阅条目绑定的云开发环境）"),
        function_name: z.string().describe("接收消息推送的云函数名"),
        action: z
          .enum(["subscribe", "unsubscribe", "setEnable", "ensureCloudFunctionMode"])
          .describe(
            "subscribe: 订阅事件到指定云函数（event_types 缺省=虚拟支付 7 事件）\n" +
              "unsubscribe: 移除指定事件订阅（event_types 必填）\n" +
              "setEnable: 启用/停用指定事件订阅（event_types + enable 必填）\n" +
              "ensureCloudFunctionMode: 确保为云函数推送模式（云托管整包接收时切换，需确认）",
          ),
        event_types: z
          .array(z.string())
          .optional()
          .describe(
            "要操作的事件列表（任意合法事件，可先 queryMessagePush(action=listSupportedEvents) 查询全量约束）。" +
              "subscribe 缺省时默认订阅虚拟支付 7 个事件：xpay_goods_deliver_notify、xpay_coin_pay_notify、xpay_complaint_notify、" +
              "xpay_subscribe_signing_result_notify、xpay_subscribe_pay_fail_notify、xpay_subscribe_ios_refund_query_notify、xpay_refund_notify；" +
              "unsubscribe / setEnable 时必填。",
          ),
        enable: z.boolean().optional().describe("setEnable 时必填：true 启用订阅 / false 停用订阅"),
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
      event_types,
      enable,
      confirm,
    }: {
      appid: string;
      env_id: string;
      function_name: string;
      action: string;
      event_types?: string[];
      enable?: boolean;
      confirm?: string;
    }) => {
      if (!getTransport(server)) {
        return buildTransportUnavailablePayload("manageMessagePush", action);
      }
      const confirmed = confirm === "yes";

      if (action === "ensureCloudFunctionMode") {
        const current = await readContainerConfig(server, appid);
        if (!current || current.qbase_open === false) {
          return buildJsonToolResult({
            ok: true,
            success: true,
            code: "NO_CHANGE",
            message: "当前已是云函数推送模式（云托管整包接收未开启），无需变更",
            containerConfig: current ?? undefined,
          });
        }
        if (!confirmed) {
          return buildConfirmPayload({
            toolName: "manageMessagePush",
            action,
            message:
              `当前推送模式为云托管整包接收（qbase_open=true，环境 ${current.qbase_env ?? "-"}，路径 ${current.qbase_container_path ?? "-"}），` +
              `事件会整包进入云托管而非云函数。\n即将执行 setcontainercallbackconfig 关闭云托管整包接收（qbase_open=false），` +
              `使消息推送按事件进入云函数 ${env_id}/${function_name}。`,
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
        });
      }

      // subscribe / unsubscribe / setEnable 共用流程：读 → 校验 → merge → 确认 → 覆盖写
      const targets = event_types ? [...new Set(event_types)] : undefined;
      if (action === "subscribe" && !targets) {
        // 缺省 = 虚拟支付默认事件集合
      } else if (!targets || targets.length === 0) {
        throw new Error(
          `${action} 必须提供 event_types（要操作的事件列表，可先 queryMessagePush(action=listSupportedEvents) 查询）`,
        );
      }
      const eventList = targets ?? [...XPAY_EVENT_TYPES];

      // 1. 读当前配置（乐观锁基础：必须读全量再 merge，禁止用本地列表直接覆盖）
      const state = await readCallbackConfig(server, appid);

      // 2. 显式 event_types 时严格校验合法性（默认集合仅警告，服务端为准）
      let warnings: string[] = [];
      if (action === "subscribe" && event_types && event_types.length > 0) {
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

      // 3. merge（纯函数，幂等）
      let result: MergeResult;
      if (action === "subscribe") {
        result = mergeSubscribeList(state.list, eventList, env_id, function_name);
      } else if (action === "unsubscribe") {
        result = mergeUnsubscribeList(state.list, eventList, env_id, function_name);
      } else if (action === "setEnable") {
        if (enable === undefined) {
          throw new Error("setEnable 必须提供 enable（true=启用 / false=停用）");
        }
        result = mergeSetEnableList(state.list, eventList, env_id, function_name, enable);
      } else {
        throw new Error(`不支持的操作类型: ${action}`);
      }

      // 4. 集合无变化 → 幂等成功，不 POST（无需确认）
      if (!result.changed) {
        return buildJsonToolResult({
          ok: true,
          success: true,
          code: "NO_CHANGE",
          message:
            action === "subscribe"
              ? `订阅已处于期望状态，无变更（幂等，未发起写请求）：${eventList.join(", ")} 均已绑定 ${env_id}/${function_name}`
              : action === "unsubscribe"
                ? `未找到可移除的匹配订阅，无变更（幂等，未发起写请求）`
                : `目标订阅状态已一致，无变更（幂等，未发起写请求）`,
          action,
          warnings: warnings.length ? warnings : undefined,
        });
      }

      // 5. 有变更 → 需确认
      const diffText = buildMergeDiffText(action, result, env_id, function_name);
      if (!confirmed) {
        return buildConfirmPayload({
          toolName: "manageMessagePush",
          action,
          message: `即将执行消息推送配置变更（${env_id}/${function_name}，version=${state.version}）：\n${diffText}`,
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
