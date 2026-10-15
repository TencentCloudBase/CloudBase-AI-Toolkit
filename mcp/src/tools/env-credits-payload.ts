import type {
  CreditsBranch,
  CreditsModuleCode,
  EnvCreditsPayload,
  PlanCode,
} from "../resources/env-credits.js";

/**
 * `queryEnv(action="usage")` 的结果 → `ui://cloudbase/env-credits` 面板载荷的映射。
 *
 * 为什么单独一层：面板按 `ui/notifications/tool-result` 拿到的载荷渲染，键名是**面板契约**
 * （见 `resources/env-credits.ts` 的 `EnvCreditsPayload`）。把"云 API 响应 → 面板载荷"的换算
 * 收在这里，env.ts 只负责调用；换算全是纯函数，可单测。
 *
 * 三条纪律：
 *   1. **不猜**：认不出的套餐码 / 模块码原样透传（`plan_raw` / `module` 原值）；信息不足时
 *      `branch` 返回 `unknown`，不硬凑成某个分支。分支话术里断言过的前提（如体验版耗尽那句
 *      写着"账户余额充足"）不成立时，宁可 `unknown`。
 *   2. **不编数**：`credits` 只有 total 与 used 都拿到才传（面板缺一就整块隐藏）；余额没有
 *      只读来源就传 null，不为它新增调用。拿不到的字段一律省略，不填 0 / 不填假值。
 *   3. **不新增依赖 / 不发请求**：这里只做纯换算。
 */

/** 面板模块枚举的映射：SDK 模块码 → 面板模块码。认不出的原样透传。 */
const MODULE_CODE_MAP: Record<string, CreditsModuleCode> = {
  SCF: "functions",
  FLEXDB: "database",
  COS: "storage",
};

/** 付费套餐码（`plan` 枚举里除体验版之外的全部）。 */
const PAID_PLAN_CODES: readonly PlanCode[] = [
  "personal",
  "standard",
  "enterprise",
  "enterpriseAdvanced",
];

/** 体验版套餐配额（资源点）。付费套餐的配额没有可读来源 ⇒ 不传 total。 */
export const TRIAL_CREDITS_TOTAL = 3000;

/** 套餐码 → 面板套餐枚举。
 *
 * 免费/体验族沿用本仓既有判据（`buildBillingModeText`：free / activity / trial / 试用 / 体验），
 * 付费族要求"去掉 `baas_` / `baas_pf_` 前缀后与枚举**完全相等**"，不做模糊包含匹配——
 * 模糊匹配会把 `baas_enterprise` 误判成 `enterpriseAdvanced`。
 * 认不出时 `plan` 为 null、`plan_raw` 保留原值（面板照原样显示）。
 */
export function resolvePlanCode(raw?: string | null): {
  plan: PlanCode | null;
  plan_raw: string | null;
} {
  if (typeof raw !== "string" || raw.trim() === "") {
    return { plan: null, plan_raw: null };
  }
  const value = raw.trim();
  const id = value.toLowerCase();
  if (/free|activity|trial|试用|体验/.test(id)) {
    return { plan: "trial", plan_raw: value };
  }
  const token = id.replace(/^baas_(pf_)?/, "").replace(/[_\-\s]/g, "");
  const exact = PAID_PLAN_CODES.find((code) => code.toLowerCase() === token);
  return exact ? { plan: exact, plan_raw: value } : { plan: null, plan_raw: value };
}

/** 面板分支判定的入参（全部为已取到的值；缺失即 undefined / null）。 */
export interface CreditsBranchInput {
  plan: PlanCode | null;
  used?: number | null;
  total?: number | null;
  expired?: boolean;
  balance?: number | null;
}

/**
 * 四个停服分支的判定（顺序即优先级）：
 *   1. 套餐过期（`expired`）——过期后是隔离期，先解决续费；
 *   2. 资源点耗尽：体验版 → `trialExhausted`（但该分支话术断言"账户余额充足"，
 *      余额为负时不成立 ⇒ 退回 `unknown`）；付费版 → `stopped`；
 *   3. 余额为负且资源点未耗尽 → `arrears`（与话术"套餐内资源点仍够用时"一致）；
 *   4. 其余 → `unknown`（信息不足，不猜）。
 */
export function resolveCreditsBranch(input: CreditsBranchInput): CreditsBranch {
  const { plan, used, total, expired, balance } = input;
  if (expired === true) {
    return "expired";
  }
  const exhausted =
    typeof total === "number" && total > 0 && typeof used === "number" && used >= total;
  if (exhausted) {
    if (plan === "trial") {
      const negativeBalance = typeof balance === "number" && balance < 0;
      return negativeBalance ? "unknown" : "trialExhausted";
    }
    if (plan !== null && PAID_PLAN_CODES.includes(plan)) {
      return "stopped";
    }
    return "unknown";
  }
  if (typeof balance === "number" && balance < 0) {
    return "arrears";
  }
  return "unknown";
}

/** SDK 用量条目里本模块真正读到的部分（`EnvPkgCreditsUsage` 的最小子集）。 */
export interface CreditsUsageLike {
  Module?: string;
  CreditsValue?: number;
  MetricUsageDetail?: Array<{
    ValueDetailList?: Array<{ CalcTime?: string; CreditsValue?: number }>;
  }> | null;
}

/** `Usages[].CreditsValue` 求和；列表本身拿不到时返回 null（区别于"为空即 0"）。 */
export function sumCreditsValue(
  usages?: ReadonlyArray<CreditsUsageLike> | null,
): number | null {
  if (!Array.isArray(usages)) {
    return null;
  }
  return usages.reduce(
    (sum, item) => sum + (typeof item?.CreditsValue === "number" ? item.CreditsValue : 0),
    0,
  );
}

/** 分模块用量：模块码走映射，认不出的原样透传；拿不到任何模块则不传。 */
export function mapCreditsModules(
  usages?: ReadonlyArray<CreditsUsageLike> | null,
): Array<{ module: CreditsModuleCode | string; credits_value: number }> | undefined {
  if (!Array.isArray(usages)) {
    return undefined;
  }
  const out: Array<{ module: CreditsModuleCode | string; credits_value: number }> = [];
  for (const item of usages) {
    const raw = typeof item?.Module === "string" ? item.Module.trim() : "";
    if (!raw) {
      continue;
    }
    out.push({
      module: MODULE_CODE_MAP[raw.toUpperCase()] ?? raw,
      credits_value: typeof item.CreditsValue === "number" ? item.CreditsValue : 0,
    });
  }
  return out.length > 0 ? out : undefined;
}

/**
 * 近 7 天逐点用量：把各模块 / 各指标的 `ValueDetailList` 按 `CalcTime` 汇总（同一时刻相加），
 * 按时间升序取最后 `limit` 个点。`CalcTime` 是有序字符串（`YYYY-MM-DD[ HH:mm:ss]`），字典序即时间序。
 */
export function buildCreditsSpark(
  usages?: ReadonlyArray<CreditsUsageLike> | null,
  limit = 7,
): Array<{ calc_time: string; credits_value: number }> | undefined {
  if (!Array.isArray(usages) || limit <= 0) {
    return undefined;
  }
  const byTime = new Map<string, number>();
  for (const item of usages) {
    const metrics = Array.isArray(item?.MetricUsageDetail) ? item.MetricUsageDetail : [];
    for (const metric of metrics) {
      const details = Array.isArray(metric?.ValueDetailList) ? metric.ValueDetailList : [];
      for (const detail of details) {
        const calcTime = typeof detail?.CalcTime === "string" ? detail.CalcTime.trim() : "";
        if (!calcTime) {
          continue;
        }
        const value = typeof detail.CreditsValue === "number" ? detail.CreditsValue : 0;
        byTime.set(calcTime, (byTime.get(calcTime) ?? 0) + value);
      }
    }
  }
  if (byTime.size === 0) {
    return undefined;
  }
  return [...byTime.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .slice(-limit)
    .map(([calc_time, credits_value]) => ({ calc_time, credits_value }));
}

/** 计费信息里本模块真正读到的字段（`EnvBillingInfoItem` 的最小子集）。 */
export interface EnvBillingLike {
  ExpireTime?: string;
  IsolatedTime?: string;
}

/** 隔离期长度（天）：面板话术是"第 15 天销毁"，与 `mcpUiCredits.expired.note` 同口径。 */
export const ISOLATION_WINDOW_DAYS = 15;

/** 解析云 API 的时间串（`YYYY-MM-DD HH:mm:ss` 或 ISO）；解析不了返回 null。 */
function parseApiTime(value?: string | null): number | null {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }
  const normalized = value.trim().replace(" ", "T");
  const ts = Date.parse(normalized);
  return Number.isNaN(ts) ? null : ts;
}

/**
 * 套餐是否已过期：进入隔离期（有 `IsolatedTime`）是最强信号；否则看到期时间是否已过。
 * 两个字段都没有 / 解析不了 → undefined（未知，不猜）。
 */
export function isBillingExpired(
  billing?: EnvBillingLike | null,
  now: Date = new Date(),
): boolean | undefined {
  if (!billing || typeof billing !== "object") {
    return undefined;
  }
  if (typeof billing.IsolatedTime === "string" && billing.IsolatedTime.trim() !== "") {
    return true;
  }
  const expireAt = parseApiTime(billing.ExpireTime);
  if (expireAt === null) {
    return undefined;
  }
  return expireAt <= now.getTime();
}

/** 隔离期剩余天数（0..15）；算不出返回 null。仅在到期分支有意义。 */
export function resolveIsolatedDaysLeft(
  billing?: EnvBillingLike | null,
  now: Date = new Date(),
): number | null {
  const isolatedAt = parseApiTime(billing?.IsolatedTime);
  if (isolatedAt === null) {
    return null;
  }
  const destroyAt = isolatedAt + ISOLATION_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const days = Math.ceil((destroyAt - now.getTime()) / (24 * 60 * 60 * 1000));
  if (!Number.isFinite(days)) {
    return null;
  }
  return Math.min(ISOLATION_WINDOW_DAYS, Math.max(0, days));
}

/** 组装面板载荷。只放"确实拿到"的字段；拿不到的一律省略（`balance` 例外，见下）。 */
export function buildEnvCreditsPayload(input: {
  envId: string;
  envAlias?: string | null;
  planRaw?: string | null;
  usages?: ReadonlyArray<CreditsUsageLike> | null;
  site: string;
  region: string;
  expired?: boolean;
  isolatedDaysLeft?: number | null;
  balance?: number | null;
}): EnvCreditsPayload {
  const { plan, plan_raw } = resolvePlanCode(input.planRaw);
  const used = sumCreditsValue(input.usages);
  // total 只有体验版配额是可读的常量；付费套餐没有来源 ⇒ 整块 credits 不传（面板缺一即隐藏）。
  const total = plan === "trial" ? TRIAL_CREDITS_TOTAL : null;
  const credits = total !== null && used !== null ? { total, used } : null;
  const modules = mapCreditsModules(input.usages);
  const spark = buildCreditsSpark(input.usages);
  // 余额没有只读来源（仓里没有对应调用路径）→ 如实传 null，面板隐藏该行；不为它新增请求。
  const balance = typeof input.balance === "number" ? input.balance : null;

  return {
    branch: resolveCreditsBranch({
      plan,
      used,
      total,
      expired: input.expired,
      balance,
    }),
    env_alias: typeof input.envAlias === "string" && input.envAlias !== "" ? input.envAlias : null,
    env_id: input.envId,
    plan,
    plan_raw,
    current_region: input.region,
    site: input.site,
    ...(credits ? { credits } : {}),
    ...(modules ? { modules } : {}),
    ...(spark ? { spark } : {}),
    balance,
    ...(typeof input.isolatedDaysLeft === "number"
      ? { isolated_days_left: input.isolatedDaysLeft }
      : {}),
  };
}
