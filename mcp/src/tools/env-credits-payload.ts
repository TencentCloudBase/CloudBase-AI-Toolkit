import type { CreditsBranch, EnvCreditsPayload, EnvMetricsPayload, MetricsState, PlanCode } from "../resources/env-credits.js";

/**
 * `queryEnv(action="usage")` 的结果 → `ui://cloudbase/env-credits` 面板载荷的映射。
 *
 * 为什么单独一层：面板按 `ui/notifications/tool-result` 拿到的载荷渲染，键名是**面板契约**
 * （见 `resources/env-credits.ts` 的 `EnvCreditsPayload`）。把"云 API 响应 → 面板载荷"的换算
 * 收在这里，env.ts 只负责调用；换算全是纯函数，可单测。
 *
 * 三条纪律：
 *   1. **不猜**：认不出的套餐码进 `plan_raw`（折叠区用，正文不显示）；**模块码一律映射成
 *      规范键、绝不透传**（认不出的落 `other`）；信息不足时 `branch` 返回 `unknown`，不硬凑成
 *      某个分支。分支话术里断言过的前提（如体验版耗尽那句写着"账户余额充足"）不成立时，宁可 `unknown`。
 *   2. **不编数**：`credits` 要 total 与 used 都拿到才带全（调用方按 `type` 过滤过时只带 `used`，
 *      因为那时的 `used` 是子集而 `total` 是全量，两个放一起会得出错误结论）；`CreditsValue` 缺失
 *      的条目**跳过**、绝不当 0；total 来自 `PLAN_CREDITS_TOTAL` 这张**有官方出处**的常量表，
 *      套餐码认不出就不传 total，不拿默认值兜底；余额没有只读来源就传 null，不为它新增调用。
 *   3. **不新增依赖 / 不发请求**：这里只做纯换算。
 */

/** 付费套餐码（`plan` 枚举里除体验版之外的全部）。 */
const PAID_PLAN_CODES: readonly PlanCode[] = [
  "personal",
  "standard",
  "enterprise",
  "enterpriseAdvanced",
];

/**
 * 面板模块的**规范键**集合（固定 10 个；云 API 的模块码一律不出现在载荷里）。
 *
 * 每一项都必须**真的可能有码映射过来**：`functions` / `database` / `storage` 是既有三项，
 * `ai` / `auth` / `api` / `http` / `hosting` / `workflow` 是有官方依据的六项，加兜底 `other`。
 * 曾经留过的 `cdn` 已移除——`ENV_USAGE_MODULE_VALUES` 里没有任何码指向它，留着就是个永不产出的死键。
 *
 * **只有含义明确才给具体键**：`VM`（找不到能确认它指什么的出处）与 `EKS`（无对应类目）
 * 以及任何未列出的码一律落 `other`——宁可少说，也不编一个不准的名字。
 */
export type CreditsModuleKey =
  | "functions"
  | "database"
  | "storage"
  | "ai"
  | "auth"
  | "api"
  | "http"
  | "hosting"
  | "workflow"
  | "other";

/** 规范键集合的数组形式（测试用来断言"结果一定落在集合内、绝无原始码"）。 */
export const CREDITS_MODULE_KEYS: readonly CreditsModuleKey[] = [
  "functions",
  "database",
  "storage",
  "ai",
  "auth",
  "api",
  "http",
  "hosting",
  "workflow",
  "other",
];

/**
 * 云 API 模块码 → 规范键。按 `ENV_USAGE_MODULE_VALUES`（`env.ts`）逐项映射，
 * **只有含义明确（有官方依据）的才给具体键**：
 *   FLEXDB(文档型数据库) / TDSQL(关系型数据库) → database；SCF(云函数) → functions
 *   COS(对象存储) → storage；AI → ai；Auth(身份认证) → auth
 *   APIInvocation(小程序 / 云开发 API 调用) → api
 *   HTTPInvocation(HTTP 网关，资源点计费文档里是独立计费项) → http
 *   HOSTING(托管) → hosting；Workflow(工作流，独立计费项) → workflow
 *   EKS（无对应类目）/ VM（找不到能确认它指什么的出处）/ Other → other
 *     —— 不是"没看懂"，而是没有把握，按口径落 `other`（"其它"）而不是编一个不准的名字。
 *
 * 默认查询（不传 `type`）是**全模块**，所以这张表必须覆盖全部 13 个模块码；漏掉任何一个都会被
 * `?? "other"` 兜底，不会再原样透传给用户。
 */
const MODULE_KEY_MAP: Record<string, CreditsModuleKey> = {
  FLEXDB: "database",
  TDSQL: "database",
  SCF: "functions",
  COS: "storage",
  AI: "ai",
  AUTH: "auth",
  APIINVOCATION: "api",
  HTTPINVOCATION: "http",
  HOSTING: "hosting",
  WORKFLOW: "workflow",
  EKS: "other",
  VM: "other",
  OTHER: "other",
};

/** 模块码 → 规范键；认不出的一律 `other`（**绝不透传原始码**）。 */
export function moduleKeyOf(raw: string): CreditsModuleKey {
  return MODULE_KEY_MAP[raw.trim().toUpperCase()] ?? "other";
}

/**
 * 取条目的资源点用量：**必须是有限数**才可用。
 *
 * 为什么严格：`CreditsValue` 缺失时把它当 0 是**编数**——面板会显示「0 / 3000 用量正常」，
 * 而真实情况是"这一项的用量拿不到"。拿不到就跳过该项，绝不用 0 兜底。
 */
function finiteCreditsValue(item: { CreditsValue?: unknown } | null | undefined): number | null {
  const value = item?.CreditsValue;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * 套餐 → 月度资源点配额（点/月）。
 *
 * 出处：腾讯云文档《云开发 CloudBase 资源点价格文档》`product/876/127357`
 * 「套餐配额与能力项说明」表的**资源点**行（该表最近更新 2026-09-23，抓取于 2026-10-15）：
 * 免费体验版 3000 / 个人版 40,000 / 标准版 330,000 / 企业版 1,500,000 / 企业高级版 6,500,000。
 * 交叉印证：《云开发 CloudBase 套餐及资源包说明》`product/876/136006` 也写了个人版套餐内配额
 * 40,000 资源点（与上表一致）。体验版 3000 另见 876/127357「免费体验」节「3000 点/月」。
 *
 * 口径与红线：
 *   - 只收**套餐配额**，不把资源包、按量计费、赠送额度算进来（三者都会让"额度上限"不是固定值）；
 *   - 配额随账期重置，所以这个数只在"当前计费周期"内可比；
 *   - **核不到就不传**：`plan` 为空（认不出的套餐码）时不得回退到任何一个默认配额，宁可让面板留空。
 *     要新增/修正这张表，必须给出可引用的官方出处与抓取日期。
 */
export const PLAN_CREDITS_TOTAL: Record<PlanCode, number> = {
  trial: 3000,
  personal: 40000,
  standard: 330000,
  enterprise: 1500000,
  enterpriseAdvanced: 6500000,
};

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
 * 分支判定（顺序即优先级）：
 *   1. 套餐过期（`expired === true`）——过期后是隔离期，先解决续费；
 *   2. 资源点耗尽（`used >= total`，两者都已知）：体验版 → `trialExhausted`（该分支话术断言
 *      "账户余额充足"，余额为负时不成立 ⇒ 退回 `unknown`）；付费版 → `stopped`；
 *   3. 余额为负且资源点未耗尽 → `arrears`（与话术"套餐内资源点仍够用时"一致）；
 *   4. 能确认"无告警"→ `normal`：配额已知、用量未到顶、**套餐明确未过期**（`expired === false`）、
 *      余额未知或非负；
 *   5. 其余 → `unknown`（信息不足，不猜）。
 *
 * 「未过期」必须是**确认**来的（`expired === false`）：到期字段缺失时 `expired` 是 undefined，
 * 那时给 `normal` 就是在猜健康，一律落回 `unknown`。
 */
export function resolveCreditsBranch(input: CreditsBranchInput): CreditsBranch {
  const { plan, used, total, expired, balance } = input;
  if (expired === true) {
    return "expired";
  }
  const totalKnown = typeof total === "number" && total > 0;
  const usedKnown = typeof used === "number";
  const negativeBalance = typeof balance === "number" && balance < 0;
  if (totalKnown && usedKnown && used >= total) {
    if (plan === "trial") {
      return negativeBalance ? "unknown" : "trialExhausted";
    }
    if (plan !== null) {
      return "stopped";
    }
    return "unknown";
  }
  if (negativeBalance) {
    return "arrears";
  }
  if (totalKnown && usedKnown && expired === false) {
    return "normal";
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

/**
 * 求和是否**完整**：数组存在、且**每个**条目都带有限数 `CreditsValue`。
 *
 * 空列表视为完整（没有条目缺失，和为真实的 0）；拿不到列表视为不完整。
 * 不完整的和不配拿去做结论——部分和配全量配额会得出错误的"用量正常"（与"按 type 过滤"
 * 是同一类问题），所以调用方要据此省略 `total` 并把结论压成 `unknown`。
 */
export function isCreditsSumComplete(
  usages?: ReadonlyArray<CreditsUsageLike> | null,
): boolean {
  if (!Array.isArray(usages)) {
    return false;
  }
  return usages.every((item) => finiteCreditsValue(item) !== null);
}

/**
 * `Usages[].CreditsValue` 求和。三种情况严格区分：
 *   - 列表本身拿不到（不是数组）→ `null`；
 *   - **空列表 → `0`**（"查询成功，这一周期确实没用量"，是真实的值）；
 *   - 有条目但**没有一个**条目带有限数 `CreditsValue` → `null`（不可用），**不退化成 0**。
 * 缺值的条目在求和时跳过，不按 0 计。
 */
export function sumCreditsValue(
  usages?: ReadonlyArray<CreditsUsageLike> | null,
): number | null {
  if (!Array.isArray(usages)) {
    return null;
  }
  if (usages.length === 0) {
    return 0;
  }
  let sum = 0;
  let counted = 0;
  for (const item of usages) {
    const value = finiteCreditsValue(item);
    if (value === null) {
      continue;
    }
    sum += value;
    counted += 1;
  }
  return counted === 0 ? null : sum;
}

/**
 * 分模块用量：模块码一律映射成**规范键**（认不出的落 `other`，绝不透传原始码），
 * 并且**按规范键聚合**——同一键的多条累加。
 *
 * 为什么必须聚合：默认查询（不传 `type`）是全模块，而 `EKS` / `HOSTING` / `VM` / `Workflow`
 * 等多个码都会落 `other`；不聚合的话面板会渲染成「其它 5 · 其它 3 · 其它 1」这种重复行。
 * 聚合只影响**展示行**，不改变 `used` 的来源口径（`used` 仍是 `sumCreditsValue` 逐条求和，
 * 两者数值一致）。
 *
 * 缺 `CreditsValue` 的条目跳过（不按 0 计）；一个模块都出不来则不传。行的顺序 = 各规范键
 * 首次出现的顺序。
 */
export function mapCreditsModules(
  usages?: ReadonlyArray<CreditsUsageLike> | null,
): Array<{ module: CreditsModuleKey; credits_value: number }> | undefined {
  if (!Array.isArray(usages)) {
    return undefined;
  }
  const totals = new Map<CreditsModuleKey, number>();
  for (const item of usages) {
    const raw = typeof item?.Module === "string" ? item.Module.trim() : "";
    const value = finiteCreditsValue(item);
    if (!raw || value === null) {
      continue;
    }
    const key = moduleKeyOf(raw);
    totals.set(key, (totals.get(key) ?? 0) + value);
  }
  if (totals.size === 0) {
    return undefined;
  }
  return [...totals.entries()].map(([module, credits_value]) => ({ module, credits_value }));
}

/**
 * 近 7 天逐点用量：把各模块 / 各指标的 `ValueDetailList` 按 `CalcTime` 汇总（同一时刻相加），
 * 按时间升序取最后 `limit` 个点。`CalcTime` 是有序字符串（`YYYY-MM-DD[ HH:mm:ss]`），字典序即时间序。
 *
 * **曲线只看逐点值，不看条目级聚合值**：逐日明细本身就是真数据，条目级 `CreditsValue` 缺失
 * 不该让整条曲线消失。缺值的是**逐点**时才跳过那一个点（不用 0 补）。
 * 条目级聚合值缺失的**后果**不在这里体现，而是由 `buildEnvCreditsPayload` 的"求和不完整"
 * 保护处理：省略 `total` + 结论压成 `unknown`（见那里的注释）。
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
        const value = finiteCreditsValue(detail);
        if (!calcTime || value === null) {
          continue;
        }
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

/**
 * 组装面板载荷。只放"确实拿到"的字段；拿不到的一律省略（`balance` 例外，见下）。
 *
 * 两种"数字不可比"的情形都会**省掉 `total` 并把结论压成 `unknown`**（"这份数据不足以判断"），
 * 因为拿一个不完整的用量去对全量配额，会得出错误的"用量正常"：
 *   1. **按 `type` 过滤过**（`modulesFiltered`，由调用方显式传入、不靠模块数量猜）：
 *      `used` 只是被选模块的子集；
 *   2. **求和本身不完整**（任一 `Usages[]` 条目缺有限数 `CreditsValue`，见 `isCreditsSumComplete`）：
 *      部分和。
 * 两种情形下 `credits` 只带 `used`（面板 `pct === null` 时不画进度条），`modules` / `spark`
 * 照常如实展示——曲线尤其不该因为条目级聚合值缺失而整条消失。
 */
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
  modulesFiltered?: boolean;
}): EnvCreditsPayload {
  const filtered = input.modulesFiltered === true;
  const sumComplete = isCreditsSumComplete(input.usages);
  // 两种情形都"不可下结论"
  const comparable = !filtered && sumComplete;
  const { plan, plan_raw } = resolvePlanCode(input.planRaw);
  const used = sumCreditsValue(input.usages);
  // 配额查表；数字不可比时不给 total，套餐码认不出也不给（见 PLAN_CREDITS_TOTAL，不拿默认值兜底）。
  const total = comparable && plan ? PLAN_CREDITS_TOTAL[plan] : null;
  const credits =
    used === null ? null : comparable && total !== null ? { total, used } : { used };
  const modules = mapCreditsModules(input.usages);
  const spark = buildCreditsSpark(input.usages);
  // 余额没有只读来源（仓里没有对应调用路径）→ 如实传 null，面板隐藏该行；不为它新增请求。
  const balance = typeof input.balance === "number" ? input.balance : null;

  return {
    branch: comparable
      ? resolveCreditsBranch({
          plan,
          used,
          total,
          expired: input.expired,
          balance,
        })
      : "unknown",
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

/**
 * 指标曲线的抽样上限。
 *
 * 为什么是 48：面板曲线画布宽 280px（`resources/env-credits.ts` 的 `spark-svg`），48 点约合
 * 每 5.8px 一个点——再密在视觉上没有区别；而默认查询（最近 24h、粒度 300s）会产生约 288 个样本，
 * 原样塞进 `structuredContent` 是 **288×2 个数**，抽样后 ≤ 96 个数，载荷体积与宿主时延都可控。
 * 抽样是**均匀取点**（含首尾），不改变"峰值在哪里"这一结论——峰值本身来自 `Summary.max`，
 * 不依赖抽样是否恰好取到那个点。
 */
export const METRICS_SPARK_MAX_POINTS = 48;

/** 曲线里能用的值（优先 `NewValues`，退回 `Values`；非有限数一律丢弃，不当 0）。 */
function pickMetricSeries(curve: {
  Values?: unknown;
  NewValues?: unknown;
} | null | undefined): number[] {
  const raw = curve && Array.isArray(curve.NewValues) && curve.NewValues.length > 0
    ? curve.NewValues
    : curve && Array.isArray(curve.Values)
      ? curve.Values
      : [];
  const out: number[] = [];
  for (let i = 0; i < raw.length; i++) {
    const value = raw[i];
    if (typeof value === "number" && Number.isFinite(value)) { out.push(value); }
  }
  return out;
}

/**
 * 曲线时间轴（与值一一对应才可用）。
 *
 * `describeCurveData` 的 `Time` 真机形状未实测（本仓只有类型层面的 `unknown` 防御）：
 * 这里**只接受与值等长的数组**，元素原样转成短字符串，认不出就不给时间——
 * 宁可不显示时间，也不编一个时间。
 */
function pickMetricTimes(curve: { Time?: unknown } | null | undefined, length: number): string[] | null {
  const raw = curve && Array.isArray(curve.Time) ? curve.Time : null;
  if (!raw || raw.length !== length) { return null; }
  const out: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    if (typeof item === "number" && Number.isFinite(item)) {
      out.push(formatCurveTime(item));
    } else if (typeof item === "string" && item.length > 0) {
      out.push(item);
    } else {
      return null;
    }
  }
  return out;
}

/**
 * 曲线时间点 → 可读短串。
 *
 * **未实测的假设**：值 ≥ 1e12 视为毫秒，否则视为秒（这是 `describeCurveData` 常见的两种口径）。
 * 判断错的后果只是时间显示不对，不会影响数值与状态——所以这里选择"给出可读时间"而不是"因为不确定就不给"，
 * 但把它记在报告里作为待真机确认项。
 */
export function formatCurveTime(value: number): string {
  const ms = value >= 1e12 ? value : value * 1000;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) { return String(value); }
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 均匀抽样（含首尾），返回原数组的索引。 */
export function downsampleMetricIndices(length: number, maxPoints: number): number[] {
  if (length <= 0) { return []; }
  if (length <= maxPoints) {
    const all: number[] = [];
    for (let i = 0; i < length; i++) { all.push(i); }
    return all;
  }
  const out: number[] = [];
  const step = (length - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints; i++) {
    const index = Math.round(i * step);
    if (out[out.length - 1] !== index) { out.push(index); }
  }
  return out;
}

/**
 * `queryEnv(action="metrics")` 的结果 → 监控指标卡载荷。
 *
 * 纪律（与用量卡同一套）：
 *   1. **不编阈值**：状态只有"有数据 / 无流量"两种由数据推出的结论（`failed` 由面板在
 *      `isError` 的结果上置位，不由这里猜）；**没有阈值字段就不显示"正常/异常"**。
 *   2. **不编数**：`Summary` 里拿不到的字段一律不带（面板隐藏该行）；`Curve` 非有限数一律丢弃；
 *      时间轴对不上就不给时间。
 *   3. **裁剪**：曲线按 `METRICS_SPARK_MAX_POINTS` 均匀抽样；`Curve` 原样**不进**载荷。
 */
export function buildEnvMetricsPayload(input: {
  envId: string;
  envAlias?: string | null;
  metricName: string;
  site: string;
  region: string;
  planRaw?: string | null;
  periodSeconds?: number | null;
  startTime?: string | null;
  endTime?: string | null;
  summary?: {
    sampleCount?: unknown;
    max?: unknown;
    min?: unknown;
    avg?: unknown;
    latest?: unknown;
    peakTimestamp?: unknown;
    allZero?: unknown;
  } | null;
  curve?: { Values?: unknown; NewValues?: unknown; Time?: unknown } | null;
}): EnvMetricsPayload {
  const summary = input.summary ?? {};
  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  const values = pickMetricSeries(input.curve);
  const sampleCount = num(summary.sampleCount) ?? values.length;
  const allZero = summary.allZero === true || (sampleCount > 0 && values.every((v) => v === 0));
  const state: MetricsState = sampleCount === 0 || allZero ? "noData" : "data";

  // 时间轴：只为曲线与峰值时间服务；对不上就都不给
  const times = pickMetricTimes(input.curve, values.length);
  const indices = downsampleMetricIndices(values.length, METRICS_SPARK_MAX_POINTS);
  const spark = indices.length
    ? indices.map((index) => ({
        ...(times ? { calc_time: times[index] } : {}),
        credits_value: values[index],
      }))
    : undefined;

  // 峰值时间：Summary 只给下标对应的时间戳，且真机形状未实测 ⇒ 认不出就整项不显示
  const peakTimestamp = num(summary.peakTimestamp);
  const peakTime = peakTimestamp === null ? null : formatCurveTime(peakTimestamp);

  const { plan } = resolvePlanCode(input.planRaw ?? null);

  return {
    kind: "metrics",
    state,
    metric: input.metricName,
    env_alias: typeof input.envAlias === "string" && input.envAlias !== "" ? input.envAlias : null,
    env_id: input.envId,
    current_region: input.region,
    site: input.site,
    plan,
    sample_count: sampleCount,
    ...(typeof input.periodSeconds === "number" ? { period_seconds: input.periodSeconds } : {}),
    ...(input.startTime ? { start_time: input.startTime } : {}),
    ...(input.endTime ? { end_time: input.endTime } : {}),
    latest: num(summary.latest),
    max: num(summary.max),
    min: num(summary.min),
    avg: num(summary.avg),
    peak_time: peakTime,
    ...(spark ? { spark } : {}),
  };
}
