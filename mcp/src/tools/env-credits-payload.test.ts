import { describe, expect, it } from "vitest";
import {
  buildCreditsSpark,
  buildEnvCreditsPayload,
  isBillingExpired,
  mapCreditsModules,
  resolveCreditsBranch,
  resolveIsolatedDaysLeft,
  resolvePlanCode,
  sumCreditsValue,
  TRIAL_CREDITS_TOTAL,
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

  it("信息不足 → unknown（不猜）", () => {
    // 没有 total 就判断不了"耗尽"
    expect(resolveCreditsBranch({ plan: "standard", used: 9999, total: null })).toBe("unknown");
    // 套餐码认不出
    expect(resolveCreditsBranch({ plan: null, used: 10, total: 10 })).toBe("unknown");
    // 什么都没有
    expect(resolveCreditsBranch({ plan: null })).toBe("unknown");
    // 用量正常（非任何告警分支）也是 unknown：面板没有"正常"这一档
    expect(resolveCreditsBranch({ plan: "trial", used: 1, total: 3000, balance: 5 })).toBe(
      "unknown",
    );
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

  it("模块码走映射，认不出的原样透传；没有模块则不传", () => {
    expect(mapCreditsModules([SCF, COS, { Module: "HOSTING", CreditsValue: 3 }])).toEqual([
      { module: "functions", credits_value: 12 },
      { module: "storage", credits_value: 30 },
      { module: "HOSTING", credits_value: 3 },
    ]);
    expect(mapCreditsModules([])).toBeUndefined();
    expect(mapCreditsModules(null)).toBeUndefined();
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

describe("buildEnvCreditsPayload", () => {
  it("体验版：credits 带上 total（3000）与 used，模块与 spark 一并给出", () => {
    const payload = buildEnvCreditsPayload({
      envId: "env-trial",
      envAlias: "我的体验环境",
      planRaw: "baas_free",
      usages: [SCF, COS],
      site: "domestic",
      region: "ap-shanghai",
    });

    expect(payload).toMatchObject({
      branch: "unknown",
      env_alias: "我的体验环境",
      env_id: "env-trial",
      plan: "trial",
      plan_raw: "baas_free",
      site: "domestic",
      current_region: "ap-shanghai",
      credits: { total: TRIAL_CREDITS_TOTAL, used: 42 },
      balance: null,
    });
    expect(payload.modules).toHaveLength(2);
    expect(payload.spark).toHaveLength(3);
    expect(payload.isolated_days_left).toBeUndefined();
  });

  it("付费套餐：没有可读配额 ⇒ 整个 credits 不传（面板隐藏该块），但不编 total", () => {
    const payload = buildEnvCreditsPayload({
      envId: "env-paid",
      planRaw: "baas_personal",
      usages: [SCF],
      site: "domestic",
      region: "ap-guangzhou",
      balance: null,
    });

    expect(payload.plan).toBe("personal");
    expect(payload.credits).toBeUndefined();
    expect(payload).not.toHaveProperty("credits");
    expect(payload.modules).toEqual([{ module: "functions", credits_value: 12 }]);
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
