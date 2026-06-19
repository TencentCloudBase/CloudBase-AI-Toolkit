# 技术方案设计

## 概述

本次变更只更新 `config/source/skills/auth-tool/SKILL.md`，不修改工具实现，也不生成兼容产物。目标是把 skill 中“基础登录策略”和“provider / client 配置”三类能力重新归位：

- 基础登录策略：使用 `tcb/DescribeLoginConfig` 与 `tcb/ModifyLoginConfig`
- 第三方认证源与邮箱 provider：继续使用 `tcb/GetProviders`、`tcb/ModifyProvider`、`tcb/AddProvider`、`tcb/DeleteProvider`
- 应用客户端配置：补充 `tcb/DescribeClient` 与 `tcb/ModifyClient` 的定位说明，但不扩展为本次主流程

## 设计目标

1. 移除 `lowcode/DescribeLoginStrategy`、`lowcode/ModifyLoginStrategy` 作为默认登录策略方案。
2. 保留原有“拿当前配置 -> 修改目标字段 -> 提交更新”的示例风格。
3. 明确区分登录配置、provider 配置和 client 配置，避免相互替代。
4. 不将可调用的正式 API 错误降级为“优先控制台操作”。

## 文档结构调整

`SKILL.md` 将保留现有 skill 框架，只重写 `Authentication Scenarios` 中与登录配置相关的部分：

1. 将 `Get Login Strategy` 改为 `Get Login Config`
2. 将 `Anonymous Login`、`Username/Password Login`、`SMS Login` 的查询/更新示例改为基于 `DescribeLoginConfig` + `ModifyLoginConfig`
3. 将 `Email Login` 拆成两层说明：
   - 登录开关属于 `ModifyLoginConfig.EmailLogin`
   - 邮件发送通道和 SMTP 参数属于 `ModifyProvider(Id="email")`
4. 保留 `WeChat Login`、`Google Login`、`Get Publishable Key` 等现有高价值示例
5. 增加一小节 `Client Configuration Boundary`，说明 `DescribeClient` / `ModifyClient` 适用于应用客户端配置，不作为基础登录方式开关接口

## API 对齐策略

### 1. 基础登录配置

基于官方文档，`DescribeLoginConfig` 返回以下核心字段：

- `EmailLogin`
- `AnonymousLogin`
- `UserNameLogin`
- `PhoneNumberLogin`
- `SmsVerificationConfig`
- `MfaConfig`
- `PwdUpdateStrategy`

因此 skill 中示例将统一采用下面的模式：

1. 先调用 `DescribeLoginConfig`
2. 基于返回对象修改目标字段
3. 调用 `ModifyLoginConfig`

示例风格保持与原文档一致，仍然给出结构化 `callCloudApi` 请求，而不是抽象伪代码。

### 2. 邮箱登录的双层配置

邮箱相关能力需要拆开表达：

- `ModifyLoginConfig.EmailLogin`：控制“邮箱密码登录”是否允许
- `ModifyProvider(Id="email")`：控制邮件发送渠道与 SMTP 配置

这样既符合官方接口语义，也能保留原来 SMTP 参数示例的实用价值。

### 3. Provider 与 Client 的边界

- `GetProviders` / `ModifyProvider` / `AddProvider` / `DeleteProvider`：用于第三方认证源和邮箱 provider
- `DescribeClient` / `ModifyClient`：用于应用客户端配置，例如 ClientId、安全域名、Scope、Token 有效期等

本次只在 skill 中补充边界说明，不增加新的复杂操作章节，避免让 `auth-tool` 继续膨胀。

## 示例编写规则

1. 示例继续使用现有 JSON 风格：
   - `params`
   - `service`
   - `action`
2. `service` 统一使用 `tcb`
3. 登录配置示例必须体现“读取后修改再写回”的操作顺序
4. 对短信登录，保留 `SmsVerificationConfig` 的 `default` / `apis` 两类参数示例
5. 对邮箱 provider，保留腾讯云邮件与自定义 SMTP 两组示例

## 验证策略

本次不涉及运行时代码，验证以文档检查为主：

1. 检查 `SKILL.md` 中不再出现 `lowcode/DescribeLoginStrategy` 或 `lowcode/ModifyLoginStrategy`
2. 检查基础登录方式章节全部切换到 `DescribeLoginConfig` / `ModifyLoginConfig`
3. 检查邮箱章节同时包含登录开关与 provider 参数示例
4. 检查 provider 与 client 能力边界文字清晰，不互相替代

## 参考

- [获取登录策略](https://cloud.tencent.com/document/api/876/129354)
- [修改登录策略](https://cloud.tencent.com/document/api/876/129351)
- [查询应用客户端详情](https://cloud.tencent.com/document/api/876/129355)
- [修改应用客户端](https://cloud.tencent.com/document/api/876/129352)
- [获取三方认证源列表](https://cloud.tencent.com/document/api/876/129353)
- [修改第三方认证源](https://cloud.tencent.com/document/api/876/129350)
- [删除第三方认证源](https://cloud.tencent.com/document/api/876/129356)
- [添加第三方认证源](https://cloud.tencent.com/document/api/876/129357)
