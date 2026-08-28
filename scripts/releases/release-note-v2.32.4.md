# CloudBase MCP v2.32.4

## 🐛 问题修复

### 认证
- OTP 登录：`verifyOtp` 的 sdkHints 现提供完整两步调用示例，并增加 `messageId` 必填说明，避免 AI 误用独立 `auth.verifyOtp({ token })` 导致「messageId is required」错误
- 同步更新 auth-web skill 与 prompts 文档中的 OTP 指引与反例说明

## 🔧 维护与工程改进（可选阅读）

- Skills / guideline `version` 元数据同步至 2.32.4
