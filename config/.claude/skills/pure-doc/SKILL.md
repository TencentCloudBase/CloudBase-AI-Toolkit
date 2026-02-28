---
name: cloudbase-api-direct
description: "Direct CloudBase API calling guide without SDK. Use this skill when: (1) calling CloudBase TCB APIs directly via HTTP, (2) environments without SDK support (native apps, backend services), (3) understanding CloudBase API signatures and authentication, (4) managing CloudBase resources programmatically via REST API."
alwaysApply: false
---

# CloudBase API Direct Calling (无 SDK 直接调用)

本技能提供直接通过 HTTP 请求调用腾讯云 CloudBase API 的完整指南，无需依赖任何 SDK。

## When to use this skill

适用于以下场景：

- **Native App 开发**：iOS、Android、Flutter、React Native 等原生应用无法使用 CloudBase SDK
- **后端服务集成**：Java、Go、PHP、Rust 等语言后端需要调用 CloudBase API
- **自动化脚本**：CI/CD、运维脚本需要操作 CloudBase 资源
- **深度定制**：需要访问 SDK 未封装的底层 API

## API 调用基础

### 请求域名

```
tcb.tencentcloudapi.com
```

### 认证方式

使用腾讯云 API 签名方法 v3 (TC3-HMAC-SHA256)，需要：

1. **SecretId** 和 **SecretKey**：从 [腾讯云控制台 API 密钥](https://console.cloud.tencent.com/cam/capi) 获取
2. **签名计算**：按照 TC3-HMAC-SHA256 算法生成 Authorization header

### 请求格式

```http
POST https://tcb.tencentcloudapi.com/
Content-Type: application/json
Host: tcb.tencentcloudapi.com
X-TC-Action: {API名称}
X-TC-Version: 2018-06-08
X-TC-Timestamp: {Unix时间戳}
Authorization: TC3-HMAC-SHA256 Credential={SecretId}/{Date}/tcb/tc3_request, SignedHeaders=content-type;host, Signature={签名}

{请求体 JSON}
```

### 签名计算

详细的签名算法和公共参数说明，请阅读：[references/34812-云开发-CloudBase-公共参数_腾讯云.md](references/34812-云开发-CloudBase-公共参数_腾讯云.md)

## 查找 API 文档

**所有 CloudBase API 的详细文档都在 `references/` 目录中。**

### 如何查找

1. **查看 API 概览**：首先阅读 [references/34809-云开发-CloudBase-API-概览_腾讯云.md](references/34809-云开发-CloudBase-API-概览_腾讯云.md) 了解所有可用的 API
2. **按功能搜索**：在 `references/` 目录中搜索相关关键词（如 "环境"、"数据库"、"MySQL"、"托管" 等）
3. **阅读具体文档**：每个 API 文档包含完整的输入参数、输出参数和调用示例

### 文档命名规则

文档文件名格式为：`{文档ID}-{API描述}.md`

例如：
- `34820-云开发-CloudBase-获取环境列表_腾讯云.md` - 获取环境列表 API
- `127880-云开发-CloudBase-执行SQL语句_腾讯云.md` - 执行 SQL 语句 API
