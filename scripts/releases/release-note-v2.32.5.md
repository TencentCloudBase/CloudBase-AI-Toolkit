# CloudBase MCP v2.32.5

## 🎉 新功能

### IDE
- 新增 Kimi Code / Kimi Work IDE 支持

### 认证
- API Key 登录成功后探测管理面（CAM）能力：若凭证只能换到网关级 STS、管理工具会静默失败，现会给出明确告警并建议改用长期 SecretId/SecretKey

## 🐛 问题修复

### 认证（国际站）
- `TCB_SITE=intl` 时 API Key 走新加坡网关换票，并补齐国际站 device-flow（OAuth 后端 + 验证 URL）
- 登录失败诊断展示真实换票地域与站点不匹配提示

### 环境与查询
- hosted OAuth（环境级 STS）下 `queryEnv(list)` 固定到已绑定环境
- 修正 queryHosting / PG sqlPreview / queryEnv 的误导性输出

## 🔒 安全

- `queryCloudRun(detail)` / `queryFunctions` 默认脱敏环境变量值；需明文时分别传 `revealEnvParams=true` / `revealEnvValues=true`

## 🔧 维护与工程改进（可选阅读）

- 移除 `searchKnowledgeBase` 的 `vector` 模式，文档检索统一走 `mode=docs`
- Skills / guideline `version` 元数据同步至 2.32.5
- Kimi 插件 MCP 依赖 pin 至 `@cloudbase/cloudbase-mcp@2.32.5`
