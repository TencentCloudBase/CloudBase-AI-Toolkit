# 企业自有品牌授权服务协议

本协议基于 RFC 8628（OAuth 2.0 Device Authorization Grant）扩展，结合 CloudBase 托管登录页 + 自定义 OAuth 2.0 身份源，实现企业自有品牌下的免腾讯云账号授权流程。

## 协议端点

| 方法 | 路径 | 用途 |
|------|------|------|
| `GET` | `/auth/config` | 获取 CloudBase SDK 初始化配置 |
| `POST` | `/auth/device/code` | 申请设备授权码 |
| `POST` | `/auth/verify-cloudbase` | CloudBase 托管登录页认证后回调 |
| `POST` | `/auth/device/verify` | 简单确认授权（兼容） |
| `POST` | `/auth/token` | 轮询/续期/退出 |

## 完整流程

```
CLI/IDE (MCP)         企业授权服务          用户浏览器          CloudBase 托管登录页
     │                      │                  │                      │
     │  POST /device/code   │                  │                      │
     │─────────────────────►│                  │                      │
     │◄──── device_code     │                  │                      │
     │       user_code      │                  │                      │
     │       verification_uri│                  │                      │
     │                      │                  │                      │
     │            用户打开 verification_uri ───►│                      │
     │                      │                  │                      │
     │                      │       输入 user_code                    │
     │                      │◄─────────────────│                      │
     │                      │                  │                      │
     │                      │   toDefaultLoginPage()                  │
     │                      │────────────────────────────────────────►│
     │                      │                  │                      │
     │                      │                  │    飞书/企微/其他 IdP │
     │                      │                  │◄────────────────────►│
     │                      │                  │                      │
     │                      │   redirect (带 code)                    │
     │                      │◄────────────────────────────────────────│
     │                      │                  │                      │
     │                      │   Session 就绪                           │
     │                      │   POST /verify-cloudbase                │
     │                      │◄─────────────────│                      │
     │                      │   CreateEnv (若首次)                     │
     │                      │   CreateApiKey                          │
     │                      │── ok ───────────►│                      │
     │                      │                  │                      │
     │  轮询 POST /token     │                  │                      │
     │  (grant_type=device)  │                  │                      │
     │─────────────────────►│                  │                      │
     │◄── refreshToken      │                  │                      │
     │     apiKey           │                  │                      │
     │     envId            │                  │                      │
```

## 环境变量

参见 `.env.example`。

## Token 说明

| 凭证 | 生成时机 | 用途 | 生命周期 |
|------|----------|------|----------|
| `device_code` | POST /device/code | 客户端轮询标识 | EXPIRES_IN 秒 |
| `user_code` | POST /device/code | 用户浏览器确认 | EXPIRES_IN 秒 |
| `refresh_token` | POST /token (grant=device) | 客户端续期凭证 | 7 天（可配） |
| `access_token` | POST /token (grant=device) | 本次返回 API Key 值 | 7 天（与 refresh 对齐） |
