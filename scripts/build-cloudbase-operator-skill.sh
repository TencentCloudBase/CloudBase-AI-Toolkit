#!/usr/bin/env bash
# build-cloudbase-operator-skill.sh
# 从 config/source/skills/ 构建小程序云开发 operator skill
# 输出产物目录由 TARGET_DIR 控制（默认 config/source/skills/../output）
#
# 用法: bash scripts/build-cloudbase-operator-skill.sh [target_dir]

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE="$ROOT/config/source/skills"

# 默认输出到 config/source/skills/../output/cloudbase-operator
REL_OUTPUT="${1:-output/cloudbase-operator}"
TARGET="$ROOT/$REL_OUTPUT"

# 选中的 skill 列表（小程序云开发相关）
SKILLS=(
  "miniprogram-development"
  "cloudbase-platform"
  "cloud-functions"
  "no-sql-wx-mp-sdk"
  "auth-wechat"
  "cloudbase-wechat-integration"
  "ai-model-wechat"
  "ops-inspector"
)

# 清理旧 references
rm -rf "$TARGET/references"
mkdir -p "$TARGET/references"

echo "=== 开始构建 cloudbase-operator skill ==="
echo "  源: $SOURCE"
echo "  目标: $TARGET"

for skill in "${SKILLS[@]}"; do
  src="$SOURCE/$skill"
  if [ ! -d "$src" ]; then
    echo "  [SKIP] $skill: 源目录不存在"
    continue
  fi

  if [ -f "$src/SKILL.md" ]; then
    cp "$src/SKILL.md" "$TARGET/references/$skill.md"
    echo "  [COPY] $skill/SKILL.md -> references/$skill.md"
  fi

  if [ -d "$src/references" ]; then
    mkdir -p "$TARGET/references/$skill"
    cp -r "$src/references/"* "$TARGET/references/$skill/"
    echo "  [COPY] $skill/references/ -> references/$skill/"
  fi

  for f in "$src"/*.md; do
    [ -f "$f" ] || continue
    base="$(basename "$f")"
    [ "$base" = "SKILL.md" ] && continue
    cp "$f" "$TARGET/references/$skill-$base"
    echo "  [COPY] $skill/$base -> references/$skill-$base"
  done
done

# 生成云调用文档（小程序特有，不在 source skills 中）
mkdir -p "$TARGET/references/cloud-functions"
cat > "$TARGET/references/cloud-functions/openapi-call.md" << 'OPENAPIEOF'
# 云调用（OpenAPI 调用）

云调用是**微信小程序云开发特有的能力**，允许在云函数中直接调用微信开放接口（如模板消息、客服消息等），无需自行获取 `access_token`。云函数中的请求经过微信自动鉴权，只要在云函数配置中声明了权限即可调用。

## 使用步骤

### 1. 声明权限

在云函数目录下创建或编辑 `config.json`，声明需要调用的接口：

```json
{
  "permissions": {
    "openapi": [
      "subscribeMessage.send",
      "customerServiceMessage.send",
      "wxacode.get"
    ]
  }
}
```

- `permissions.openapi` 是字符串数组
- 值必须为微信服务端接口名称，格式：`<类别>.<方法>`
- 上传云函数后生效，权限更新有 **10 分钟缓存**
- 在微信开发者工具中上传云函数时，会根据配置自动更新权限

### 2. 在云函数中调用

使用 `wx-server-sdk`（>= 0.4.0）的 `cloud.openapi` 对象：

```js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event, context) => {
  const result = await cloud.openapi.subscribeMessage.send({
    touser: 'OPENID',
    templateId: 'TEMPLATE_ID',
    data: { ... }
  })
  return result
}
```

各接口从属的类别和方法名与接口名称对应，例如：
- `subscribeMessage.send` → `cloud.openapi.subscribeMessage.send`
- `customerServiceMessage.send` → `cloud.openapi.customerServiceMessage.send`

### 3. 查看接口是否支持云调用

在微信官方[服务端接口列表](https://developers.weixin.qq.com/miniprogram/dev/server/API/)中，接口名称旁带有"云调用"标签的即支持。每个接口文档中也有专门的云调用说明和参数示例。

### 4. 开放数据调用（cloudID）

对返回敏感开放数据的小程序端接口，可在返回值中获取 `cloudID`，通过云调用直接获取开放数据。详见[微信官方文档](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/signature.html)。

### 5. 消息推送

云函数可作为小程序消息推送的接收端（如客服消息）。配置方式见[微信官方文档](https://developers.weixin.qq.com/minigame/dev/wxcloud/basis/message-push)。

## 注意事项

- `wx-server-sdk` 版本需 >= 0.4.0，建议在 `package.json` 中设置为 `latest` 并定期更新
- 服务端调用有 **10 万/分钟** 的频率限制
- 环境共享时可指定目标小程序的 AppID：

```js
cloud.openapi({ appid: wxContext.FROM_APPID }).subscribeMessage.send({ ... })
```

- 权限更新后若提示错误码 **-604101**，说明缓存尚未刷新，稍等 10 分钟再试
OPENAPIEOF
echo "  [GEN]  references/cloud-functions/openapi-call.md"

# 生成入口 SKILL.md
cat > "$TARGET/SKILL.md" << 'SKILLEOF'
---
name: cloudbase-operator
description: 负责云开发操作：环境管理、文档数据库、云函数、存储、权限、日志、AI 模型、微信支付。通过 CloudBase MCP 工具（`cloudbase_*`）调用云资源，并提供小程序云开发代码参考。
---

# cloudbase-operator

## 用途

处理与腾讯云开发（CloudBase）相关的所有操作，覆盖小程序云开发场景。

典型任务：

- 查询云环境信息
- 操作文档数据库（CRUD、聚合、权限规则）
- 管理云函数（部署、查询、日志）
- 管理云存储（上传、下载）
- 配置环境权限
- 查看日志
- 调用 AI 模型
- 微信支付集成
- 云调用（通过云函数调用微信开放接口，无需 access_token）
- 配置云函数 OpenAPI 权限声明
- 编写小程序云开发代码（`wx.cloud` 初始化、OPENID 认证、数据库 CRUD、云函数、云调用等）

## 工具使用规则

### CloudBase MCP 工具（首选）

所有云资源操作优先通过 CloudBase MCP 工具调用。工具名由 CloudBase MCP Server 动态注册到 IDE 中，命名规则为：

- 前缀：`cloudbase_`
- 命名风格：snake_case（原 camelCase 自动转换）
- 例如：`queryEnv` → `cloudbase_query_env`，`listFunctions` → `cloudbase_list_functions`

**调用前必须通过 `ToolSearch` 或 IDE 的 MCP 面板查看当前可用的工具列表及参数 schema，不要猜测或编造工具名。**

可用工具覆盖以下领域：

| 领域 | 说明 |
|------|------|
| 环境 | 环境信息查询、环境登录认证 |
| 文档数据库 | CRUD、聚合、集合管理 |
| 云函数 | 部署、查询、日志 |
| 存储 | 上传、下载、文件管理 |
| 权限 | 安全规则、权限配置 |
| 日志 | 查询日志 |

### DevTools 内置工具（特定场景）

以下场景使用 DevTools 内置的 `wechatide` 工具：

- `cloud_env_list` — 列出小程序可用云环境（快速浏览时）
- `cloud_fn_deploy` / `cloud_fn_inc_deploy` — 部署云函数（通过 DevTools 部署链路）

## 场景路由

按用户意图路由到对应的 reference：

| 用户意图 | 参考文档 |
|----------|----------|
| 小程序云开发入门、`wx.cloud` 初始化、项目结构 | `references/miniprogram-development.md` 及 `references/miniprogram-development/cloudbase-integration.md` |
| 云函数开发、部署、HTTP 函数、Event 函数、云调用（OpenAPI 权限配置） | `references/cloud-functions.md` 及 `references/cloud-functions/` |
| 云调用（通过云函数调用微信开放接口） | `references/cloud-functions/openapi-call.md` |
| 小程序文档数据库（CRUD、聚合、权限、分页） | `references/no-sql-wx-mp-sdk.md` 及 `references/no-sql-wx-mp-sdk/` |
| 微信认证（OPENID、登录态） | `references/auth-wechat.md` |
| 微信支付、公众号 OAuth | `references/cloudbase-wechat-integration.md` 及 `references/cloudbase-wechat-integration/` |
| AI 模型调用（小程序端） | `references/ai-model-wechat.md` |
| 日志查询、巡检诊断 | `references/ops-inspector.md` |
| 平台通用规则、控制台导航 | `references/cloudbase-platform.md` 及 `references/cloudbase-platform/` |
| 环境查询、认证 | 通过 `ToolSearch` 查找 `cloudbase_` 前缀的 env/auth 相关工具 |

## 代码编写参考

当用户需要编写小程序云开发代码时，优先参考以下文档：

1. **`references/miniprogram-development.md`** — 小程序云开发总纲，含 `wx.cloud.init`、`project.config.json` 等
2. **`references/miniprogram-development/cloudbase-integration.md`** — CloudBase 集成最佳实践（环境初始化、认证模型、能力边界）
3. **`references/no-sql-wx-mp-sdk/`** — 文档数据库 CRUD 操作、安全规则、聚合查询等
4. **`references/cloud-functions.md`** — 云函数编写规范（Event / HTTP 函数、`scf_bootstrap`）
5. **`references/cloud-functions/openapi-call.md`** — 云调用指南（配置 `config.json` 权限声明、调用微信开放接口）
6. **`references/auth-wechat.md`** — 小程序微信认证、`OPENID` 获取
7. **`references/cloudbase-wechat-integration.md`** — 微信支付集成

## 常见错误避免

- 给小程序生成 Web 登录页或使用 Web SDK 认证方式
- 混用 `wx.cloud` 和 Web SDK（`cloudbase-js-sdk`）
- 在非 CloudBase 项目中使用 `wx.cloud` API
- 调用 MCP 工具前未通过 `ToolSearch` 查看当前可用工具列表和参数 schema
- 猜测或编造 `cloudbase_*` 工具名（实际命名由 Server 动态注册，以 `ToolSearch` 返回为准）
- 云函数部署时遗漏 `scf_bootstrap` 或 9000 端口（HTTP 函数）
- 数据库操作未确认安全规则就从前端直接写入
- 云调用未在 `config.json` 声明 `permissions.openapi` 就直接调用 `cloud.openapi`
- 遗漏 `wx-server-sdk` 版本更新（< 0.4.0 不支持云调用）
- 权限配置后立即调用（有 10 分钟缓存），收到 -604101 时未等待缓存刷新
SKILLEOF

echo ""
echo "=== 构建完成 ==="
echo "  目标: $TARGET"
echo "  SKILL.md + $(find "$TARGET/references" -type f | wc -l | tr -d ' ') 个 reference 文件"
echo ""
echo "  下次重新构建: bash $0"
