# CloudBase MCP v2.32.2

## 🐛 问题修复

- 消息推送：在微信开发者工具 `apihttpagent` 返回 `-9991` 时，降级跳过云托管配置读取（`list` 场景兼容）
- 依赖：`@cloudbase/manager-node` 升级至 5.8.2，支持 `requestFn` 注入

## 📚 文档更新

- Skills：完善消息推送 / 客服参考中的云托管模式说明

## 🔧 维护与工程改进（可选阅读）

- 新增 pre-push git-guard（分支基线与 lockfile 同步校验）
- Skills / guideline `version` 元数据同步至 2.32.2
