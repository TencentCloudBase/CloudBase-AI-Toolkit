# CloudBase MCP v2.32.0

## 🎉 新功能

### 小程序消息推送
- 新增 `queryMessagePush` / `manageMessagePush`，可批量管理事件类与消息类型（text/image 等）订阅
- 订阅默认覆盖虚拟支付相关事件，支持声明式幂等合并、乐观锁冲突重试，以及可选 appid 多会话透传
- 配套补充消息推送 / 客服自动回复 skill 参考，并完成 miniprogram-development 分层中文化

### 网关与自定义域名
- `manageGateway` 在创建自定义域名或路由前先校验 HTTP 服务是否就绪
- 支持证书自动选择，并在失败时给出更清晰的 DNS 指引

## 🐛 问题修复

- 云托管：`getDeployLog` 遇 CODING 登录 / 无构建场景时，统一改写为进程日志与部署记录相关建议
- 消息推送：重绑时保留原启用状态，version 冲突优先按结构化错误码处理
- Skills：压缩 miniprogram-development 描述，避免触发 Codex 1024 字符限制

## 🔧 维护与工程改进（可选阅读）

- 同步三份 lockfile 中的 `@cloudbase/manager-node`，修复 nightly-build `npm ci` 失败
- Skills / guideline `version` 元数据同步至 2.32.0
