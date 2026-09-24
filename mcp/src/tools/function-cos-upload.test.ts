import { describe, expect, it } from "vitest";
import {
  buildCosPutAuthorization,
  buildFunctionZipUpload,
  camSafeUrlEncode,
  stripAppIdSuffix,
} from "./function-cos-upload.js";

const FIXTURE = {
  // 非 AKID 前缀占位符：腾讯云 SecretId 真实形如 AKIDxxxxxxxx（36 位），
  // 夹具若照那个形态写会被 GitHub Push Protection 当真实密钥拦 push。
  secretId: "FIXTURE_COS_SECRET_ID_PLACEHOLDER_000001",
  secretKey: "FIXTURE_COS_SECRET_KEY_PLACEHOLDER_000001",
  bucket: "mybucket-1258016615",
  region: "ap-shanghai",
  objectKey: "fnzip-upload/1690000000-ab12cd34/helloWorld.zip",
  keyTime: "1690000000;1690003600",
};

/**
 * 黄金值对照：期望值由 cos-nodejs-sdk-v5 getAuth 对同一输入的输出固化而来
 *（SDK ForceSignHost 默认 true 会签入 Host 头，与本实现一致）。
 * 固化成字面量以避免测试构建期引入 cos-nodejs-sdk-v5 依赖。
 */
describe("buildCosPutAuthorization", () => {
  it("matches cos-nodejs-sdk-v5 getAuth golden value (permanent keys)", () => {
    const ours = buildCosPutAuthorization(FIXTURE);
    expect(ours).toBe(
      "q-sign-algorithm=sha1&q-ak=FIXTURE_COS_SECRET_ID_PLACEHOLDER_000001&q-sign-time=1690000000;1690003600&q-key-time=1690000000;1690003600&q-header-list=host&q-url-param-list=&q-signature=debc7cf487e7b443e5297b38b591a78bb781eeb6",
    );
  });

  it("matches cos-nodejs-sdk-v5 getAuth golden value (security token signed into headers)", () => {
    const token = "fixture-session-token-abc123";
    const ours = buildCosPutAuthorization({
      ...FIXTURE,
      securityToken: token,
    });
    expect(ours).toBe(
      "q-sign-algorithm=sha1&q-ak=FIXTURE_COS_SECRET_ID_PLACEHOLDER_000001&q-sign-time=1690000000;1690003600&q-key-time=1690000000;1690003600&q-header-list=host;x-cos-security-token&q-url-param-list=&q-signature=089ae4e3c39994d8664ba921c3e6ebef5c48fad5",
    );
    // token 必须真实参与签名：带 token 与不带 token 的签名串必然不同
    expect(ours).not.toBe(buildCosPutAuthorization(FIXTURE));
    expect(ours).toContain("x-cos-security-token");
  });

  it("produces a structurally valid q-sign string", () => {
    const auth = buildCosPutAuthorization(FIXTURE);
    const parts = Object.fromEntries(
      auth.split("&").map((kv) => {
        const idx = kv.indexOf("=");
        return [kv.slice(0, idx), kv.slice(idx + 1)];
      }),
    );
    expect(parts["q-sign-algorithm"]).toBe("sha1");
    expect(parts["q-ak"]).toBe(FIXTURE.secretId);
    expect(parts["q-sign-time"]).toBe(FIXTURE.keyTime);
    expect(parts["q-key-time"]).toBe(FIXTURE.keyTime);
    expect(parts["q-header-list"]).toBe("host");
    expect(parts["q-url-param-list"]).toBe("");
    expect(parts["q-signature"]).toMatch(/^[0-9a-f]{40}$/);
  });

  it("signs Host derived from bucket+region", () => {
    // Host 不一致 ⇒ 签名串不一致（ForceSignHost 语义）
    const a = buildCosPutAuthorization(FIXTURE);
    const b = buildCosPutAuthorization({ ...FIXTURE, bucket: "other-1258016615" });
    expect(a).not.toBe(b);
  });

  it("rejects missing params", () => {
    expect(() =>
      buildCosPutAuthorization({ ...FIXTURE, secretId: "" }),
    ).toThrow(/SecretId/);
    expect(() =>
      buildCosPutAuthorization({ ...FIXTURE, secretKey: "" }),
    ).toThrow(/SecretKey/);
    expect(() =>
      buildCosPutAuthorization({ ...FIXTURE, objectKey: "" }),
    ).toThrow(/objectKey/);
  });
});

describe("buildFunctionZipUpload", () => {
  const storage = { bucket: "mybucket-1258016615", region: "ap-shanghai" };
  const credential = {
    secretId: FIXTURE.secretId,
    secretKey: FIXTURE.secretKey,
  };

  it("returns presigned URL plus stage-B cos triplet with short bucket name", () => {
    const result = buildFunctionZipUpload({
      storage,
      credential,
      functionName: "helloWorld",
      keyTime: FIXTURE.keyTime,
      now: 1690000000,
      randomSuffix: "ab12cd34",
    });
    expect(result.cosBucketName).toBe("mybucket");
    expect(result.cosBucketRegion).toBe("ap-shanghai");
    expect(result.cosObjectName).toBe(
      "fnzip-upload/1690000000-ab12cd34/helloWorld.zip",
    );
    expect(result.uploadUrl).toBe(
      `https://mybucket-1258016615.cos.ap-shanghai.myqcloud.com/${result.cosObjectName}?${buildCosPutAuthorization(
        {
          ...credential,
          bucket: storage.bucket,
          region: storage.region,
          objectKey: result.cosObjectName,
          keyTime: FIXTURE.keyTime,
        },
      )}`,
    );
    expect(result.uploadHeaders).toEqual([]);
    expect(result.expiresInSeconds).toBe(3600);
  });

  it("exposes token header only for temporary credentials", () => {
    const token = "fixture-session-token";
    const withToken = buildFunctionZipUpload({
      storage,
      credential: { ...credential, token },
      keyTime: FIXTURE.keyTime,
    });
    expect(withToken.uploadHeaders).toEqual([
      { Key: "x-cos-security-token", Value: token },
    ]);
    const withoutToken = buildFunctionZipUpload({
      storage,
      credential: { ...credential, token: "" },
      keyTime: FIXTURE.keyTime,
    });
    expect(withoutToken.uploadHeaders).toEqual([]);
  });

  it("falls back to code.zip when functionName is absent", () => {
    const result = buildFunctionZipUpload({
      storage,
      credential,
      keyTime: FIXTURE.keyTime,
      randomSuffix: "x",
    });
    expect(result.cosObjectName).toMatch(/^fnzip-upload\/\d+-x\/code\.zip$/);
  });

  it("generates unique keys across calls without fixed randomSuffix", () => {
    const a = buildFunctionZipUpload({ storage, credential });
    const b = buildFunctionZipUpload({ storage, credential });
    expect(a.cosObjectName).not.toBe(b.cosObjectName);
  });

  it("respects custom expiresIn", () => {
    const result = buildFunctionZipUpload({
      storage,
      credential,
      expiresIn: 600,
      now: 1690000000,
      randomSuffix: "x",
    });
    expect(result.expiresInSeconds).toBe(600);
    expect(result.uploadUrl).toContain("q-sign-time=1689999999;1690000600");
  });
});

describe("stripAppIdSuffix", () => {
  it("strips trailing -appid", () => {
    expect(stripAppIdSuffix("mybucket-1258016615")).toBe("mybucket");
    expect(stripAppIdSuffix("a-b-1")).toBe("a-b");
  });

  it("keeps short names and numeric tails that are not appid-shaped", () => {
    expect(stripAppIdSuffix("mybucket")).toBe("mybucket");
    // appid 是固定 8 位以上数字；单个尾随数字不属于 appid 形态
    expect(stripAppIdSuffix("mybucket2")).toBe("mybucket2");
  });
});

describe("camSafeUrlEncode", () => {
  it("encodes SDK's forced-safe set like cos-nodejs-sdk-v5", () => {
    expect(camSafeUrlEncode("a b+c!()*'")).toBe(
      "a%20b%2Bc%21%28%29%2A%27",
    );
    expect(camSafeUrlEncode("fnzip-upload/1/x.zip")).toBe(
      "fnzip-upload%2F1%2Fx.zip",
    );
  });
});
