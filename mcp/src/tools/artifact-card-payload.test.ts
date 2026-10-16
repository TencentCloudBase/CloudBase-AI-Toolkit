import { describe, expect, it } from "vitest";
import {
  ACCESS_URL_SCOPE_BY_SOURCE,
  accessUrlScopeOf,
  buildArtifactCardPayload,
  resolveArtifactState,
} from "./artifact-card-payload.js";

const BASE = { site: "domestic", region: "ap-shanghai" } as const;

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

  it("已知不可达的地址不展示（拿不到可用地址就不显示，状态落回未确认）", () => {
    const payload = buildArtifactCardPayload({
      ...BASE,
      success: true,
      accessUrl: "https://disabled.tcloudbaseapp.com",
      accessUrlSource: "hosting.staticDomain",
      accessUrlReachable: false,
    });

    expect(payload).not.toHaveProperty("access_url");
    expect(payload.state).toBe("unknown");
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
      "updated_at",
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
