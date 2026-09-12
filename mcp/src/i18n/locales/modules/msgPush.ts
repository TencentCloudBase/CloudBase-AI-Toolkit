import { defineModule } from "../types.js";

export const msgPush = defineModule(
  {
    queryTitle: "查询小程序消息推送配置",
    queryDescription:
      "查询小程序云开发消息推送配置（qbase getappconfig）或全部合法消息推送事件约束（getcallbacksupportlist）。" +
      "推送模式有两种：云函数（默认，按 (msgType,event) 逐条回调）与云托管（qbase_open=true，整包接收所有消息到容器 path）。" +
      "action=list 同时返回 pushMode（cloudfunction|container）、containerConfig、callbacks 与 version；" +
      "云托管模式下 callbacks 可能仍存在但不生效（见 note），需 ensureCloudFunctionMode 切回云函数模式后才会按回调推送。" +
      "action=listSupportedEvents 返回全部合法约束（按消息类型分组）。" +
      "需要微信 IDE 登录态通道（宿主注入 cloudBaseOptions.requestFn）。",
    manageTitle: "管理小程序消息推送配置",
    manageDescription:
      '管理小程序云开发消息推送配置（写操作，需 confirm="yes" 确认）。' +
      "推送模式：云函数（默认，按 (msgType,event) 回调）vs 云托管（整包接收；云托管模式下 subscribe/unsubscribe/setEnable 会被拒绝，先 ensureCloudFunctionMode）。" +
      "基于「读全量 → merge → 全量覆盖（带 version 乐观锁）」实现声明式幂等。" +
      'msg_type 缺省 "event"；消息类型用 msg_type=text|image|voice|video|miniprogrampage。' +
      "action=subscribe 前会校验 function_name 在环境中真实存在。" +
      "action=ensureCloudFunctionMode 关闭云托管整包接收；action=ensureContainerMode 开启云托管（需 qbase_container_path/qbase_env/text_mode）；" +
      "action=setContainerCallback 更新云托管 path/env/text_mode。" +
      "集合无变化时不发起写请求（幂等 no-op）。需要微信 IDE 登录态通道。",

    configEmptyOrInvalid: "getappconfig 返回的 config 为空或非 JSON 字符串",
    configParseFailed: "getappconfig 返回的 config 解析失败: {message}",
    transportNotInjected: "未注入 Cloud API 请求通道（cloudBaseOptions.requestFn）",
    qbaseRequestFailed: "qbase 请求失败({service}/{action}): {message}",
    unknownError: "未知错误",
    getAppConfigFailed: "getappconfig 失败(ret={ret}): {errmsg}",
    getCallbackSupportListFailed: "getcallbacksupportlist 失败(ret={ret}): {errmsg}",
    versionConflict:
      "uploadappconfig version 冲突（ret={ret}，本地 version={localVersion}，服务端已被其他操作修改）: {errmsg}。" +
      "请重新调用 queryMessagePush(action=list) 获取最新配置后重试（RFC 7232 If-Match 语义：重读 → merge → 重试）。",
    uploadAppConfigFailed: "uploadappconfig 失败(ret={ret}): {errmsg}。请重新查询最新配置后重试。",
    getContainerConfigFailed: "getcontainercallbackconfig 失败(ret={ret}): {errmsg}",
    setContainerConfigFailed: "setcontainercallbackconfig 失败(ret={ret}): {errmsg}",

    containerModeBlockNote:
      "当前为云托管模式（整包接收），云函数 callbacks 存在但不生效；如需云函数模式请调 ensureCloudFunctionMode 切换",
    containerModeWriteError:
      "当前 pushMode=container（云托管整包接收），云函数回调配置存在但不生效。" +
      "如需云函数模式请调 action=ensureCloudFunctionMode 切换。",
    containerModeSwitchHint: "先切换到云函数模式后再执行 {action}",

    functionNotFound: "云函数 {functionName} 不存在于环境 {envId}，请先创建或修正参数",
    transportUnavailableMessage:
      "消息推送配置依赖微信小程序云开发 qbase 管理接口（需要微信 IDE 登录态），" +
      "当前 CloudBase MCP 进程未注入 Cloud API 请求通道（cloudBaseOptions.requestFn），无法直连 qbase" +
      "（安全边界：腾讯云身份不可调用微信登录态 CGI）。\n" +
      "可用方案：\n" +
      "- 在微信开发者工具 MCP 中使用 cloud_msg_push_query / cloud_msg_push_manage（微信 IDE 已注入 qbase 通道）\n" +
      "- 或由宿主（微信 IDE）在 createCloudBaseMcpServer 时注入 cloudBaseOptions.requestFn，并在 pluginsEnabled 中启用 msg-push 插件",
    transportUnavailableHint: "需在微信 IDE 登录态通道中调用",

    confirmInstruction:
      '{message}\n\n请核对后传入 confirm="yes" 确认执行；如需取消或修改，请勿传 confirm="yes"，改传其他参数重试。',
    confirmAckText: "我已知晓并确认执行上述消息推送配置变更",
    invalidEventMessage:
      "{action} 包含不在合法约束内的事件：{invalid}。" +
      "请先调用 queryMessagePush(action=listSupportedEvents) 查询该小程序全部合法事件（含虚拟支付 7 个 xpay_* 事件），" +
      "确认事件名称后重试。",

    diffAdded: "- 新增订阅（{envId}/{functionName}）: {events}",
    diffRebound:
      '- 重绑事件（原绑定其他云函数，按"一事一函数"约束改绑到 {envId}/{functionName}）: {events}',
    diffRemoved: "- 移除订阅（{envId}/{functionName}）: {events}",
    diffSetEnable: "- 订阅状态变更（{envId}/{functionName}）: {events}",
    noMatchedEntries: "未匹配到条目",

    queryListSuccess: "查询消息推送配置成功",
    queryEventsSuccess: "获取合法消息推送事件约束成功",
    nextStepContainerRejected: "当前为云托管模式：云函数 subscribe/unsubscribe/setEnable 会被拒绝",
    nextStepEnsureCloudFunctionMode:
      "manageMessagePush(action=ensureCloudFunctionMode) 切回云函数模式",
    nextStepSetContainerCallback:
      "manageMessagePush(action=setContainerCallback) 更新云托管 path/env/text_mode",
    nextStepSubscribe:
      "manageMessagePush(action=subscribe) 订阅事件（缺省 event_types 时默认订阅虚拟支付 7 事件）",
    nextStepEnsureContainerMode:
      "manageMessagePush(action=ensureContainerMode) 切换到云托管整包接收",
    nextStepListSupportedEvents:
      "queryMessagePush(action=listSupportedEvents) 查看全部合法事件",
    xpayMissingHint:
      "以下默认事件不在当前小程序合法约束中（可能未开通虚拟支付），订阅时服务端可能拒绝",
    listSupportedEventsHint:
      "manageMessagePush 的 event_types 仅接受上述合法事件；subscribe 缺省 event_types 时默认订阅虚拟支付 7 事件。" +
      "消息类型条目（text/image/voice/video/miniprogrampage，events 为空数组）请用 manageMessagePush(msg_type=...) 管理，无需 event_types。",
    unsupportedAction: "不支持的操作类型: {action}",

    alreadyCloudFunctionMode:
      "当前已是云函数推送模式（云托管整包接收未开启），无需变更",
    ensureCloudFunctionModeConfirm:
      "切换后停止云托管整包接收（qbase_open=false），消息按云函数回调推送；若 callbacks 为空则收不到任何消息。\n" +
      "当前云托管配置：环境 {env}，路径 {path}，text_mode={textMode}。",
    switchedToCloudFunctionModeSuccess:
      "已切换到云函数推送模式（setcontainercallbackconfig qbase_open=false 成功）",
    containerPathRequired:
      "ensureContainerMode 必须提供 qbase_container_path（云托管回调路径/URL）",
    textModeRequired: "ensureContainerMode 必须提供 text_mode（1=json / 2=xml）",
    containerEnvRequired:
      "ensureContainerMode 必须提供 qbase_env 或 env_id（云托管服务所在环境）",
    alreadyContainerMode: "当前已是云托管推送模式且配置一致，无需变更",
    ensureContainerModeConfirm:
      "切换后所有消息类型整包推送到云托管服务（path={path}，env={env}，text_mode={textMode}），云函数回调失效。\n" +
      "当前：pushMode={pushMode}，path={oldPath}，env={oldEnv}，text_mode={oldTextMode}。",
    switchedToContainerModeSuccess: "已切换到云托管推送模式（qbase_open=true）",
    setCallbackPathRequired:
      "setContainerCallback 需要 qbase_container_path（或当前已有配置可沿用）",
    setCallbackEnvRequired:
      "setContainerCallback 需要 qbase_env 或 env_id（或当前已有配置可沿用）",
    setCallbackTextModeRequired:
      "setContainerCallback 需要 text_mode（1=json / 2=xml，或当前已有配置可沿用）",
    setCallbackNoChange: "云托管回调配置无变化（幂等）",
    setCallbackConfirm:
      "即将更新云托管回调配置：\n" +
      "- 旧: path={oldPath}, env={oldEnv}, text_mode={oldTextMode}, qbase_open={oldOpen}\n" +
      "- 新: path={newPath}, env={newEnv}, text_mode={newTextMode}, qbase_open={newOpen}",
    setCallbackSuccess: "已更新云托管回调配置",

    msgTypeNoEventTypes:
      'msg_type="{msgType}" 时不应传 event_types（消息类型条目的 event 固定为空串 ""）；' +
      "请去掉 event_types，仅传 msg_type / function_name / enable（setEnable 时）",
    eventTypesRequired:
      "{action} 必须提供 event_types（要操作的事件列表，可先 queryMessagePush(action=listSupportedEvents) 查询）；" +
      '若操作消息类型条目请传 msg_type（如 "text"），勿传 event_types',
    invalidMsgType:
      'msg_type="{msgType}" 不在 getcallbacksupportlist 合法消息类型内。' +
      "请先 queryMessagePush(action=listSupportedEvents) 查看可用 msgTypes。",
    enableRequired: "setEnable 必须提供 enable（true=启用 / false=停用）",

    noChangeSubscribe:
      "订阅已处于期望状态，无变更（幂等，未发起写请求）：{targetLabel} 均已绑定 {envId}/{functionName}",
    noChangeUnsubscribe: "未找到可移除的匹配订阅，无变更（幂等，未发起写请求）",
    noChangeSetEnable: "目标订阅状态已一致，无变更（幂等，未发起写请求）",
    confirmPendingMessage:
      "即将执行消息推送配置变更（{envId}/{functionName}，msg_type={msgType}，version={version}）：\n{diff}",
    retryHint: "重新读取最新配置后重试",

    changedAdded: "新增 {count} 个",
    changedRebound: "重绑 {count} 个",
    changedRemoved: "移除 {count} 个",
    changedUpdated: "更新 {count} 个",
    changedJoiner: "、",
    actionSuccess: "{action} 成功（{changedText}），version={version} → 服务端已更新",
  },
  {
    queryTitle: "Query Mini Program message push config",
    queryDescription:
      "Query Mini Program CloudBase message push config (qbase getappconfig) or all supported message push event constraints (getcallbacksupportlist). " +
      "Two push modes: cloud function (default, per (msgType,event) callback) and CloudBase Run container (qbase_open=true, receives all messages as a whole payload at the container path). " +
      "action=list also returns pushMode (cloudfunction|container), containerConfig, callbacks and version; " +
      "in container mode callbacks may still exist but take no effect (see note); call ensureCloudFunctionMode to switch back before callbacks apply. " +
      "action=listSupportedEvents returns all supported constraints grouped by message type. " +
      "Requires the WeChat IDE login-state channel (host injects cloudBaseOptions.requestFn).",
    manageTitle: "Manage Mini Program message push config",
    manageDescription:
      'Manage Mini Program CloudBase message push config (write ops, requires confirm="yes"). ' +
      "Push modes: cloud function (default, per (msgType,event) callback) vs CloudBase Run container (whole-payload receive; subscribe/unsubscribe/setEnable are rejected in container mode — call ensureCloudFunctionMode first). " +
      "Declarative idempotency built on read-all → merge → overwrite-all (version optimistic lock). " +
      'msg_type defaults to "event"; message-type entries use msg_type=text|image|voice|video|miniprogrampage. ' +
      "action=subscribe verifies function_name actually exists in the environment. " +
      "action=ensureCloudFunctionMode disables container whole-payload receive; action=ensureContainerMode enables it (requires qbase_container_path/qbase_env/text_mode); " +
      "action=setContainerCallback updates container path/env/text_mode. " +
      "No write request is made when the set is unchanged (idempotent no-op). Requires the WeChat IDE login-state channel.",
    configEmptyOrInvalid:
      "config returned by getappconfig is empty or not a JSON string",
    configParseFailed: "Failed to parse config returned by getappconfig: {message}",
    transportNotInjected:
      "Cloud API request channel not injected (cloudBaseOptions.requestFn)",
    qbaseRequestFailed: "qbase request failed ({service}/{action}): {message}",
    unknownError: "unknown error",
    getAppConfigFailed: "getappconfig failed (ret={ret}): {errmsg}",
    getCallbackSupportListFailed:
      "getcallbacksupportlist failed (ret={ret}): {errmsg}",
    versionConflict:
      "uploadappconfig version conflict (ret={ret}, local version={localVersion}, server was modified by another operation): {errmsg}. " +
      "Call queryMessagePush(action=list) again to fetch the latest config and retry (RFC 7232 If-Match semantics: re-read → merge → retry).",
    uploadAppConfigFailed:
      "uploadappconfig failed (ret={ret}): {errmsg}. Re-fetch the latest config and retry.",
    getContainerConfigFailed:
      "getcontainercallbackconfig failed (ret={ret}): {errmsg}",
    setContainerConfigFailed:
      "setcontainercallbackconfig failed (ret={ret}): {errmsg}",
    containerModeBlockNote:
      "Currently in CloudBase Run container mode (whole-payload receive): cloud function callbacks exist but take no effect; call ensureCloudFunctionMode to switch to cloud function mode",
    containerModeWriteError:
      "Current pushMode=container (CloudBase Run whole-payload receive): cloud function callback config exists but takes no effect. " +
      "Call action=ensureCloudFunctionMode to switch to cloud function mode.",
    containerModeSwitchHint:
      "Switch to cloud function mode before running {action}",
    functionNotFound:
      "Cloud function {functionName} does not exist in environment {envId}; create it first or fix the parameters",
    transportUnavailableMessage:
      "Message push config depends on the WeChat Mini Program CloudBase qbase admin API (requires WeChat IDE login state), " +
      "but the current CloudBase MCP process has no Cloud API request channel injected (cloudBaseOptions.requestFn) and cannot reach qbase directly" +
      " (security boundary: Tencent Cloud identity must not invoke WeChat login-state CGI).\n" +
      "Available options:\n" +
      "- Use cloud_msg_push_query / cloud_msg_push_manage in the WeChat DevTools MCP (WeChat IDE already injects the qbase channel)\n" +
      "- Or have the host (WeChat IDE) inject cloudBaseOptions.requestFn at createCloudBaseMcpServer time and enable the msg-push plugin in pluginsEnabled",
    transportUnavailableHint:
      "Must be called through the WeChat IDE login-state channel",
    confirmInstruction:
      '{message}\n\nReview it, then pass confirm="yes" to proceed; to cancel or adjust, do NOT pass confirm="yes" — change other params and retry instead.',
    confirmAckText:
      "I acknowledge and confirm the message push config changes above",
    invalidEventMessage:
      "{action} contains events outside the supported constraints: {invalid}. " +
      "Call queryMessagePush(action=listSupportedEvents) first to list all supported events for this Mini Program (including the 7 xpay_* virtual payment events), " +
      "verify the event names and retry.",
    diffAdded: "- Added subscriptions ({envId}/{functionName}): {events}",
    diffRebound:
      "- Rebound events (previously bound to another function; re-bound to {envId}/{functionName} per the one-event-one-function rule): {events}",
    diffRemoved: "- Removed subscriptions ({envId}/{functionName}): {events}",
    diffSetEnable: "- Subscription state changes ({envId}/{functionName}): {events}",
    noMatchedEntries: "no entries matched; ",
    queryListSuccess: "Message push config queried successfully",
    queryEventsSuccess:
      "Supported message push event constraints fetched successfully",
    nextStepContainerRejected:
      "Container mode is active: cloud function subscribe/unsubscribe/setEnable are rejected",
    nextStepEnsureCloudFunctionMode:
      "manageMessagePush(action=ensureCloudFunctionMode) to switch back to cloud function mode",
    nextStepSetContainerCallback:
      "manageMessagePush(action=setContainerCallback) to update container path/env/text_mode",
    nextStepSubscribe:
      "manageMessagePush(action=subscribe) to subscribe events (defaults to the 7 virtual payment events when event_types is omitted)",
    nextStepEnsureContainerMode:
      "manageMessagePush(action=ensureContainerMode) to switch to CloudBase Run whole-payload receive",
    nextStepListSupportedEvents:
      "queryMessagePush(action=listSupportedEvents) to list all supported events",
    xpayMissingHint:
      "The following default events are not in this Mini Program's supported constraints (virtual payment may not be enabled); the server may reject subscriptions",
    listSupportedEventsHint:
      "event_types of manageMessagePush only accepts the supported events above; subscribe defaults to the 7 virtual payment events when event_types is omitted. " +
      "For message-type entries (text/image/voice/video/miniprogrampage, events is an empty array) use manageMessagePush(msg_type=...) — no event_types needed.",
    unsupportedAction: "Unsupported action: {action}",
    alreadyCloudFunctionMode:
      "Already in cloud function push mode (container whole-payload receive not enabled); no change needed",
    ensureCloudFunctionModeConfirm:
      "After switching, container whole-payload receive stops (qbase_open=false) and messages are delivered via cloud function callbacks; if callbacks is empty, no messages will be received.\n" +
      "Current container config: env {env}, path {path}, text_mode={textMode}.",
    switchedToCloudFunctionModeSuccess:
      "Switched to cloud function push mode (setcontainercallbackconfig qbase_open=false succeeded)",
    containerPathRequired:
      "ensureContainerMode requires qbase_container_path (container callback path/URL)",
    textModeRequired:
      "ensureContainerMode requires text_mode (1=json / 2=xml)",
    containerEnvRequired:
      "ensureContainerMode requires qbase_env or env_id (environment hosting the CloudBase Run service)",
    alreadyContainerMode:
      "Already in container push mode with identical config; no change needed",
    ensureContainerModeConfirm:
      "After switching, all message types are pushed whole-payload to the CloudBase Run service (path={path}, env={env}, text_mode={textMode}); cloud function callbacks become ineffective.\n" +
      "Current: pushMode={pushMode}, path={oldPath}, env={oldEnv}, text_mode={oldTextMode}.",
    switchedToContainerModeSuccess:
      "Switched to container push mode (qbase_open=true)",
    setCallbackPathRequired:
      "setContainerCallback requires qbase_container_path (or an existing config to reuse)",
    setCallbackEnvRequired:
      "setContainerCallback requires qbase_env or env_id (or an existing config to reuse)",
    setCallbackTextModeRequired:
      "setContainerCallback requires text_mode (1=json / 2=xml, or an existing config to reuse)",
    setCallbackNoChange:
      "Container callback config unchanged (idempotent)",
    setCallbackConfirm:
      "About to update the container callback config:\n" +
      "- Old: path={oldPath}, env={oldEnv}, text_mode={oldTextMode}, qbase_open={oldOpen}\n" +
      "- New: path={newPath}, env={newEnv}, text_mode={newTextMode}, qbase_open={newOpen}",
    setCallbackSuccess: "Container callback config updated",
    msgTypeNoEventTypes:
      'event_types must not be supplied when msg_type="{msgType}" (the event field of message-type entries is fixed to the empty string ""); ' +
      "remove event_types and pass only msg_type / function_name / enable (enable for setEnable)",
    eventTypesRequired:
      "{action} requires event_types (the list of events to operate on; query via queryMessagePush(action=listSupportedEvents) first); " +
      'for message-type entries pass msg_type (e.g. "text") instead of event_types',
    invalidMsgType:
      'msg_type="{msgType}" is not among the supported message types returned by getcallbacksupportlist. ' +
      "Run queryMessagePush(action=listSupportedEvents) first to see available msgTypes.",
    enableRequired:
      "setEnable requires enable (true=enable / false=disable)",
    noChangeSubscribe:
      "Subscriptions already in the desired state, no change (idempotent, no write request issued): {targetLabel} are all bound to {envId}/{functionName}",
    noChangeUnsubscribe:
      "No matching subscription found to remove, no change (idempotent, no write request issued)",
    noChangeSetEnable:
      "Target subscription state already consistent, no change (idempotent, no write request issued)",
    confirmPendingMessage:
      "About to apply message push config changes ({envId}/{functionName}, msg_type={msgType}, version={version}):\n{diff}",
    retryHint: "Re-read the latest config and retry",
    changedAdded: "added {count}",
    changedRebound: "rebound {count}",
    changedRemoved: "removed {count}",
    changedUpdated: "updated {count}",
    changedJoiner: ", ",
    actionSuccess:
      "{action} succeeded ({changedText}), version={version} → server updated",
  },
);
