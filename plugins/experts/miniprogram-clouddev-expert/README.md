# 小程序云开发专家

微信云开发（CloudBase 与微信小程序团队共建）的小程序全链路开发专家：以云开发 skill 为知识、微信开发者工具 CLI/MCP 为工具，覆盖云函数、云数据库、消息推送回调、编译预览部署，以及个人主体虚拟支付接入。

## 类型

Agent 型（单专家）

## 定位与分工

| 层 | 承担 | 来源 |
|----|------|------|
| 知识 | 云开发平台知识、最佳实践 | `miniprogram-development` 等 skill（运行时引用，不复制进包） |
| 工具 | 编译、预览、上传、云函数部署、消息推送订阅 | `wechatide-skill` + 微信开发者工具 Nightly（≥ 2.02.2608312）的 CLI/MCP |
| 行业参考 | 个人主体虚拟支付全链路 | `miniprogram-virtualpay-person` skill + 包内 `references/personal-virtual-pay-playbook.md` |
| 额外参考 | CloudBase 平台知识（可选装） | `cloudbase-platform` / `cloud-functions` / `no-sql-wx-mp-sdk` / `auth-wechat` 等 skill |

## 前置依赖

- **微信开发者工具 Nightly 版 ≥ 2.02.2608312**（内置虚拟支付 Skill 与 MCP 能力）：https://developers.weixin.qq.com/miniprogram/dev/devtools/log.html
- **云开发环境**：已开通 CloudBase，有 EnvId（tcb.cloud.tencent.com）
- **三个核心 Skill**（未装时专家会引导按 https://skillhub.cn/install/skillhub.md 安装）：
  - `miniprogram-virtualpay-person`
  - `miniprogram-development`
  - `wechatide-skill`

## 适用场景

- 小程序云开发从 0 到 1（wx.cloud + 云函数 + 文档库 + OPENID）
- 云函数创建、部署、消息推送回调订阅
- 个人主体虚拟支付接入（开通、下单签名、幂等发货、查单兜底、退款）
- 开发者工具 CLI 编译预览、真机联调、报错排查

## 使用示例

- 我有一个个人小程序，已开通虚拟支付并配置好道具，请用云开发帮我接入完整支付链路
- 帮我创建并部署一个云函数，并订阅消息推送回调
- 用微信开发者工具 CLI 编译预览我的小程序并排查报错

## 头像

头像已通过 ImageGen 生成在 `avatars/` 目录下。如需替换为自定义头像，要求：
- 格式：PNG（推荐）或 JPG
- 尺寸：512×512 px
- 大小：单张不超过 500KB

## 安装 / 同步

本目录是专家包**源码真源**（随 CloudBase-MCP 仓库版本控制）。在仓库根目录执行：

```bash
npm run experts:sync miniprogram-clouddev-expert
```

WorkBuddy 侧 `~/.workbuddy/plugins/marketplaces/my-experts/plugins/` 是同步产物，不要手改。
