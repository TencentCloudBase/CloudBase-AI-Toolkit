import { afterEach, describe, expect, it } from "vitest";

import {
  findFunctionUploadTarget,
  FUNCTION_UPLOAD_TARGET_LIMITS,
  getFunctionUploadTargetCount,
  registerFunctionUploadTarget,
  resetFunctionUploadTargets,
} from "./function-upload-target-store.js";

/**
 * 登记表不依赖 manager-node，也不做网络调用：只用注入的时间戳，
 * 不构造任何 SDK mock。
 */
const ENV_ID = "envA-test";
const OTHER_ENV_ID = "envB-other";
const BUCKET = "envtest-bucket-1258016615";
const REGION = "ap-guangzhou";
const OBJECT_KEY = "fnzip-upload/1690000000-ab12cd34/helloWorld.zip";

function register(overrides: Partial<Parameters<typeof registerFunctionUploadTarget>[0]> = {}) {
  registerFunctionUploadTarget({
    envId: ENV_ID,
    bucket: BUCKET,
    region: REGION,
    objectKey: OBJECT_KEY,
    ...overrides,
  });
}

function lookup(overrides: Partial<Parameters<typeof findFunctionUploadTarget>[0]> = {}) {
  return findFunctionUploadTarget({
    envId: ENV_ID,
    bucketName: BUCKET,
    region: REGION,
    objectKey: OBJECT_KEY,
    ...overrides,
  });
}

afterEach(() => {
  resetFunctionUploadTargets();
});

describe("registerFunctionUploadTarget / findFunctionUploadTarget", () => {
  it("finds a target registered for the same environment", () => {
    register();

    const target = lookup();

    expect(target).toBeDefined();
    expect(target?.objectKey).toBe(OBJECT_KEY);
    expect(target?.bucket).toBe(BUCKET);
    expect(getFunctionUploadTargetCount()).toBe(1);
  });

  it("accepts the short bucket name that phase B sends back", () => {
    register();

    // 阶段 A 登记的是全名（含 -appid），阶段 B 回传的是短名
    expect(lookup({ bucketName: "envtest-bucket" })).toBeDefined();
  });

  it("rejects an object key that was never minted", () => {
    register();

    expect(lookup({ objectKey: "fnzip-upload/1/zipDemo.zip" })).toBeUndefined();
    expect(lookup({ objectKey: `${OBJECT_KEY}.bak` })).toBeUndefined();
    // 前缀相同但整体不同，不能按前缀放行
    expect(lookup({ objectKey: "fnzip-upload/1690000000-ab12cd34/" })).toBeUndefined();
  });

  it("hides a registration from another environment", () => {
    register();

    expect(lookup({ envId: OTHER_ENV_ID })).toBeUndefined();
  });

  it("rejects the same object key pointed at a different bucket", () => {
    register();

    expect(lookup({ bucketName: "attacker-bucket" })).toBeUndefined();
    expect(lookup({ bucketName: "attacker-bucket-1258016615" })).toBeUndefined();
  });

  it("rejects the same object key pointed at a different region", () => {
    register();

    expect(lookup({ region: "ap-shanghai" })).toBeUndefined();
  });

  it("expires a registration once the retention window elapses", () => {
    register({ now: 1_000 });

    expect(lookup({ now: 1_000 + FUNCTION_UPLOAD_TARGET_LIMITS.ttlMs - 1 })).toBeDefined();
    expect(lookup({ now: 1_000 + FUNCTION_UPLOAD_TARGET_LIMITS.ttlMs + 1 })).toBeUndefined();
    expect(getFunctionUploadTargetCount()).toBe(0);
  });

  it("lets the same target be submitted again within the retention window", () => {
    register({ now: 1_000 });

    // 上传失败重试、ResourceInUse 重试、同一份代码包重复部署都要能重放
    expect(lookup({ now: 2_000 })).toBeDefined();
    expect(lookup({ now: 3_000 })).toBeDefined();
    expect(getFunctionUploadTargetCount()).toBe(1);
  });

  it("evicts the oldest registration instead of exceeding the limit", () => {
    const { maxTargets } = FUNCTION_UPLOAD_TARGET_LIMITS;

    for (let index = 0; index < maxTargets; index += 1) {
      register({ objectKey: `fnzip-upload/${index}/a.zip`, now: index + 1 });
    }
    expect(getFunctionUploadTargetCount()).toBe(maxTargets);

    register({ objectKey: "fnzip-upload/overflow/a.zip", now: maxTargets + 1 });

    expect(getFunctionUploadTargetCount()).toBe(maxTargets);
    // 查询也要用注入时间：用真实时间的话这一整批登记早已过了保留期，断言会因为
    // 「全部过期」而假通过，看不出淘汰逻辑到底有没有生效
    const lookupAt = maxTargets + 2;
    // 最旧的那条被淘汰，最新的两条都还在
    expect(lookup({ objectKey: "fnzip-upload/0/a.zip", now: lookupAt })).toBeUndefined();
    expect(lookup({ objectKey: "fnzip-upload/overflow/a.zip", now: lookupAt })).toBeDefined();
    expect(
      lookup({ objectKey: `fnzip-upload/${maxTargets - 1}/a.zip`, now: lookupAt }),
    ).toBeDefined();
  });
});
