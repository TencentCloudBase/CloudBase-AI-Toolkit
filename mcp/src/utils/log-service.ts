/**
 * 「日志服务未开通」的识别与错误码（queryFunctions / queryLogs 共用）。
 *
 * 为什么要单独收成一格：未开通日志服务时 CLS 报的是 topic 不存在
 * （`[SearchClsLog] topic not exist`）—— 这是 CLS 的实现细节，调用方看不出
 * 「这个环境还没开通日志服务」，只能反复重试。
 *
 * queryFunctions 早就把这条翻译成了可执行的下一步（manageLogs/createLogService），
 * 但 queryLogs 一直原样透传原始 message。同一个环境、同一件事，两个工具给出两种
 * 质量的提示 —— 灯塔 168h：`topic not exist` 196 次 / 115 环境 / 132 账号。
 *
 * 判定逻辑只留这一份，两边都从这里取，避免再次分叉。
 */

/** 与云 API 错误码区分：这是 MCP 侧翻译后的业务码。 */
export const LOG_SERVICE_NOT_ENABLED_ERROR_CODE = "LOG_SERVICE_NOT_ENABLED";

/**
 * 兼容旧名：functions.ts 一直以这个名字导出给外部，改掉会破坏引用方。
 * 值与 LOG_SERVICE_NOT_ENABLED_ERROR_CODE 相同，新代码用上面那个。
 */
export const FUNCTION_LOG_SERVICE_NOT_ENABLED_ERROR_CODE = LOG_SERVICE_NOT_ENABLED_ERROR_CODE;

/**
 * 未开通日志服务时 CLS 报的是 topic 不存在，按这个特征把它翻译成可执行的下一步。
 *
 * 同时覆盖几种已知形态：TopicNotExist / TopicIsolated / "topic ... not exist" /
 * 已经说过「日志服务未开通」的自造文案。
 */
export function isLogServiceNotEnabledMessage(message: string): boolean {
  return /TopicNotExist|TopicIsolated|topic[\s\S]{0,20}not\s*exist|日志服务未开通/i.test(message);
}
