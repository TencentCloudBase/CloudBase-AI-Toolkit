import { describe, expect, it } from "vitest";
import {
  ACCESS_URL_SCOPE_BY_SOURCE,
  accessUrlScopeOf,
  buildArtifactCardPayload,
  errorTextOf,
  resolveArtifactEnvContext,
  resolveArtifactState,
} from "./artifact-card-payload.js";

const BASE = { site: "domestic", region: "ap-shanghai" } as const;
const PUBLIC_URL_FOR_TEST = "https://my-blog.tcloudbaseapp.com";

describe("resolveArtifactState（四态 + 未确认）", () => {
  it("success=false → failed", () => {
    expect(resolveArtifactState({ success: false })).toBe("failed");
    expect(resolveArtifactState({ success: false, accessUrl: "https://example.test" })).toBe(
      "failed",
    );
  });

  it("有后端错误原文 → failed（即使没带 success 字段）", () => {
    expect(resolveArtifactState({ errorText: "端口 8080 未在健康检查内响应" })).toBe("failed");
    expect(resolveArtifactState({ errorText: "   " })).toBe("unknown");
  });

  it("工具自报进行中 → deploying，且**优先于地址**", () => {
    // cloudrun 部署中也会带上"已有服务"的地址；只看地址会把"正在部署"说成"已上线"。
    expect(
      resolveArtifactState({ pending: true, accessUrl: "https://demo.tcloudbaseapp.com" }),
    ).toBe("deploying");
  });

  it("有可用地址 → published", () => {
    expect(resolveArtifactState({ accessUrl: "https://demo.tcloudbaseapp.com" })).toBe(
      "published",
    );
  });

  it("信息不足 → unknown（不猜）", () => {
    expect(resolveArtifactState({})).toBe("unknown");
    expect(resolveArtifactState({ success: true })).toBe("unknown");
    expect(resolveArtifactState({ accessUrl: "   " })).toBe("unknown");
  });

  it("失败优先于进行中（两者同时出现时不把失败说成部署中）", () => {
    expect(resolveArtifactState({ success: false, pending: true })).toBe("failed");
  });
});

describe("accessUrlScopeOf（只有内网域名是内网）", () => {
  it("内网档只有 cloudrun.internalDomain", () => {
    expect(accessUrlScopeOf("cloudrun.internalDomain")).toBe("internal");
    for (const source of Object.keys(ACCESS_URL_SCOPE_BY_SOURCE)) {
      if (source !== "cloudrun.internalDomain") {
        expect(accessUrlScopeOf(source)).toBe("public");
      }
    }
  });

  it("认不出的来源返回 null（不替用户承诺公网）", () => {
    expect(accessUrlScopeOf("something.else")).toBeNull();
    expect(accessUrlScopeOf("")).toBeNull();
    expect(accessUrlScopeOf(null)).toBeNull();
    expect(accessUrlScopeOf(undefined)).toBeNull();
  });
});

describe("buildArtifactCardPayload", () => {
  it("公网已上线：地址 + 范围 + 标题信息，plan 走配额表同一套映射", () => {
    const payload = buildArtifactCardPayload({
      ...BASE,
      success: true,
      accessUrl: "https://my-blog.tcloudbaseapp.com",
      accessUrlSource: "hosting.staticDomain",
      accessUrlReachable: true,
      kind: "hosting",
      artifactName: "my-blog",
      envId: "env-abc123",
      envAlias: "生产环境",
      planRaw: "baas_personal",
    });

    expect(payload).toMatchObject({
      state: "published",
      access_url: "https://my-blog.tcloudbaseapp.com",
      access_url_scope: "public",
      artifact_kind: "hosting",
      artifact_name: "my-blog",
      env_id: "env-abc123",
      env_alias: "生产环境",
      plan: "personal",
      plan_raw: "baas_personal",
      site: "domestic",
      current_region: "ap-shanghai",
    });
  });

  it("仅内网：范围是 internal（面板据此撤掉「打开」并改主行动）", () => {
    const payload = buildArtifactCardPayload({
      ...BASE,
      success: true,
      accessUrl: "https://demo.internal.tcb",
      accessUrlSource: "cloudrun.internalDomain",
      kind: "cloudrun",
    });

    expect(payload.state).toBe("published");
    expect(payload.access_url_scope).toBe("internal");
  });

  it("有地址但来源认不出：给地址、但**不给范围**（面板因此不承诺公网）", () => {
    const payload = buildArtifactCardPayload({
      ...BASE,
      success: true,
      accessUrl: "https://unknown-source.test",
      accessUrlSource: "mystery.source",
    });

    expect(payload.state).toBe("published");
    expect(payload.access_url).toBe("https://unknown-source.test");
    expect(payload.access_url_scope).toBeUndefined();
  });

  it("明确不可达：地址照实展示，但状态不算「已上线」（因此面板不给「打开」）", () => {
    const payload = buildArtifactCardPayload({
      ...BASE,
      success: true,
      accessUrl: "https://disabled.tcloudbaseapp.com",
      accessUrlSource: "hosting.staticDomain",
      accessUrlReachable: false,
    });

    expect(payload.access_url).toBe("https://disabled.tcloudbaseapp.com");
    expect(payload.state).toBe("unknown");
  });

  it("可达性缺失 ≠ 不可达：公网来源 + 没有 reachable 字段 ⇒ 仍是「已上线」", () => {
    const payload = buildArtifactCardPayload({
      ...BASE,
      success: true,
      accessUrl: PUBLIC_URL_FOR_TEST,
      accessUrlSource: "hosting.staticDomain",
    });

    expect(payload.state).toBe("published");
    expect(payload.access_url_scope).toBe("public");
  });

  it("部署中：即使带着地址也不展示地址（那是已有服务的地址）", () => {
    const payload = buildArtifactCardPayload({
      ...BASE,
      success: true,
      pending: true,
      accessUrl: "https://demo.tcloudbaseapp.com",
      accessUrlSource: "cloudrun.defaultDomain",
      kind: "cloudrun",
      artifactName: "cloudbase-demo",
    });

    expect(payload.state).toBe("deploying");
    expect(payload).not.toHaveProperty("access_url");
    expect(payload).not.toHaveProperty("access_url_scope");
  });

  it("部署失败：错误原文逐字透传，不改写、不用错误码顶替", () => {
    const raw = "端口 8080 未在健康检查内响应";
    const payload = buildArtifactCardPayload({
      ...BASE,
      success: false,
      errorText: raw,
      kind: "cloudrun",
      artifactName: "cloudbase-demo",
    });

    expect(payload.state).toBe("failed");
    expect(payload.error_text).toBe(raw);
    expect(payload).not.toHaveProperty("access_url");
  });

  it("不编数：缺什么就不带什么（不填占位、不给 null 占位）", () => {
    const payload = buildArtifactCardPayload({ ...BASE });

    expect(payload.state).toBe("unknown");
    for (const key of [
      "access_url",
      "access_url_scope",
      "error_text",
      "env_id",
      "env_alias",
      "artifact_kind",
      "artifact_name",
    ]) {
      expect(payload, `${key} 不应出现`).not.toHaveProperty(key);
    }
    // plan / plan_raw 恒定出现（认不出套餐时 plan=null、原值进 plan_raw）
    expect(payload.plan).toBeNull();
    expect(payload.plan_raw).toBeNull();
  });

  it("认不出的套餐码进 plan_raw，plan 留空（不猜）", () => {
    const payload = buildArtifactCardPayload({ ...BASE, planRaw: "baas_ultra" });
    expect(payload.plan).toBeNull();
    expect(payload.plan_raw).toBe("baas_ultra");
  });

  it("env_id 拿不到时整个键省略（让面板回落到配置/缓存那一级）", () => {
    const payload = buildArtifactCardPayload({ ...BASE, envAlias: "生产环境" });
    expect(payload).not.toHaveProperty("env_id");
    expect(payload.env_alias).toBe("生产环境");
  });
});

describe("resolveArtifactEnvContext（别名 / 套餐 / 位置：一次只读调用，失败逐字段降级）", () => {
  const managerWith = (impl: (args: { EnvId: string }) => Promise<unknown>) => ({
    env: { describeEnvInfo: impl },
  });

  it("拿到环境信息时取别名、套餐码与地域（站点随之解析）", async () => {
    let calls = 0;
    const ctx = await resolveArtifactEnvContext({
      manager: managerWith(async () => {
        calls += 1;
        return {
          EnvInfo: {
            EnvBaseInfo: { Alias: "生产环境", PackageId: "baas_personal", Region: "ap-guangzhou" },
          },
        };
      }),
      envId: "env-abc",
    });

    expect(ctx).toEqual({
      envAlias: "生产环境",
      planRaw: "baas_personal",
      site: "domestic",
      region: "ap-guangzhou",
    });
    // 每次部署只多这一次只读调用
    expect(calls).toBe(1);
  });

  it("没有 PackageId 时用 PackageName 兜底；认不出照样交给 plan_raw", async () => {
    const ctx = await resolveArtifactEnvContext({
      manager: managerWith(async () => ({
        EnvInfo: { EnvBaseInfo: { PackageName: "baas_ultra" } },
      })),
      envId: "env-abc",
    });

    expect(ctx.planRaw).toBe("baas_ultra");
  });

  it("查不到 / 抛错 / 没有这个方法 ⇒ 逐字段降级，绝不抛，站点与地域仍按配置解析", async () => {
    for (const manager of [
      managerWith(async () => {
        throw new Error("DescribeEnvInfo denied");
      }),
      managerWith(async () => ({})),
      managerWith(async () => ({ EnvInfo: {} })),
      {},
      null,
      undefined,
    ]) {
      const ctx = await resolveArtifactEnvContext({
        manager: manager as never,
        envId: "env-abc",
        site: "intl",
        region: "ap-singapore",
      });
      expect(ctx.envAlias).toBeNull();
      expect(ctx.planRaw).toBeNull();
      expect(ctx.site).toBe("intl");
      expect(ctx.region).toBe("ap-singapore");
    }
  });

  it("没有 envId 时一次调用都不发（不为品牌条额外付费）", async () => {
    let calls = 0;
    const ctx = await resolveArtifactEnvContext({
      manager: managerWith(async () => {
        calls += 1;
        return {};
      }),
      envId: null,
    });

    expect(calls).toBe(0);
    expect(ctx.envAlias).toBeNull();
  });
});

describe("errorTextOf（后端原文，不改写）", () => {
  it("Error 取 message，其它类型直接 String()", () => {
    expect(errorTextOf(new Error("端口 8080 未响应"))).toBe("端口 8080 未响应");
    expect(errorTextOf("plain")).toBe("plain");
    expect(errorTextOf(undefined)).toBe("undefined");
  });
});
