# cloudbase-auth-endpoint-with-feishu

基于 `cloudbase-cli-auth-endpoint` 改造的企业自有品牌授权服务示例。

## 核心变化

相对原始参考实现，本示例增加了：

1. **CloudBase 托管登录页集成**：授权页通过 `auth.toDefaultLoginPage()` 跳转 CloudBase 托管登录页，展示所有已配置的企业身份源
2. **1+N 环境自动创建**：用户首次通过身份源登录后，自动创建独立 CloudBase 环境并签发 API Key
3. **自定义 OAuth 2.0 身份源支持**：在 CloudBase 控制台配置飞书/企业微信/Google/LDAP 等身份源，无需修改代码

## 快速开始

```bash
cp .env.example .env
# 编辑 .env 填入 CloudBase 环境配置和腾讯云 API 密钥
npm install
npm run dev
```

## 文档

完整流程参见 `docs/enterprise-auth-with-feishu.md`
