import type { ToolPayload } from "./tool-result.js";
import { credentialKey } from "./feedback-session.js";

/**
 * 连续重复错误熔断（repeat guard）。
 *
 * 背景：无头自动化客户端收到结构化引导错误（如 ENV_REQUIRED）后，可能不执行
 * 引导动作而是原样重试，形成重试风暴（2026-08-20 单日 15 万次同文案报错）。
 * 本模块在同一凭证上跟踪连续相同错误：
 * - 连续次数达到阈值后，在 payload 注入 repeat_guard 升级字段，提醒模型
 *   「原样重试无效，必须先完成 next_step 指向的修复动作」；
 * - 不改写 message 本身，保持灯塔侧按错误文案聚合的稳定性；
 * - 同一凭证的工具调用成功即清零该凭证的计数（说明循环已被打破）。
 *
 * Process-level mutable state:
 * - byCredential: Map keyed by feedback-session credentialKey (sha256 of
 *   site, secretId, and token). Value is { lastKey, consecutiveCount } only.
 *   Does not store protocol objects or raw credentials.
 * - localBucket: the no-credential streak. One bucket for the whole process,
 *   matching the previous single-process counter used by local mode.
 */

export const REPEAT_GUARD_THRESHOLD = 3;

const REPEAT_GUARD_KEY_MAX_LENGTH = 200;
const MAX_CREDENTIAL_BUCKETS = 64;

export type RepeatGuardInfo = {
  code: string;
  consecutive_count: number;
  threshold: number;
  notice: string;
};

type RepeatBucket = {
  lastKey: string | null;
  consecutiveCount: number;
  touchedAt: number;
};

const byCredential = new Map<string, RepeatBucket>();
const localBucket: RepeatBucket = {
  lastKey: null,
  consecutiveCount: 0,
  touchedAt: 0,
};

export type RepeatGuardSnapshot = {
  consecutiveCount: number;
};

function emptyBucket(): RepeatBucket {
  return { lastKey: null, consecutiveCount: 0, touchedAt: Date.now() };
}

function evictOldestCredential(): void {
  let oldestKey: string | undefined;
  let oldestTouched = Number.POSITIVE_INFINITY;
  for (const [key, bucket] of byCredential) {
    if (bucket.touchedAt < oldestTouched) {
      oldestTouched = bucket.touchedAt;
      oldestKey = key;
    }
  }
  if (oldestKey) {
    byCredential.delete(oldestKey);
  }
}

function bucketFor(server?: object): RepeatBucket {
  if (server && typeof server === "object") {
    const key = credentialKey(server);
    if (key) {
      let bucket = byCredential.get(key);
      if (!bucket) {
        if (byCredential.size >= MAX_CREDENTIAL_BUCKETS) {
          evictOldestCredential();
        }
        bucket = emptyBucket();
        byCredential.set(key, bucket);
      }
      bucket.touchedAt = Date.now();
      return bucket;
    }
  }
  localBucket.touchedAt = Date.now();
  return localBucket;
}

/**
 * Live streak only. Does not expose the dedup key: that key contains the raw
 * error message, which may include secrets or identifiers.
 */
export function getRepeatGuardSnapshot(server?: object): RepeatGuardSnapshot {
  return { consecutiveCount: bucketFor(server).consecutiveCount };
}

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
 * 无 server 或无凭证时走 localBucket，行为与改动前的单进程计数一致。
 */
export function applyRepeatGuardToPayload(payload: ToolPayload, server?: object): ToolPayload {
  if (!payload || typeof payload !== "object") {
    return payload;
  }

  const bucket = bucketFor(server);
  const key = buildRepeatGuardKey(payload);
  if (key === bucket.lastKey) {
    bucket.consecutiveCount += 1;
  } else {
    bucket.lastKey = key;
    bucket.consecutiveCount = 1;
  }
  if (bucket.consecutiveCount < REPEAT_GUARD_THRESHOLD) {
    return payload;
  }

  const code = typeof payload.code === "string" && payload.code.length > 0
    ? payload.code
    : "UNKNOWN";
  const repeatGuard: RepeatGuardInfo = {
    code,
    consecutive_count: bucket.consecutiveCount,
    threshold: REPEAT_GUARD_THRESHOLD,
    notice: buildRepeatGuardNotice(bucket.consecutiveCount),
  };
  return { ...payload, repeat_guard: repeatGuard };
}

/**
 * 工具调用成功时清零该凭证（或本地桶）的计数。
 */
export function resetRepeatGuard(server?: object): void {
  const bucket = bucketFor(server);
  bucket.lastKey = null;
  bucket.consecutiveCount = 0;
}

/**
 * 测试辅助：恢复初始状态。
 */
export function __resetRepeatGuardForTests(): void {
  byCredential.clear();
  localBucket.lastKey = null;
  localBucket.consecutiveCount = 0;
  localBucket.touchedAt = 0;
}
