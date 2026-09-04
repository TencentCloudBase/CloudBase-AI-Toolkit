import { describe, expect, it } from "vitest";
import {
  FUNCTION_DEPLOY_CONFIG_SCHEMA,
  FUNCTION_IMAGE_BUILD_SCHEMA,
  FUNCTION_IMAGE_BUILD_STRATEGIES,
  FUNCTION_IMAGE_TYPES,
} from "./function-deploy-schema.js";

const personalCredential = {
  username: "100000000001",
  password: "test-password",
};

function expectFailureAt(result: ReturnType<typeof FUNCTION_DEPLOY_CONFIG_SCHEMA.safeParse>, path: string) {
  expect(result.success).toBe(false);
  if (result.success) {
    return;
  }
  expect(result.error.issues.map((issue) => issue.path.join("."))).toContain(path);
}

// 契约说明：schema 仅做结构与格式校验，镜像字段全部收敛在 imageConfig 命名空间下，
// 对齐 cloudbaserc / toolbox 嵌套形状。imageType/registryId/凭证/仓库地址等跨字段
// 业务组合约束不在 schema 内裁决，改由 SDK 的 checkConfig 统一处理。
describe("function deploy input schema", () => {
  it("exposes stable enum contracts", () => {
    expect(FUNCTION_IMAGE_BUILD_STRATEGIES).toEqual(["image", "cloud", "local"]);
    expect(FUNCTION_IMAGE_TYPES).toEqual(["enterprise", "personal"]);
  });

  it("accepts an existing personal image with an immutable tag", () => {
    expect(
      FUNCTION_DEPLOY_CONFIG_SCHEMA.safeParse({
        name: "http-image",
        type: "HTTP",
        buildStrategy: "image",
        imageConfig: {
          imageType: "personal",
          imageUri: "ccr.ccs.tencentyun.com/demo/http-image:v1",
        },
      }).success,
    ).toBe(true);
  });

  it("accepts an existing enterprise image with registryId nested in imageConfig", () => {
    expect(
      FUNCTION_DEPLOY_CONFIG_SCHEMA.safeParse({
        name: "http-image",
        type: "HTTP",
        buildStrategy: "image",
        imageConfig: {
          imageType: "enterprise",
          registryId: "tcr-12345678",
          imageUri: "demo.tencentcloudcr.com/team/http-image:v1",
        },
      }).success,
    ).toBe(true);
  });

  it("rejects mutable or incomplete image references", () => {
    for (const imageUri of [
      "ccr.ccs.tencentyun.com/demo/http-image",
      "ccr.ccs.tencentyun.com/demo/http-image:latest",
      "demo/http-image:v1",
    ]) {
      expectFailureAt(
        FUNCTION_DEPLOY_CONFIG_SCHEMA.safeParse({
          name: "http-image",
          type: "HTTP",
          buildStrategy: "image",
          imageConfig: { imageType: "personal", imageUri },
        }),
        "imageConfig.imageUri",
      );
    }
  });

  it("enforces the nested imageConfig contract and rejects legacy flat image fields", () => {
    // 顶层扁平字段（旧契约）现在属于未知键，应被 strict 拒绝（unrecognized_keys）。
    const flatImage = FUNCTION_DEPLOY_CONFIG_SCHEMA.safeParse({
      name: "http-image",
      type: "HTTP",
      buildStrategy: "image",
      imageType: "enterprise",
      registryId: "tcr-12345678",
      imageConfig: {
        imageUri: "demo.tencentcloudcr.com/team/http-image:v1",
      },
    });
    expect(flatImage.success).toBe(false);
    if (!flatImage.success) {
      expect(
        flatImage.error.issues.some((issue) => issue.code === "unrecognized_keys"),
      ).toBe(true);
    }

    const flatCloud = FUNCTION_DEPLOY_CONFIG_SCHEMA.safeParse({
      name: "http-cloud",
      type: "HTTP",
      buildStrategy: "cloud",
      imageType: "enterprise",
      build: {
        cwd: "/workspace/functions/http-cloud",
        registryId: "tcr-12345678",
        repository: "demo.tencentcloudcr.com/team/http-cloud",
      },
    });
    // 顶层缺少 imageConfig 且带未知的 build/imageType，均无法通过嵌套契约。
    expect(flatCloud.success).toBe(false);
  });

  it("accepts personal cloud build with explicit local context and credentials", () => {
    expect(
      FUNCTION_DEPLOY_CONFIG_SCHEMA.safeParse({
        name: "http-cloud",
        type: "HTTP",
        buildStrategy: "cloud",
        imageConfig: {
          imageType: "personal",
          build: {
            cwd: "/workspace/functions/http-cloud",
            namespace: "demo",
            repository: "http-cloud",
            registryCredential: personalCredential,
          },
        },
      }).success,
    ).toBe(true);
  });

  it("accepts enterprise cloud build with explicit registry repository", () => {
    expect(
      FUNCTION_DEPLOY_CONFIG_SCHEMA.safeParse({
        name: "http-cloud",
        type: "HTTP",
        buildStrategy: "cloud",
        imageConfig: {
          imageType: "enterprise",
          build: {
            cwd: "/workspace/functions/http-cloud",
            registryId: "tcr-12345678",
            repository: "demo.tencentcloudcr.com/team/http-cloud",
          },
        },
      }).success,
    ).toBe(true);
  });

  it("accepts personal and enterprise local build contracts", () => {
    expect(
      FUNCTION_DEPLOY_CONFIG_SCHEMA.safeParse({
        name: "http-local",
        type: "HTTP",
        buildStrategy: "local",
        imageConfig: {
          imageType: "personal",
          localFallback: "error",
          build: {
            cwd: "/workspace/functions/http-local",
            repository: "ccr.ccs.tencentyun.com/demo/http-local",
            tag: "v1",
            registryCredential: personalCredential,
          },
        },
      }).success,
    ).toBe(true);

    expect(
      FUNCTION_DEPLOY_CONFIG_SCHEMA.safeParse({
        name: "http-local",
        type: "HTTP",
        buildStrategy: "local",
        imageConfig: {
          imageType: "enterprise",
          build: {
            cwd: "/workspace/functions/http-local",
            registryId: "tcr-12345678",
            repository: "demo.tencentcloudcr.com/team/http-local",
          },
        },
      }).success,
    ).toBe(true);
  });

  it("requires an absolute build context and a safe relative Dockerfile", () => {
    expectFailureAt(
      FUNCTION_IMAGE_BUILD_SCHEMA.safeParse({
        cwd: "functions/http-local",
      }) as ReturnType<typeof FUNCTION_DEPLOY_CONFIG_SCHEMA.safeParse>,
      "cwd",
    );

    const escapedDockerfile = FUNCTION_IMAGE_BUILD_SCHEMA.safeParse({
      cwd: "/workspace/functions/http-local",
      dockerfile: "../Dockerfile",
    });
    expect(escapedDockerfile.success).toBe(false);
    if (!escapedDockerfile.success) {
      expect(escapedDockerfile.error.issues.map((issue) => issue.path.join("."))).toContain(
        "dockerfile",
      );
    }
  });

  it("locks the HTTP image runtime and platform contract", () => {
    expectFailureAt(
      FUNCTION_DEPLOY_CONFIG_SCHEMA.safeParse({
        name: "http-local",
        type: "HTTP",
        buildStrategy: "local",
        imageConfig: {
          imageType: "personal",
          imagePort: 8080,
          build: {
            cwd: "/workspace/functions/http-local",
            platform: "linux/arm64",
            repository: "ccr.ccs.tencentyun.com/demo/http-local",
            registryCredential: personalCredential,
          },
        },
      }),
      "imageConfig.imagePort",
    );

    expectFailureAt(
      FUNCTION_DEPLOY_CONFIG_SCHEMA.safeParse({
        name: "http-local",
        type: "HTTP",
        buildStrategy: "local",
        imageConfig: {
          imageType: "personal",
          build: {
            cwd: "/workspace/functions/http-local",
            platform: "linux/arm64",
            repository: "ccr.ccs.tencentyun.com/demo/http-local",
            registryCredential: personalCredential,
          },
        },
      }),
      "imageConfig.build.platform",
    );
  });

  it("rejects sensitive or malformed build arguments", () => {
    const result = FUNCTION_IMAGE_BUILD_SCHEMA.safeParse({
      cwd: "/workspace/functions/http-local",
      buildArgs: {
        "INVALID-KEY": "value",
        API_TOKEN: "secret-value",
      },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join("."))).toEqual(
        expect.arrayContaining(["buildArgs.INVALID-KEY", "buildArgs.API_TOKEN"]),
      );
    }
  });

  it("rejects Event functions and unknown fields", () => {
    expect(
      FUNCTION_DEPLOY_CONFIG_SCHEMA.safeParse({
        name: "event-image",
        type: "Event",
        buildStrategy: "image",
        imageConfig: {
          imageType: "personal",
          imageUri: "ccr.ccs.tencentyun.com/demo/event-image:v1",
        },
      }).success,
    ).toBe(false);

    expect(
      FUNCTION_DEPLOY_CONFIG_SCHEMA.safeParse({
        name: "http-image",
        type: "HTTP",
        buildStrategy: "image",
        handler: "index.main",
        imageConfig: {
          imageType: "personal",
          imageUri: "ccr.ccs.tencentyun.com/demo/http-image:v1",
        },
      }).success,
    ).toBe(false);
  });
});
