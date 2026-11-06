/**
 * 环境 ID 的取值清洗。
 *
 * 授权页在账号没有环境时，会把 `undefined` 序列化成字符串回传（回调 URL 走
 * `URLSearchParams`，`{ envId: undefined }` 会变成 `envId=undefined`）。这个字符串
 * 写进凭证后是 truthy，会被所有「envId 非空即有效」的判断当成真实环境，后续请求
 * 带着 `EnvId="undefined"` 失败，而报错看起来像环境不存在。
 *
 * 因此凡是「从凭证 / 环境变量 / 项目配置里读 envId」的地方都过一遍这里。
 */
const INVALID_ENV_ID_VALUES = new Set(["undefined", "null"]);

/** 把无效值归一成 undefined；有效值原样返回（去首尾空白）。 */
export function normalizeEnvIdValue(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed || INVALID_ENV_ID_VALUES.has(trimmed.toLowerCase())) {
    return undefined;
  }
  return trimmed;
}

/**
 * 清洗凭证上的 envId。无效时删掉该字段而不是留空串，
 * 让下游的 `envId ? ... : ...` 分支自然走到「没有环境」。
 */
export function sanitizeCredentialEnvId<T>(credential: T): T {
  if (!credential || typeof credential !== "object") {
    return credential;
  }
  const envId = (credential as { envId?: unknown }).envId;
  if (normalizeEnvIdValue(envId) === undefined) {
    if (envId === undefined) {
      return credential;
    }
    return { ...(credential as object), envId: undefined } as T;
  }
  return credential;
}
