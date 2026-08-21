import type { ToolPayload } from "./tool-result.js";

/**
 * 连续重复错误熔断（repeat guard）。
 *
 * 背景：无头自动化客户端收到结构化引导错误（如 ENV_REQUIRED）后，可能不执行
 * 引导动作而是原样重试，形成重试风暴（2026-08-20 单日 15 万次同文案报错）。
 * 本模块在同一进程（≈同一 MCP session）内跟踪连续相同错误：
 * - 连续次数达到阈值后，在 payload 注入 repeat_guard 升级字段，提醒模型
 *   「原样重试无效，必须先完成 next_step 指向的修复动作」；
 * - 不改写 message 本身，保持灯塔侧按错误文案聚合的稳定性；
 * - 任一工具调用成功即整体清零（说明循环已被打破）。
 */

export const REPEAT_GUARD_THRESHOLD = 3;

const REPEAT_GUARD_KEY_MAX_LENGTH = 200;

export type RepeatGuardInfo = {
  code: string;
  consecutive_count: number;
  threshold: number;
  notice: string;
};

let lastKey: string | null = null;
let consecutiveCount = 0;

function buildRepeatGuardKey(payload: ToolPayload): string {
  const code = typeof payload.code === "string" ? payload.code : "";
  const message = typeof payload.message === "string" ? payload.message : "";
  return `${code}|${message.slice(0, REPEAT_GUARD_KEY_MAX_LENGTH)}`;
}

function buildRepeatGuardNotice(count: number): string {
  return (
    `当前会话已连续 ${count} 次返回相同错误。原样重试不会成功：` +
    "请停止重试当前调用，先按 payload 中的 message / next_step 完成修复动作" +
    "（如完成 auth 登录或绑定环境），或调整参数后再继续。"
  );
}

/**
 * 记录一次结构化工具错误；达到阈值时返回注入 repeat_guard 的新 payload。
 */
export function applyRepeatGuardToPayload(payload: ToolPayload): ToolPayload {
  if (!payload || typeof payload !== "object") {
    return payload;
  }

  const key = buildRepeatGuardKey(payload);
  if (key === lastKey) {
    consecutiveCount += 1;
  } else {
    lastKey = key;
    consecutiveCount = 1;
  }

  if (consecutiveCount < REPEAT_GUARD_THRESHOLD) {
    return payload;
  }

  const code = typeof payload.code === "string" && payload.code.length > 0
    ? payload.code
    : "UNKNOWN";
  const repeatGuard: RepeatGuardInfo = {
    code,
    consecutive_count: consecutiveCount,
    threshold: REPEAT_GUARD_THRESHOLD,
    notice: buildRepeatGuardNotice(consecutiveCount),
  };
  return { ...payload, repeat_guard: repeatGuard };
}

/**
 * 工具调用成功时清零计数。
 */
export function resetRepeatGuard(): void {
  lastKey = null;
  consecutiveCount = 0;
}

/**
 * 测试辅助：恢复初始状态。
 */
export function __resetRepeatGuardForTests(): void {
  resetRepeatGuard();
}
