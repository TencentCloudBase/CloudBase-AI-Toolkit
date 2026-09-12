# 消息推送与客服自动回复

面向 **微信小程序 + 云开发（CloudBase）** 的消息推送与客服消息自动回复实操指南。

## 操作面（强制）

**当前唯一支持路径：** 微信开发者工具（IDE）与 wxide CLI（Nightly 的 `wechatide`，或经典 DevTools `cli`）。

| 应当 | 禁止 |
| --- | --- |
| 通过 IDE UI 或下方 wxide CLI 高层命令完成配置 / 部署 / 预览 | 用底层传输、抓 ticket、未文档化的 CGI 绕过 CLI |
| 优先 Nightly：`wechatide -c <clientName> -t <toolName>`（用 `--help` 发现参数） | 臆造工具名或参数 |
| 在微信侧工具尚未暴露前，用 IDE **云开发控制台 → 消息推送** 做回调绑定 | 把 CloudBase MCP 的 `queryMessagePush` / `manageMessagePush` 当作小程序日常操作路径教给 agent |

**微信 IDE 暴露状态：** 规格设计了 `cloud_query_msg_push` / `cloud_manage_msg_push`（由 CloudBase MCP 的 `queryMessagePush` / `manageMessagePush` 经 `EXPOSED_TOOL_NAME` 映射；需微信侧升级 `@cloudbase/cloudbase-mcp` 后）—— **尚未暴露**。在此之前，本 skill 只把 **IDE UI + 现有 wxide CLI 云/预览命令** 当作面向 agent 的操作面。不要文档化或教授底层替代方案。

**维护者 E2E（不对产品 agent）：** CloudBase-MCP msg-push 工具的完整 ticket / 回归流程在外部 skill `wxide-qbase-msgpush-e2e`（`~/.workbuddy/skills/wxide-qbase-msgpush-e2e/SKILL.md`）。只指向该处；不要把其中的底层步骤复制进本参考。

## 何时阅读本参考

- 将消息类型或事件绑定到云函数
- 实现必须能回复用户聊天的客服自动回复
- 部署接收端云函数 / 上传体验版以便真机验证
- 推送触发后查找云函数日志位置

---

## 1. 消息推送配置机制

### 消息类型 vs 事件类

回调路由以 **(MsgType, Event)** 对为键：

| 类别 | `MsgType` | `Event` | 典型用途 |
| --- | --- | --- | --- |
| 消息类型 | `text` / `image` / `voice` / `video` / `miniprogrampage` | 空字符串 (`""`) | 用户向客服发送聊天消息 / 卡片 |
| 事件类 | `event` | 具体事件名（如虚拟支付通知事件） | 平台 / 业务事件 |

规则：

- **同一 (MsgType, Event) 对只能绑定一个云函数**（重新绑定会替换原先函数）。
- `MsgType=event` 的合法事件名来自平台支持列表（IDE 消息推送面板 / 未来的 `cloud_query_msg_push` `listSupportedEvents`）。不要臆造事件字符串。
- 需要生效时，在 IDE 消息推送面板打开推送开关。

### 配置回调（当前）

1. 打开 **微信开发者工具 → 云开发控制台 → 消息推送**（文案可能随 DevTools 版本变化）。
2. 选择 **云函数** 模式（非容器），除非项目明确使用云托管回调。
3. 为所需消息类型和/或事件添加入口；各自指向接收端函数名；开启推送。

**待 wxide CLI 支持（尚未提供）：**

```text
# 尚不可用 — 不要臆造或用底层调用代替
wechatide -c <clientName> -t cloud_query_msg_push   ...
wechatide -c <clientName> -t cloud_manage_msg_push  ...
```

这些工具上线后，subscribe / unsubscribe / list / setEnable 优先用它们，少用手点 IDE。在此之前仅用 IDE 面板。

### 部署接收端云函数

务必在**云端**安装 npm 依赖，以便运行时解析 `@cloudbase/node-sdk` / `wx-server-sdk` 等模块：

```bash
wechatide -c <clientName> -t cloud_fn_deploy \
  --paths <absCloudFunctionDir> \
  --env <envId> \
  --appid <appid> \
  --remote-npm-install
```

经典 DevTools CLI 等价写法：

```bash
cli cloud functions deploy \
  --paths <absCloudFunctionDir> \
  --env <envId> \
  --appid <appid> \
  --remote-npm-install
```

注意：

- 函数目录名 = 函数名。
- 若部署时函数处于 Creating/Updating，等待约 10–15s 后重试。
- 省略 `--remote-npm-install` / `-r` 常见运行时报错 `Cannot find module '...'`。

### 体验版 / 真机验证

```bash
# 上传体验版（仅在用户明确要求发布体验版时）
wechatide -c <clientName> -t miniprogram_upload \
  --project <absProjectPath> \
  --upload-version <x.y.z> \
  --desc "<desc>"

# 需要可扫码二维码文件/窗口时用预览二维码
wechatide -c <clientName> -t create_preview_qrcode \
  --project <absProjectPath> \
  --qr-output <absOutputPath>
```

手机快速推送且无需文件路径时，优先 `auto_preview`。客服入口通常需要 `<button open-type="contact">`，并在小程序后台开通客服能力。

---

## 2. 云函数作为推送接收端

最小模式：

```js
const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  // event.MsgType / event.Event 标识 (MsgType, Event) 对
  console.log("msg-push", event.MsgType, event.Event, event);
  // ... 业务逻辑 ...
  return {}; // 仅靠返回值不会回复用户（见 §3）
};
```

检查清单：

- 一个逻辑处理器对应一个函数即可；推送配置层必须保证 **一个 (MsgType, Event) → 一个函数**。
- 日志足够排查（`MsgType`、`Event`、若有则记 openid）。
- 特权 OpenAPI 调用须在函数 `config.json` 中声明权限（见 §3）。

---

## 3. 客服自动回复机制

**关键：** 云函数消息推送模式下，函数的 **返回值不会** 变成客服回复。要回复用户必须通过 OpenAPI **主动发送**：

```js
await cloud.openapi.customerServiceMessage.send({
  touser: event.FromUserName,
  msgtype: "text",
  text: { content: "收到，我们会尽快处理" },
});
```

在函数上声明 OpenAPI 权限（`config.json` 示例）：

```json
{
  "permissions": {
    "openapi": ["customerServiceMessage.send"]
  }
}
```

修改代码或 `config.json` 后，用 `--remote-npm-install` 重新部署。

常见失败：

- 以为 `return { errcode: 0, ... }` 或文本 body 会回复 → 静默无回复。
- 缺少 `openapi` 权限 → 发送 API 运行时失败。
- 无客服入口 / 未开通能力 → 真机永远触发不了 `text` 推送。

---

## 4. 云函数日志

### IDE（现已可用）

**微信开发者工具 → 云开发控制台 → 云函数 → \<function\> → 日志**

开启云开发控制台相关面板后，接收端函数的调用日志会出现在这里。真机推送验证走此路径。

### wxide CLI（缺口）

目前尚无稳定的 wxide CLI 日志查询工具（例如未来的 `cloud_fn_logs` 或等价物）。

```text
# 待补齐 — 待 wxide CLI 提供日志查询能力
# 本 skill 不要教授底层日志 CGI 绕过
wechatide -c <clientName> -t <cloud_fn_logs_or_equivalent> ...
```

在此之前，指引 agent/用户在上方 IDE 控制台路径查看日志。

---

## 5. 建议的端到端流程（产品）

1. 实现接收端云函数（若需自动回复则加 OpenAPI send）。
2. `cloud_fn_deploy` **并带上** `--remote-npm-install`。
3. 在 IDE **消息推送** 中绑定 (MsgType, Event) → 函数（或未来的 `cloud_manage_msg_push`）。
4. 测试 `text` / 媒体消息类型时，确保已有客服入口 / 能力。
5. 上传体验版 / 预览；用真机触发。
6. 在 IDE 云函数 **日志** 中验证（CLI 日志查询能力尚未提供）。

---

## 相关

- 调试 / 预览 / `wechatide` 上下文：[devtools-debug-preview.md](devtools-debug-preview.md)
- IDE Skills 与 CloudBase MCP 分层：[wxide-vs-cloudbase-mcp.md](wxide-vs-cloudbase-mcp.md)
- CloudBase 小程序集成：[cloudbase-integration.md](cloudbase-integration.md)
- 维护者 MCP E2E 权威源（外部）：`wxide-qbase-msgpush-e2e` skill — 不要在此内联其底层步骤
- 微信侧 CLI 暴露 / 缺失命令：跟进中
- 日志 API 调研：跟进中
- msg-push 与 `EXPOSED_TOOL_NAME` 的规格设计：见本文件第 5 节起的说明

## 5. 推送模式：云函数 vs 云托管

消息推送有**推送模式**，IDE「消息推送」面板右上角展示（云函数 / 云托管）：

| 模式 | 行为 | 配置方式 |
|---|---|---|
| **云函数**（默认） | 按 (消息类型, 事件) 二元组逐条推送至对应云函数 | IDE 面板逐条添加，或 `cloud_manage_msg_push(action=subscribe)` |
| **云托管** | **整包接收所有消息**至云托管服务（一条 path 全收），云函数回调失效 | IDE 面板「云托管」切换 |

### 行为要点（MCP / IDE 一致）

- 云托管模式下，云函数回调**存在但不生效**——查询会返回 `pushMode=container` 及提示
- 云托管模式下 `subscribe/unsubscribe/setEnable` 会被**拒绝**（提示先切回云函数模式）
- 切换模式是**写操作**，需确认；切到云托管需提供服务路径（真实环境需已有云托管服务）
- 云托管开通：IDE 云开发控制台 → 云托管 → 立即开通（可能与按量付费联动）；若环境无云托管服务，配置容器回调会失败

### 操作方式（当前）

```text
# 当前唯一操作途径：微信开发者工具 IDE（消息推送面板 + 云托管页面）
# 微信侧：cloud_query_msg_push 可读 pushMode；cloud_manage_msg_push(ensureCloudFunctionMode/ensureContainerMode/setContainerCallback) 管理模式
# 底层 CGI / 开通接口细节见 skill wxide-qbase-msgpush-e2e，本参考不展开
```
