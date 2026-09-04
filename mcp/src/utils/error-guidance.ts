/**
 * 云 API 错误指引注册表（中心化，挂在工具统一错误出口上）。
 *
 * 匹配主键必须是 Code，不能是 Message：云 API 规范明确声明 Message「可能会经常保持变更
 * 或更新，用户不应依赖这个返回值」，而 Code 是稳定的机器契约。SDK 在 commonService 收到
 * Response.Error 时会把 Code 原样挂到 error.code 上，因此这里能拿到结构化字段。
 *
 * messagePattern 只用于同一个 Code 下的场景细分，是可选的 AND 条件，且**永远不是唯一依据**：
 * 每个 Code 都必须配一条不带 messagePattern 的兜底条目。这样即使 Message 文案变更导致
 * 细分正则失配，也只是降级成"正确但笼统"的指引，不会退化成原样透传英文原文。
 * Code 缺失时不做任何猜测，原样透传。
 *
 * 注册表按"细分在前、兜底在后"排序，命中第一个满足条件的条目。
 *
 * 指引正文只写与套餐/环境无关的事实，具体阈值与处置一律交给官方文档（docsUrl）：
 * 阈值随套餐变化，写死会把某一档查到的数字当成通用结论。
 */

export type ErrorGuidance = {
  /** 云 API 结构化错误码，稳定契约，匹配主键 */
  code: string;
  /** 可选：同一 Code 下的场景细分，与 Code 同时满足才命中 */
  messagePattern?: RegExp;
  /** 与套餐无关的结论 + 自助排查方向 */
  summary: string;
  /** 官方文档地址，阈值与处置的唯一真相源 */
  docsUrl: string;
};

const ERROR_CODE_DOCS_BASIC = "https://docs.cloudbase.net/error-code/basic";

const REGISTRY: ErrorGuidance[] = [
  // 细分：仅在 Message 里能识别出写入子码/写配额措辞时才给写入专项结论。
  {
    code: "EXCEED_REQUEST_LIMIT",
    messagePattern: /OutOfWriteRequestQuota|write request overrun/i,
    summary:
      "数据库写入配额已用尽：当前环境资源点已耗尽或已超出当日写入配额，所有写入请求都会被拒绝，" +
      "读取不受影响。这与单次写入的文档条数、文档大小无关，单条小文档写入同样会触发。",
    docsUrl: `${ERROR_CODE_DOCS_BASIC}/EXCEED_REQUEST_LIMIT`,
  },
  // 兜底：Message 文案变更后细分失配时降级到这里，结论对任何 EXCEED_REQUEST_LIMIT 都成立。
  {
    code: "EXCEED_REQUEST_LIMIT",
    summary:
      "请求配额已超出限制。这是环境级配额问题，通常不是单次请求参数问题" +
      "（例如写入配额耗尽时，单次只写 1 条同样会被拒绝），减少单次请求量并不能解决。",
    docsUrl: `${ERROR_CODE_DOCS_BASIC}/EXCEED_REQUEST_LIMIT`,
  },
];

/**
 * 从错误对象上取结构化错误码。SDK 与业务代码挂载位置不统一，这里穷举已知位置。
 */
export function resolveErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }
  const record = error as Record<string, unknown>;
  const candidates = [
    record.code,
    record.Code,
    record.errorCode,
    (record.Response as Record<string, unknown> | undefined)?.Error,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate) {
      return candidate;
    }
    if (candidate && typeof candidate === "object") {
      const nested = (candidate as Record<string, unknown>).Code;
      if (typeof nested === "string" && nested) {
        return nested;
      }
    }
  }
  return undefined;
}

function errorMessageOf(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (error && typeof error === "object") {
    const message = (error as Record<string, unknown>).message;
    if (typeof message === "string") {
      return message;
    }
  }
  return String(error ?? "");
}

export function findErrorGuidance(error: unknown): ErrorGuidance | null {
  const code = resolveErrorCode(error);
  if (!code) {
    return null;
  }
  const message = errorMessageOf(error);
  const matched = REGISTRY.find(
    (entry) =>
      entry.code.toLowerCase() === code.toLowerCase() &&
      (!entry.messagePattern || entry.messagePattern.test(message)),
  );
  return matched ?? null;
}

/**
 * 给原始错误文案追加可操作指引。命中才追加，未命中原样返回，
 * 保持 message 前缀不变以免污染按错误文案聚合的遥测。
 */
export function enhanceErrorMessage(error: unknown, message: string): string {
  const guidance = findErrorGuidance(error);
  if (!guidance) {
    return message;
  }
  return `${message}\n\n💡 ${guidance.code}：${guidance.summary}\n📖 官方文档：${guidance.docsUrl}`;
}

/**
 * 取后端 RequestId。SDK 在标准路径把它挂在 requestId 上，但 requestFn 委托路径
 * 与部分业务代码使用 requestID / RequestId / Response.RequestId，这里统一归一。
 */
export function resolveRequestId(error: unknown): string {
  if (!error || typeof error !== "object") {
    return "";
  }
  const record = error as Record<string, unknown>;
  const response = record.Response as Record<string, unknown> | undefined;
  const candidates = [
    record.requestId,
    record.RequestId,
    record.requestID,
    response?.RequestId,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate) {
      return candidate;
    }
  }
  return "";
}
