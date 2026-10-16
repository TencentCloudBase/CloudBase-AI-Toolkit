import type { PlanCode } from "../resources/env-credits.js";
import { resolvePlanCode } from "./env-credits-payload.js";

/**
 * 部署类工具的结果 → `ui://cloudbase/artifact-card` 面板载荷的映射。
 *
 * 与 `env-credits-payload.ts` 同一套纪律：
 *   1. **不猜**：状态从工具自报的信号推导；拿不到信号就是 `unknown`（面板显示「未确认」），
 *      不靠"有地址就算上线"这类推断补位（`cloudrun` 的 deploy 会**在部署进行中**就带上
 *      已存在服务的地址，只看地址会把"正在部署"说成"已上线"）。
 *   2. **不编数**：拿不到的字段一律省略，绝不填占位值；失败原因是**后端原文**，逐字透传，
 *      不改写、不推测、也不用错误码顶替。
 *   3. **不改调用方语义**：这里只做纯换算；面板不发起任何工具调用（`tools/call` 恒为 0）。
 */

/** 面板可见状态：部署中 / 已上线 / 部署失败 / 未确认。 */
export type ArtifactState = "deploying" | "published" | "failed" | "unknown";

/** 产物类型（只用于标题里的人话，例如「云托管服务 · my-service」）。 */
export type ArtifactKind = "hosting" | "apps" | "cloudrun";

/** 访问地址的可见范围：公网 / 仅内网。 */
export type AccessUrlScope = "public" | "internal";

/**
 * `accessUrlSource` → 可见范围。**只有内网域名是内网**，其余来源均为公网。
 *
 * 取值出处（三个工具的本地实现，键名与其逐字一致）：
 *   - `hosting.staticDomain`（hosting.ts 上传回执的静态域名）
 *   - `describeAppInfo.Domain`（apps.ts 的应用域名）
 *   - `cloudrun.customDomain` / `cloudrun.defaultDomain` / `cloudrun.publicDomain`
 *   - `cloudrun.internalDomain`（cloudrun.ts `resolveCloudRunFallbackAccess` 的最后一档，
 *     也是唯一的内网档）
 * 认不出的来源返回 `null`——宁可让面板不给结论，也不替用户承诺"公网"。
 */
export const ACCESS_URL_SCOPE_BY_SOURCE: Readonly<Record<string, AccessUrlScope>> = {
  "hosting.staticDomain": "public",
  "describeAppInfo.Domain": "public",
  "cloudrun.customDomain": "public",
  "cloudrun.defaultDomain": "public",
  "cloudrun.publicDomain": "public",
  "cloudrun.internalDomain": "internal",
};

/** 来源码 → 可见范围；认不出返回 null（不猜）。 */
export function accessUrlScopeOf(source?: string | null): AccessUrlScope | null {
  if (typeof source !== "string") {
    return null;
  }
  return ACCESS_URL_SCOPE_BY_SOURCE[source.trim()] ?? null;
}

/** 状态判定入参（全部是工具侧已经拿到的信号；缺失即 undefined / null）。 */
export interface ArtifactStateInput {
  /** 工具结果是否成功；显式 `false` 即失败。 */
  success?: boolean;
  /** 工具自报"还在进行中"（例：cloudrun 的 `status: "deploying"` / `deployAccepted`）。 */
  pending?: boolean;
  /** 本次部署对应的访问地址（已确认可达的才传）。 */
  accessUrl?: string | null;
  /** 失败原因的后端原文。 */
  errorText?: string | null;
}

/**
 * 状态判定（顺序即优先级）：
 *   1. `success === false` 或**有后端错误原文** → `failed`；
 *   2. 工具自报进行中 → `deploying`（**优先于地址**：`cloudrun` 部署中也会带已有服务的地址）；
 *   3. 有可用访问地址 → `published`；
 *   4. 其余 → `unknown`。
 */
export function resolveArtifactState(input: ArtifactStateInput): ArtifactState {
  const errorText = typeof input.errorText === "string" ? input.errorText.trim() : "";
  if (input.success === false || errorText !== "") {
    return "failed";
  }
  if (input.pending === true) {
    return "deploying";
  }
  if (typeof input.accessUrl === "string" && input.accessUrl.trim() !== "") {
    return "published";
  }
  return "unknown";
}

/** 面板载荷（键名即面板契约；`state` 恒在，其余按"确实拿到"出现）。 */
export interface ArtifactCardPayload {
  state: ArtifactState;
  artifact_kind?: ArtifactKind | null;
  artifact_name?: string | null;
  access_url?: string | null;
  access_url_scope?: AccessUrlScope | null;
  error_text?: string | null;
  env_alias?: string | null;
  env_id?: string | null;
  plan?: PlanCode | null;
  plan_raw?: string | null;
  current_region?: string;
  site?: string;
  updated_at?: string | null;
}

function trimmedOrNull(value?: string | null): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * 组装面板载荷。
 *
 * `accessUrlReachable === false` 时**不把地址传给面板**：一个已知不可达的"名义地址"不是访问地址，
 * 显示它只会让用户去点一个打不开的链接（拿不到就不显示）。此时状态自然落回 `unknown`。
 */
export function buildArtifactCardPayload(input: {
  success?: boolean;
  pending?: boolean;
  accessUrl?: string | null;
  accessUrlSource?: string | null;
  accessUrlReachable?: boolean | null;
  errorText?: string | null;
  kind?: ArtifactKind | null;
  artifactName?: string | null;
  envAlias?: string | null;
  envId?: string | null;
  planRaw?: string | null;
  site: string;
  region: string;
  updatedAt?: string | null;
}): ArtifactCardPayload {
  const reachable = input.accessUrlReachable === false ? null : trimmedOrNull(input.accessUrl);
  const state = resolveArtifactState({
    success: input.success,
    pending: input.pending,
    accessUrl: reachable,
    errorText: input.errorText,
  });
  // 只有"已上线"才带地址与可见范围；其余状态下地址不参与展示（部署中/失败都没有可用地址）。
  const scope = state === "published" ? accessUrlScopeOf(input.accessUrlSource) : null;
  const { plan, plan_raw } = resolvePlanCode(input.planRaw);

  const artifactName = trimmedOrNull(input.artifactName);
  const errorText = trimmedOrNull(input.errorText);
  const envAlias = trimmedOrNull(input.envAlias);
  const updatedAt = trimmedOrNull(input.updatedAt);
  // env_id 逐字来自**本次工具结果**：拿不到就**整个键省略**，让面板按
  // 「①工具结果 → ②配置/环境变量 → ③进程缓存 → ④不显示」的链条回落到服务端解析出的兜底值。
  // 若这里塞 null，面板会把"这一级没有"误读成"就是没有环境 ID"，链条就断了。
  const envId = trimmedOrNull(input.envId);

  return {
    state,
    ...(input.kind ? { artifact_kind: input.kind } : {}),
    ...(artifactName ? { artifact_name: artifactName } : {}),
    ...(state === "published" && reachable ? { access_url: reachable } : {}),
    ...(scope ? { access_url_scope: scope } : {}),
    // 后端原文，逐字透传；没有就不给（面板不显示说明句，不用错误码或通用文案顶替）。
    ...(errorText ? { error_text: errorText } : {}),
    ...(envAlias ? { env_alias: envAlias } : {}),
    ...(envId ? { env_id: envId } : {}),
    plan,
    plan_raw,
    current_region: input.region,
    site: input.site,
    ...(updatedAt ? { updated_at: updatedAt } : {}),
  };
}
