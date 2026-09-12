# 微信 IDE Skills 与 CloudBase MCP / Skills

**微信云开发 = CloudBase × 微信**：同一套云能力，在微信侧用开发者工具登录态直达；CloudBase MCP 补 IDE Skills 未覆盖的进阶云治理。

## 三层结构

| 层 | 角色 | 登录 | 典型能力 |
| --- | --- | --- | --- |
| **微信 IDE Skills**（Nightly） | 执行面（小程序默认） | 开发者工具内微信扫码登录 | 项目 / 编译 / 模拟器 / 预览 / 上传、自动化、控制台/网络、经 `wechatide` 的云环境 / 云函数 / NoSQL / 云存储 |
| **CloudBase Skills** | 知识包 | 不替代登录 | CloudBase 规则、陷阱、编码约定（`npx skills add tencentcloudbase/cloudbase-skills -y`） |
| **CloudBase MCP** | 完整云能力补全 | 腾讯云鉴权（API Key / web / device-code） | 环境治理、细粒度权限、数据模型、MySQL/PostgreSQL，以及 IDE Skills 未覆盖的其他缺口 |

Nightly 内置 Skills/MCP：https://developers.weixin.qq.com/miniprogram/dev/devtools/nightly_backup.html

## 决策树

1. 任务是否为小程序 **调试 / 预览 / 打开项目 / 控制台 / 网络 / 上传体验版**？
   - 是 → **微信 IDE Skills**（`wechatide`）。见 [devtools-debug-preview.md](devtools-debug-preview.md)。
2. 任务是否为小程序 CloudBase 环境上的 **日常** 云操作（列举/查询集合、部署函数、列举/上传存储）？
   - Nightly 可用 → **微信 IDE Skills** 的 `cloudbase-operator` 工具。
   - Nightly 不可用 → **CloudBase MCP**（完成腾讯云登录后）。
3. 任务是否为 **消息推送 / 客服自动回复**（消息推送、客服自动回复、MsgType/Event 回调绑定）？
   - → 优先 **微信 IDE Skills / IDE 云开发控制台**。见 [message-push-customer-service.md](message-push-customer-service.md)。
   - `cloud_query_msg_push` / `cloud_manage_msg_push` **尚未暴露**（等待微信 IDE 侧升级支持）。不要用底层传输绕过。
4. 任务是否为 **进阶云能力**（数据模型 / MySQL / PG / 细粒度安全规则 / 超出 IDE 工具的多环境平台运维）？
   - → **CloudBase MCP**。
5. 始终有用：安装 **CloudBase Skills** 作为编写 CloudBase 代码的知识约束 —— 它们不能替代任一执行面。

## 应当 / 禁止

**应当**

- 高频小程序工作流优先 Nightly + `wechatide`
- 保持安装 CloudBase Skills 以获取最佳实践知识
- 用 CloudBase MCP 填补 IDE Skills 未覆盖的缺口

**禁止**

- 在 `wechatide` 已能用微信登录完成日常 NoSQL / 函数 / 存储操作时，仍强制单独走腾讯云 MCP 登录
- 假定稳定版 DevTools 与 Nightly 具备相同的 Skills/MCP
- 复制或臆造 `wechatide` 工具 schema —— 使用 `--help` 与 Nightly 的 `tools.yaml`

## 相关

- 执行路径：[devtools-debug-preview.md](devtools-debug-preview.md)
- `wx.cloud` / OPENID / 客户端规则：[cloudbase-integration.md](cloudbase-integration.md)
- 消息推送 / 客服自动回复：[message-push-customer-service.md](message-push-customer-service.md)
