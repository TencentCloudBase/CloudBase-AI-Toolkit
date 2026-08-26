# CloudBase MCP v2.32.3

## 🎉 新功能

### PostgreSQL
- ExecutePGSql 默认角色调整为 `cloudbase_postgres`，保留 `cloudbase_admin` 用于需更高权限的场景，降低日常 SQL 误用高权限的风险

### DeepSeek Harness
- 新增 `@cloudbase/dsh-plugin`：为 DeepSeek Harness 提供 CloudBase 后端能力（环境、数据库、部署预览等）

## 🐛 问题修复

- 认证：多站点/模糊地域场景下，优先使用唯一可用的站点凭据槽位，避免 `AUTH_REQUIRED` 误报
- 测试：Sites 插件临时目录清理增加重试，缓解 CI 偶发 `ENOTEMPTY` 失败

## 🔧 维护与工程改进（可选阅读）

- Skills / guideline `version` 元数据同步至 2.32.3
- 依赖与 lockfile / pre-push git-guard 相关加固（随先前提交一并纳入本版本线）
