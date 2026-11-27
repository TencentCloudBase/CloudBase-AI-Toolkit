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
 *
 * 唯一的例外是临时密钥过期：AccessServer 在解析出账号之前就拒绝请求，这类失败经常
 * 不带结构化 Code，只有 Message。因此 Code 未命中时才用一份固定短语表兜底，
 * 且只匹配云 API 鉴权层的原文，不做通用文案猜测。
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

/**
 * 官方错误码专页前缀，形如 https://docs.cloudbase.net/error-code/EXCEED_REQUEST_LIMIT。
 * 实测：/error-code/basic/<CODE> 会退回 basic 通用页（只泛泛提及该码），
 * 而 /error-code/<CODE> 才是该错误码的专属页，内容详得多。
 */
const ERROR_CODE_DOCS = "https://docs.cloudbase.net/error-code";

const REGISTRY: ErrorGuidance[] = [
  // 细分：仅在 Message 里能识别出写入子码/写配额措辞时才给写入专项结论。
  {
    code: "EXCEED_REQUEST_LIMIT",
    messagePattern: /OutOfWriteRequestQuota|write request overrun/i,
    summary:
      "数据库写入配额已用尽：当前环境资源点已耗尽或已超出当日写入配额，所有写入请求都会被拒绝，" +
      "读取不受影响。这与单次写入的文档条数、文档大小无关，单条小文档写入同样会触发。",
    docsUrl: `${ERROR_CODE_DOCS}/EXCEED_REQUEST_LIMIT`,
  },
  // 兜底：Message 文案变更后细分失配时降级到这里，结论对任何 EXCEED_REQUEST_LIMIT 都成立。
  {
    code: "EXCEED_REQUEST_LIMIT",
    summary:
      "请求配额已超出限制。这是环境级配额问题，通常不是单次请求参数问题" +
      "（例如写入配额耗尽时，单次只写 1 条同样会被拒绝），减少单次请求量并不能解决。",
    docsUrl: `${ERROR_CODE_DOCS}/EXCEED_REQUEST_LIMIT`,
  },
  // 兜底：余额不足 ≠ 账户欠费。云开发环境的可用量由环境资源点与套餐状态决定，
  // 与腾讯云账户余额是两个独立维度；SCF 对该码的官方释义（账号余额不足，请充值后重试）
  // 在云开发语境下容易误导——充值不会恢复环境资源点。恢复方式因套餐类型而异
  // （免费体验版的途径与付费套餐不同），分支细节交给官方文档，这里只给判别方向。
  {
    code: "InsufficientBalance",
    summary:
      "余额不足不一定是账户欠费：充值只解决账户欠费，不会恢复环境资源点；不要直接引导充值。" +
      "先查 manageEnv(action=\"usage\")、queryFunctions(action=\"getFunctionDetail\") 的 AvailableStatus、" +
      "callCloudApi 查账户余额（billing DescribeAccountBalance）。" +
      "函数 Status=Active 但 AvailableStatus=InsufficientBalance、调用返回 410 时，只说明 SCF 侧计费/可用状态异常；" +
      "不能判定账户欠费或环境删除残留。环境删除残留需删除记录和隔离状态证据，确认后再换新环境或联系平台核查。",
    docsUrl: "https://cloud.tencent.com/document/product/876/136006",
  },
];

/**
 * 云 API 鉴权层在临时密钥过期时返回的原文。AccessServer 的这类响应没有账号字段，
 * 也经常没有结构化 Code；只在这里作为 Code 未命中后的兜底依据。
 */
export const CREDENTIAL_EXPIRED_PATTERN =
  /Token verification failed|tmp secret key expire|AuthFailure\.TokenFailure|Token验证失败|\b(?:11014|213)\b/i;

/**
 * An account-level control-plane Action (DescribeEnvs without EnvId, DescribeVpcs,
 * DescribeCertificates, ...) rejected for an env-level credential is reported by the
 * gateway as `invalid token`. This is a credential permission boundary, not an expired
 * STS token: renewing the credential and retrying cannot change the outcome.
 * The negative lookahead keeps ordinary configuration text out of this class.
 */
export const CREDENTIAL_SCOPE_LIMITED_PATTERN = /invalid token(?!\s+[a-z]+\s+config)/i;

const AUTH_CODE_PATTERN =
  /AuthFailure|11014|\b213\b|TokenFailure|SignatureFailure|InvalidCredential|UnauthorizedOperation/i;
const EXPIRED_CODE_PATTERN = /AuthFailure\.TokenFailure|11014|\b213\b/i;

const CREDENTIAL_EXPIRED_GUIDANCE: ErrorGuidance = {
  code: "AuthFailure.TokenFailure",
  summary:
    "临时密钥已过期：这是短期凭据到期，不是登录态丢失。MCP 已尝试重新换取密钥，" +
    "请重试该操作；不要解绑重连，也不要引导用户重新授权。",
  docsUrl: "https://docs.cloudbase.net/error-code/AuthFailure.TokenFailure",
};

const CREDENTIAL_SCOPE_LIMITED_GUIDANCE: ErrorGuidance = {
  code: "AuthFailure.UnauthorizedOperation",
  summary:
    "凭据权限边界：环境级凭据（API Key 或托管授权）调用账号级管控面接口被拒。" +
    "这不是临时密钥过期，重新换取密钥或重试同一请求都不会成功；不要解绑重连。" +
    "改用带 EnvId 的接口（如 DescribeEnvInfo），或换用账号级凭据。",
  docsUrl: "https://cloud.tencent.com/document/product/876/34809",
};

/** 是否属于「临时密钥过期」而非账号登录失效。 */
export function isCredentialExpiredError(error: unknown): boolean {
  const code = resolveErrorCode(error);
  if (code && !AUTH_CODE_PATTERN.test(code)) {
    return false;
  }
  if (code && EXPIRED_CODE_PATTERN.test(code)) {
    return true;
  }
  return CREDENTIAL_EXPIRED_PATTERN.test(errorMessageOf(error));
}

/**
 * Whether the failure is a credential permission boundary rather than an expired token.
 * A structured expiration code or an explicit expiration message always wins, so a
 * payload carrying both signals still follows the renewable path.
 */
export function isCredentialScopeLimitedError(error: unknown): boolean {
  const code = resolveErrorCode(error);
  if (code && !AUTH_CODE_PATTERN.test(code)) {
    return false;
  }
  if (code && EXPIRED_CODE_PATTERN.test(code)) {
    return false;
  }
  const message = errorMessageOf(error);
  if (CREDENTIAL_EXPIRED_PATTERN.test(message)) {
    return false;
  }
  return CREDENTIAL_SCOPE_LIMITED_PATTERN.test(message);
}

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
    (record.original as Record<string, unknown> | undefined)?.Code,
    (record.meta as Record<string, unknown> | undefined)?.upstreamCode,
    record.eCode,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate) {
      return candidate;
    }
    if (typeof candidate === "number") {
      return String(candidate);
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
  const message = errorMessageOf(error);
  if (code) {
    const matched = REGISTRY.find(
      (entry) =>
        entry.code.toLowerCase() === code.toLowerCase() &&
        (!entry.messagePattern || entry.messagePattern.test(message)),
    );
    if (matched) {
      return matched;
    }
    // A structured non-auth code wins over an incidental token phrase.
    if (!AUTH_CODE_PATTERN.test(code)) {
      return null;
    }
  }
  // Token failures rejected at the access layer often carry no structured Code.
  // Only the fixed authentication phrases above can produce guidance in that case.
  if (CREDENTIAL_EXPIRED_PATTERN.test(message)) {
    return CREDENTIAL_EXPIRED_GUIDANCE;
  }
  if (CREDENTIAL_SCOPE_LIMITED_PATTERN.test(message)) {
    return CREDENTIAL_SCOPE_LIMITED_GUIDANCE;
  }
  return null;
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
