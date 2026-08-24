# CloudBase MCP v2.29.0

## 🎉 新功能

### IDE / 插件
- 新增 Kimi Code 插件清单（`kimi.plugin.json`），复用共享 CloudBase skills 与 MCP 资产，可在 Kimi 中直接开发、部署、运维 CloudBase 应用
- 发布流程会自动打包 Kimi 插件 zip，并挂到 GitHub Release 附件，方便一键安装

## 🐛 问题修复

### Kimi 插件
- 按 Kimi 官方文档对齐清单字段（`INTEGRATION_IDE=Kimi`），并固定 MCP 包版本
- 移除 Kimi 协议不支持的 skill-inject hooks
- 改为通过 `searchKnowledgeBase` 按需加载单个 routing skill，避免一次注入 29 个 skills
- 登录改为 MCP `auth` 设备码流程，不再在 skillInstructions 中引导 tcb CLI

## 📚 文档更新

- 重写 Kimi 插件界面文案，突出场景与权限说明，并与常见 Codex 插件表述方式对齐

## 🔧 维护与工程改进（可选阅读）

- Skills / guideline `version` 元数据同步至 2.29.0
