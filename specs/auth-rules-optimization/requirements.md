# 需求文档

## 介绍

根据 GitHub Issue #115 的反馈，当用户在开发 web 功能时，AI 没有使用项目中内置的 web SDK 中的最佳实践（使用 auth.toDefaultLoginPage），而是错误地使用云函数和云数据库来实现注册登录。这是一个很严重的错误，因为云开发的登录认证和注册等都在 SDK 中有内置，小程序中则是免登录的，直接可以从云函数中获取到 openid。

需要在 AI 规则中予以强调，避免 AI 开发工具犯错。

## 需求

### 需求 1 - Web 端登录认证规则优化

**用户故事：** 当用户要求增加登录注册服务时，AI 应该优先使用 CloudBase Web SDK 内置的认证功能，而不是手动实现云函数和数据库操作。

#### 验收标准

1. When 用户在 Web 项目中要求添加登录注册功能时，the AI 开发工具 shall 优先使用 `@cloudbase/js-sdk` 中的 `auth.toDefaultLoginPage()` 方法。
2. When 用户需要匿名登录时，the AI 开发工具 shall 使用 `auth.signInAnonymously()` 方法。
3. When 用户需要自定义登录页面时，the AI 开发工具 shall 使用 `auth.signInWithRedirect()` 或 `auth.signInWithPopup()` 方法。
4. When AI 开发工具生成登录相关代码时，the 代码 shall 包含完整的登录状态检查和错误处理逻辑。
5. When 用户要求实现用户管理功能时，the AI 开发工具 shall 使用 `auth.getCurrentUser()` 和 `auth.getLoginState()` 方法获取用户信息。

### 需求 2 - 小程序端登录认证规则优化

**用户故事：** 当用户在小程序项目中要求添加登录功能时，AI 应该明确告知小程序是免登录的，可以直接从云函数中获取 openid。

#### 验收标准

1. When 用户在小程序项目中要求添加登录功能时，the AI 开发工具 shall 明确告知小程序云开发是免登录的。
2. When 用户需要获取用户身份信息时，the AI 开发工具 shall 指导用户使用 `wx.cloud.callFunction()` 在云函数中通过 `wxContext.OPENID` 获取用户 openid。
3. When 用户需要用户管理功能时，the AI 开发工具 shall 建议在云函数中基于 openid 进行用户数据管理。
4. When AI 开发工具生成小程序代码时，the 代码 shall 不包含不必要的登录页面或登录流程。

### 需求 3 - 规则文件更新

**用户故事：** 需要在规则文件中明确区分 Web 端和小程序端的认证方式，避免混淆。

#### 验收标准

1. When 更新 Web 开发规则时，the 规则文件 shall 明确强调使用 SDK 内置认证功能。
2. When 更新小程序开发规则时，the 规则文件 shall 明确说明免登录特性和 openid 获取方式。
3. When 更新云开发平台规则时，the 规则文件 shall 包含认证相关的最佳实践指导。
4. When AI 开发工具参考规则文件时，the 工具 shall 根据项目类型选择正确的认证方式。

### 需求 4 - 错误预防机制

**用户故事：** 建立机制防止 AI 开发工具错误地使用云函数实现登录认证。

#### 验收标准

1. When AI 开发工具检测到用户要求实现登录功能时，the 工具 shall 首先检查项目类型（Web/小程序）。
2. When 项目类型为 Web 时，the AI 开发工具 shall 禁止使用云函数实现登录认证逻辑。
3. When 项目类型为小程序时，the AI 开发工具 shall 禁止生成登录页面或登录流程代码。
4. When AI 开发工具生成认证相关代码时，the 代码 shall 包含注释说明为什么使用特定的认证方式。 