import { defineModule } from "../types.js";

export const functionDeploySchema = defineModule(
  {
    buildCwdAbsolute: "build.cwd 必须是绝对路径。",
    buildDockerfileSafeRelative:
      "build.dockerfile 必须是构建上下文内的安全相对路径。",
    tagNoLatest: "镜像 tag 禁止使用 latest。",
    gatewayPathInvalid:
      "gatewayPath 必须以 / 开头，且不能包含查询串、片段、反斜杠或相对路径段。",
    imageUriImmutable:
      "imageUri 必须是包含 registry 和不可变 tag 或 digest 的完整镜像地址，禁止 latest。",
    buildArgKeyInvalid: "构建参数名需以字母或下划线开头，仅包含字母、数字和下划线。",
    buildArgSensitive:
      "禁止通过 buildArgs 传递 secret、token、password、credential 或 key。",
    buildArgNul: "构建参数值不能包含 NUL 字符。",
  },
  {
    buildCwdAbsolute: "build.cwd must be an absolute path.",
    buildDockerfileSafeRelative:
      "build.dockerfile must be a safe relative path inside the build context.",
    tagNoLatest: "The image tag must not be 'latest'.",
    gatewayPathInvalid:
      "gatewayPath must start with / and must not contain a query string, fragment, backslash, or relative path segments.",
    imageUriImmutable:
      "imageUri must be a full image reference containing a registry and an immutable tag or digest; latest is not allowed.",
    buildArgKeyInvalid:
      "Build argument names must start with a letter or underscore and contain only letters, digits, and underscores.",
    buildArgSensitive:
      "Passing secret, token, password, credential, or key via buildArgs is forbidden.",
    buildArgNul: "Build argument values must not contain the NUL character.",
  },
);
