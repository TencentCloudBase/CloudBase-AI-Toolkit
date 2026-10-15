import { describe, expect, it } from "vitest";
import {
  buildCreditsSpark,
  buildEnvCreditsPayload,
  CREDITS_MODULE_KEYS,
  isBillingExpired,
  isCreditsSumComplete,
  mapCreditsModules,
  moduleKeyOf,
  resolveCreditsBranch,
  resolveIsolatedDaysLeft,
  resolvePlanCode,
  sumCreditsValue,
  PLAN_CREDITS_TOTAL,
  type CreditsUsageLike,
} from "./env-credits-payload.js";

const SCF: CreditsUsageLike = {
  Module: "SCF",
  CreditsValue: 12,
  MetricUsageDetail: [
    {
      ValueDetailList: [
        { CalcTime: "2026-08-01", CreditsValue: 2 },
        { CalcTime: "2026-08-02", CreditsValue: 4 },
        { CalcTime: "2026-08-03", CreditsValue: 6 },
      ],
    },
  ],
};
const COS: CreditsUsageLike = {
  Module: "COS",
  CreditsValue: 30,
  MetricUsageDetail: [
    {
      ValueDetailList: [
        { CalcTime: "2026-08-02", CreditsValue: 5 },
        { CalcTime: "2026-08-03", CreditsValue: 25 },
      ],
    },
  ],
};

describe("resolvePlanCode", () => {
  it("体验族（free / activity / trial / 中文）归到 trial", () => {
    expect(resolvePlanCode("baas_free").plan).toBe("trial");
    expect(resolvePlanCode("baas_activity").plan).toBe("trial");
    expect(resolvePlanCode("trial").plan).toBe("trial");
    expect(resolvePlanCode("免费体验版").plan).toBe("trial");
  });

  it("付费族要求与前缀剥离后的枚举完全相等，不做模糊包含匹配", () => {
    expect(resolvePlanCode("baas_personal").plan).toBe("personal");
    expect(resolvePlanCode("baas_pf_standard").plan).toBe("standard");
    expect(resolvePlanCode("baas_enterprise").plan).toBe("enterprise");
    expect(resolvePlanCode("baas_pf_enterprise_advanced").plan).toBe("enterpriseAdvanced");
  });

  it("认不出时 plan 为空、plan_raw 原样保留（不猜）", () => {
    expect(resolvePlanCode("baas_ultra")).toEqual({
      plan: null,
      plan_raw: "baas_ultra",
    });
    expect(resolvePlanCode("pkg-id-a")).toEqual({ plan: null, plan_raw: "pkg-id-a" });
    expect(resolvePlanCode(null)).toEqual({ plan: null, plan_raw: null });
    expect(resolvePlanCode("  ")).toEqual({ plan: null, plan_raw: null });
  });
});

describe("resolveCreditsBranch（四分支 + 信息不足）", () => {
  it("体验版达上限 → trialExhausted", () => {
    expect(
      resolveCreditsBranch({ plan: "trial", used: 3000, total: 3000, balance: 100 }),
    ).toBe("trialExhausted");
    expect(
      resolveCreditsBranch({ plan: "trial", used: 3100, total: 3000, balance: null }),
    ).toBe("trialExhausted");
  });

  it("付费版达上限 → stopped", () => {
    expect(
      resolveCreditsBranch({ plan: "standard", used: 5000, total: 5000, balance: 10 }),
    ).toBe("stopped");
    expect(
      resolveCreditsBranch({ plan: "enterpriseAdvanced", used: 9, total: 9, balance: null }),
    ).toBe("stopped");
  });

  it("套餐过期 → expired（优先于其它分支）", () => {
    expect(
      resolveCreditsBranch({ plan: "trial", used: 3000, total: 3000, expired: true }),
    ).toBe("expired");
    expect(
      resolveCreditsBranch({ plan: "personal", used: 1, total: null, expired: true }),
    ).toBe("expired");
  });

  it("余额为负且资源点未耗尽 → arrears", () => {
    expect(
      resolveCreditsBranch({ plan: "personal", used: 10, total: null, balance: -0.5 }),
    ).toBe("arrears");
  });

  it("确认无告警 → normal（边界：total-1 是 normal、total 是耗尽）", () => {
    expect(
      resolveCreditsBranch({ plan: "personal", used: 39999, total: 40000, expired: false }),
    ).toBe("normal");
    expect(
      resolveCreditsBranch({
        plan: "personal",
        used: 40000,
        total: 40000,
        expired: false,
        balance: 0,
      }),
    ).toBe("stopped");
    expect(
      resolveCreditsBranch({ plan: "trial", used: 2999, total: 3000, expired: false }),
    ).toBe("normal");
    // 余额未知或非负都算"无告警"
    expect(
      resolveCreditsBranch({ plan: "trial", used: 0, total: 3000, expired: false, balance: null }),
    ).toBe("normal");
    expect(
      resolveCreditsBranch({ plan: "standard", used: 1, total: 330000, expired: false, balance: 12.5 }),
    ).toBe("normal");
  });

  it("信息不足 → unknown（不猜）：total 未知、套餐码认不出、到期未知都不给 normal", () => {
    // 没有 total 就判断不了"耗尽"，也确认不了"够用"
    expect(resolveCreditsBranch({ plan: "standard", used: 9999, total: null })).toBe("unknown");
    // 套餐码认不出
    expect(resolveCreditsBranch({ plan: null, used: 10, total: 10 })).toBe("unknown");
    // 什么都没有
    expect(resolveCreditsBranch({ plan: null })).toBe("unknown");
    // 用量没到顶但**到期未知**（expired 字段缺失）⇒ 不能确认无告警
    expect(resolveCreditsBranch({ plan: "trial", used: 1, total: 3000, balance: 5 })).toBe(
      "unknown",
    );
    expect(
      resolveCreditsBranch({ plan: "trial", used: 1, total: 3000, expired: undefined }),
    ).toBe("unknown");
  });

  it("欠费优先于 normal：余额为负且未耗尽 → arrears", () => {
    expect(
      resolveCreditsBranch({ plan: "trial", used: 1, total: 3000, expired: false, balance: -3 }),
    ).toBe("arrears");
  });

  it("体验版耗尽但余额为负 → unknown：trialExhausted 的话术断言「账户余额充足」，此时不成立", () => {
    expect(
      resolveCreditsBranch({ plan: "trial", used: 3000, total: 3000, balance: -1 }),
    ).toBe("unknown");
  });
});

describe("用量换算", () => {
  it("used 是 Usages[].CreditsValue 求和；列表为空是 0，拿不到是 null", () => {
    expect(sumCreditsValue([SCF, COS])).toBe(42);
    expect(sumCreditsValue([])).toBe(0);
    expect(sumCreditsValue(null)).toBeNull();
    expect(sumCreditsValue(undefined)).toBeNull();
  });

  it("模块码一律映射成规范键，认不出的落 other，绝不透传原始码", () => {
    expect(mapCreditsModules([SCF, COS, { Module: "HOSTING", CreditsValue: 3 }])).toEqual([
      { module: "functions", credits_value: 12 },
      { module: "storage", credits_value: 30 },
      { module: "hosting", credits_value: 3 },
    ]);
    // 认不出的码（含大小写/空白差异）也落 other，不原样出现
    expect(moduleKeyOf("ZZZ-UNKNOWN")).toBe("other");
    expect(moduleKeyOf("  ")).toBe("other");
    expect(mapCreditsModules([{ Module: "ZZZ-UNKNOWN", CreditsValue: 1 }])).toEqual([
      { module: "other", credits_value: 1 },
    ]);
    expect(mapCreditsModules([])).toBeUndefined();
    expect(mapCreditsModules(null)).toBeUndefined();
  });

  // 镜像 ENV_USAGE_MODULE_VALUES（env.ts）的全部 13 个码
  const codes = [
    "FLEXDB",
    "TDSQL",
    "SCF",
    "EKS",
    "COS",
    "AI",
    "HOSTING",
    "Auth",
    "APIInvocation",
    "HTTPInvocation",
    "VM",
    "Workflow",
    "Other",
  ];

  it("规范键集合固定 10 个，且覆盖每个已知模块码", () => {
    expect([...CREDITS_MODULE_KEYS]).toEqual([
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
    ]);
    // 每个成员都必须真的有码能映射过来（不留永不产出的死键，例如曾经留过的 cdn）
    const reachable = new Set(codes.map((code) => moduleKeyOf(code)));
    for (const key of CREDITS_MODULE_KEYS) {
      expect(reachable, `${key} 应有模块码映射到它`).toContain(key);
    }
    for (const code of codes) {
      const key = moduleKeyOf(code);
      expect(CREDITS_MODULE_KEYS, `${code} 应落在规范键集合内`).toContain(key);
      // 规范键一律小写，且不等于云 API 的原始码（原码都是大写/驼峰形式）
      expect(key).toBe(key.toLowerCase());
      expect(key).not.toBe(code);
    }
    // 只有含义明确的才给具体键
    expect(moduleKeyOf("FLEXDB")).toBe("database");
    expect(moduleKeyOf("TDSQL")).toBe("database");
    expect(moduleKeyOf("SCF")).toBe("functions");
    expect(moduleKeyOf("COS")).toBe("storage");
    expect(moduleKeyOf("AI")).toBe("ai");
    expect(moduleKeyOf("Auth")).toBe("auth");
    expect(moduleKeyOf("APIInvocation")).toBe("api");
    // 有官方依据的三项
    expect(moduleKeyOf("HTTPInvocation")).toBe("http");
    expect(moduleKeyOf("HOSTING")).toBe("hosting");
    expect(moduleKeyOf("Workflow")).toBe("workflow");
    // 没有把握的一律落 other（宁可少说，不编不准的名字）
    expect(moduleKeyOf("EKS")).toBe("other");
    expect(moduleKeyOf("VM")).toBe("other");
    expect(moduleKeyOf("Other")).toBe("other");
  });

  it("同一规范键的多条聚合为一行（多个码落 other 时尤其重要）", () => {
    // FLEXDB 与 TDSQL 都落 database → 一行、值累加
    expect(
      mapCreditsModules([
        { Module: "FLEXDB", CreditsValue: 2 },
        { Module: "TDSQL", CreditsValue: 3 },
      ]),
    ).toEqual([{ module: "database", credits_value: 5 }]);

    // EKS / VM / 未知码都落 other → 只出一行「其它」，不出现重复行
    expect(
      mapCreditsModules([
        { Module: "SCF", CreditsValue: 12 },
        { Module: "EKS", CreditsValue: 5 },
        { Module: "VM", CreditsValue: 7 },
        { Module: "ZZZ-UNKNOWN", CreditsValue: 1 },
      ]),
    ).toEqual([
      { module: "functions", credits_value: 12 },
      { module: "other", credits_value: 13 },
    ]);

    // 行的顺序 = 各规范键首次出现的顺序
    const rowOrder = mapCreditsModules([
      { Module: "HOSTING", CreditsValue: 1 },
      { Module: "SCF", CreditsValue: 2 },
      { Module: "Workflow", CreditsValue: 3 },
    ]) ?? [];
    expect(rowOrder.map((row) => row.module)).toEqual(["hosting", "functions", "workflow"]);
  });

  it("缺 CreditsValue 的条目在求和与分模块处跳过、不当 0（曲线不受它影响，见下一条）", () => {
    const valueless: CreditsUsageLike = {
      Module: "COS",
      MetricUsageDetail: [{ ValueDetailList: [{ CalcTime: "2026-08-09", CreditsValue: 7 }] }],
    };
    // 求和：跳过缺值条目，不退化成"把它当 0"
    expect(sumCreditsValue([SCF, valueless])).toBe(12);
    // 全缺 ⇒ 不可用，不是 0
    expect(sumCreditsValue([{ Module: "SCF" }, valueless])).toBeNull();
    expect(sumCreditsValue([{ Module: "SCF", CreditsValue: Number.NaN }])).toBeNull();
    expect(sumCreditsValue([{ Module: "SCF", CreditsValue: Number.POSITIVE_INFINITY }])).toBeNull();
    // 空列表仍是 0：查询成功、本周期确实没用量（与"拿不到"严格区分）
    expect(sumCreditsValue([])).toBe(0);
    // 分模块同样跳过该条目（不出现 credits_value: 0）
    expect(mapCreditsModules([SCF, valueless])).toEqual([{ module: "functions", credits_value: 12 }]);
    // 但**曲线不受条目级聚合值影响**：逐日明细是真数据，照样画
    expect(buildCreditsSpark([SCF, valueless])).toEqual([
      { calc_time: "2026-08-01", credits_value: 2 },
      { calc_time: "2026-08-02", credits_value: 4 },
      { calc_time: "2026-08-03", credits_value: 6 },
      { calc_time: "2026-08-09", credits_value: 7 },
    ]);
  });

  it("求和完整性：每个条目都有有限聚合值才算完整（空列表完整、拿不到列表不完整）", () => {
    expect(isCreditsSumComplete([])).toBe(true);
    expect(isCreditsSumComplete([SCF, COS])).toBe(true);
    expect(isCreditsSumComplete(null)).toBe(false);
    expect(isCreditsSumComplete(undefined)).toBe(false);
    expect(isCreditsSumComplete([{ Module: "SCF" }])).toBe(false);
    expect(isCreditsSumComplete([SCF, { Module: "COS" }])).toBe(false);
  });

  it("spark 按 CalcTime 汇总并只留最近 7 个点", () => {
    expect(buildCreditsSpark([SCF, COS])).toEqual([
      { calc_time: "2026-08-01", credits_value: 2 },
      { calc_time: "2026-08-02", credits_value: 9 },
      { calc_time: "2026-08-03", credits_value: 31 },
    ]);

    const many: CreditsUsageLike[] = [
      {
        Module: "SCF",
        CreditsValue: 55,
        MetricUsageDetail: [
          {
            ValueDetailList: Array.from({ length: 10 }, (_, index) => ({
              CalcTime: `2026-08-${String(index + 1).padStart(2, "0")}`,
              CreditsValue: index + 1,
            })),
          },
        ],
      },
    ];
    const points = buildCreditsSpark(many);
    expect(points).toHaveLength(7);
    expect(points?.[0]?.calc_time).toBe("2026-08-04");
    expect(points?.[6]?.calc_time).toBe("2026-08-10");

    expect(buildCreditsSpark([])).toBeUndefined();
    expect(buildCreditsSpark([{ Module: "SCF", MetricUsageDetail: [] }])).toBeUndefined();
  });
});

describe("计费时间推导", () => {
  const now = new Date("2026-09-06T00:00:00");

  it("进入隔离期即视为过期；否则看到期时间", () => {
    expect(isBillingExpired({ IsolatedTime: "2026-09-01 00:00:00" }, now)).toBe(true);
    expect(isBillingExpired({ ExpireTime: "2026-09-01 00:00:00" }, now)).toBe(true);
    expect(isBillingExpired({ ExpireTime: "2026-10-01 00:00:00" }, now)).toBe(false);
    expect(isBillingExpired({}, now)).toBeUndefined();
    expect(isBillingExpired({ ExpireTime: "not-a-time" }, now)).toBeUndefined();
    expect(isBillingExpired(null, now)).toBeUndefined();
  });

  it("隔离期剩余天数按 15 天窗口算，并在 0..15 内夹紧", () => {
    expect(resolveIsolatedDaysLeft({ IsolatedTime: "2026-09-01 00:00:00" }, now)).toBe(10);
    expect(resolveIsolatedDaysLeft({ IsolatedTime: "2026-09-05 00:00:00" }, now)).toBe(14);
    expect(resolveIsolatedDaysLeft({ IsolatedTime: "2026-08-01 00:00:00" }, now)).toBe(0);
    expect(resolveIsolatedDaysLeft({ ExpireTime: "2026-09-01 00:00:00" }, now)).toBeNull();
    expect(resolveIsolatedDaysLeft(null, now)).toBeNull();
  });
});

describe("PLAN_CREDITS_TOTAL（官方文档配额表：876/127357）", () => {
  it("五种套餐都有配额，且与文档一致（体验版 3000 / 个人版 40000 / 标准版 330000 / 企业版 1500000 / 企业高级版 6500000）", () => {
    expect(PLAN_CREDITS_TOTAL).toEqual({
      trial: 3000,
      personal: 40000,
      standard: 330000,
      enterprise: 1500000,
      enterpriseAdvanced: 6500000,
    });
  });
});

describe("按 type 过滤过的查询：used 是子集，不能配全量 total", () => {
  const base = {
    envId: "env-filtered",
    planRaw: "baas_free",
    usages: [SCF],
    site: "domestic",
    region: "ap-shanghai",
    expired: false,
  };

  it("过滤时只给 used、不给 total，结论压成 unknown；modules / spark 照实给", () => {
    const payload = buildEnvCreditsPayload({ ...base, modulesFiltered: true });

    expect(payload.branch).toBe("unknown");
    expect(payload.credits).toEqual({ used: 12 });
    expect(payload.credits).not.toHaveProperty("total");
    // 过滤后的子集照实展示（它们本来就是被选模块的数据）
    expect(payload.modules).toEqual([{ module: "functions", credits_value: 12 }]);
    expect(payload.spark).toHaveLength(3);
    // 套餐本身仍然照实给（与过滤无关）
    expect(payload.plan).toBe("trial");
  });

  it("对照组：同一条数据不过滤时给 total 与真实结论", () => {
    const payload = buildEnvCreditsPayload({ ...base });

    expect(payload.credits).toEqual({ total: PLAN_CREDITS_TOTAL.trial, used: 12 });
    expect(payload.branch).toBe("normal");
  });

  it("过滤 + 用量拿不到 ⇒ 连 credits 都不传（不留一个只有 used 的空壳）", () => {
    const payload = buildEnvCreditsPayload({
      ...base,
      usages: [{ Module: "SCF" }],
      modulesFiltered: true,
    });

    expect(payload).not.toHaveProperty("credits");
    expect(payload.branch).toBe("unknown");
    expect(payload).not.toHaveProperty("modules");
  });
});

describe("求和不完整（部分和）保护：不配全量配额、不下结论", () => {
  const detailWithoutAggregate: CreditsUsageLike = {
    Module: "COS",
    MetricUsageDetail: [{ ValueDetailList: [{ CalcTime: "2026-08-09", CreditsValue: 7 }] }],
  };

  it("有条目缺聚合值 ⇒ 曲线照画、省掉 total、结论压成 unknown", () => {
    const payload = buildEnvCreditsPayload({
      envId: "env-partial",
      planRaw: "baas_free",
      usages: [SCF, detailWithoutAggregate],
      site: "domestic",
      region: "ap-shanghai",
      expired: false,
    });

    expect(payload.branch).toBe("unknown");
    // 部分和照给（面板 pct === null 时不画进度条），但不配全量配额
    expect(payload.credits).toEqual({ used: 12 });
    expect(payload.credits).not.toHaveProperty("total");
    // 曲线不因条目级聚合值缺失而消失（逐日明细是真数据）
    expect(payload.spark).toEqual([
      { calc_time: "2026-08-01", credits_value: 2 },
      { calc_time: "2026-08-02", credits_value: 4 },
      { calc_time: "2026-08-03", credits_value: 6 },
      { calc_time: "2026-08-09", credits_value: 7 },
    ]);
    // 分模块只出有聚合值的那一项（缺值的条目不当 0）
    expect(payload.modules).toEqual([{ module: "functions", credits_value: 12 }]);
  });

  it("对照：每个条目都有聚合值且未过滤 ⇒ 照常出 total 与结论（保护不过度触发）", () => {
    const payload = buildEnvCreditsPayload({
      envId: "env-complete",
      planRaw: "baas_free",
      usages: [SCF, COS],
      site: "domestic",
      region: "ap-shanghai",
      expired: false,
    });

    expect(payload.credits).toEqual({ total: PLAN_CREDITS_TOTAL.trial, used: 42 });
    expect(payload.branch).toBe("normal");
  });
});

describe("buildEnvCreditsPayload", () => {
  it("体验版：credits 带上 total（3000）与 used，模块与 spark 一并给出", () => {
    const payload = buildEnvCreditsPayload({
      envId: "env-trial",
      envAlias: "我的体验环境",
      planRaw: "baas_free",
      usages: [SCF, COS],
      site: "domestic",
      region: "ap-shanghai",
      expired: false,
    });

    expect(payload).toMatchObject({
      branch: "normal",
      env_alias: "我的体验环境",
      env_id: "env-trial",
      plan: "trial",
      plan_raw: "baas_free",
      site: "domestic",
      current_region: "ap-shanghai",
      credits: { total: PLAN_CREDITS_TOTAL.trial, used: 42 },
      balance: null,
    });
    expect(payload.modules).toHaveLength(2);
    expect(payload.spark).toHaveLength(3);
    expect(payload.isolated_days_left).toBeUndefined();
  });

  it("付费套餐的 total 来自配额表（个人版 40000）；套餐码认不出才不传 credits", () => {
    const payload = buildEnvCreditsPayload({
      envId: "env-paid",
      planRaw: "baas_personal",
      usages: [SCF],
      site: "domestic",
      region: "ap-guangzhou",
      expired: false,
      balance: null,
    });

    expect(payload.plan).toBe("personal");
    expect(payload.credits).toEqual({ total: PLAN_CREDITS_TOTAL.personal, used: 12 });
    expect(payload.branch).toBe("normal");
    expect(payload.modules).toEqual([{ module: "functions", credits_value: 12 }]);

    // 认不出的套餐码不拿任何默认配额兜底：不传 total（也不猜结论），但真实拿到的
    // used 照给——面板支持"只有 used、没有 total"的形态（pct === null 时不画进度条）
    const unknownPlan = buildEnvCreditsPayload({
      envId: "env-unknown-plan",
      planRaw: "baas_ultra",
      usages: [SCF],
      site: "domestic",
      region: "ap-guangzhou",
      expired: false,
    });
    expect(unknownPlan.plan).toBeNull();
    expect(unknownPlan.plan_raw).toBe("baas_ultra");
    expect(unknownPlan.credits).toEqual({ used: 12 });
    expect(unknownPlan.credits).not.toHaveProperty("total");
    expect(unknownPlan.branch).toBe("unknown");
  });

  it("到期分支：带上隔离期剩余天数；非到期不给该字段", () => {
    const now = new Date("2026-09-06T00:00:00");
    const billing = { IsolatedTime: "2026-09-01 00:00:00" };
    const expiredPayload = buildEnvCreditsPayload({
      envId: "env-expired",
      planRaw: "baas_standard",
      usages: [],
      site: "domestic",
      region: "ap-shanghai",
      expired: isBillingExpired(billing, now),
      isolatedDaysLeft: resolveIsolatedDaysLeft(billing, now),
    });
    expect(expiredPayload.branch).toBe("expired");
    expect(expiredPayload.isolated_days_left).toBe(10);

    const healthyPayload = buildEnvCreditsPayload({
      envId: "env-ok",
      planRaw: "baas_standard",
      usages: [],
      site: "domestic",
      region: "ap-shanghai",
      expired: false,
      isolatedDaysLeft: null,
    });
    expect(healthyPayload.isolated_days_left).toBeUndefined();
  });

  it("拿不到环境信息时逐字段降级：plan_raw / env_alias 为空、alias 不编", () => {
    const payload = buildEnvCreditsPayload({
      envId: "env-unknown",
      envAlias: null,
      planRaw: null,
      usages: null,
      site: "intl",
      region: "ap-singapore",
    });

    expect(payload).toEqual({
      branch: "unknown",
      env_alias: null,
      env_id: "env-unknown",
      plan: null,
      plan_raw: null,
      site: "intl",
      current_region: "ap-singapore",
      balance: null,
    });
    expect(payload).not.toHaveProperty("credits");
    expect(payload).not.toHaveProperty("modules");
    expect(payload).not.toHaveProperty("spark");
  });
});
