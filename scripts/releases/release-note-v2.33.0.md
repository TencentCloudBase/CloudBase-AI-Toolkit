# CloudBase MCP v2.33.0

## 🎉 新功能

### 云函数
- 支持自定义容器镜像部署，并提供异步部署状态查询，避免长构建阻塞对话

### 应用上传与部署
- 新增云端上传通道：`queryApps(getUploadUrl)`；`deployApp` 支持 localPath 与 cosTimestamp 二选一

### 环境绑定
- `cloudbaserc.json` 可作为字段级环境绑定回退源（envId / region / site），支持字面量与 `{{env.KEY}}` 模板

### Skills / Experts
- 新增小程序虚拟支付参考文档
- 新增 `codebuddy-ide-mcp-upgrade` skill（IDE 内置 MCP 升级与白名单同步）
- WorkBuddy expert 包源码、同步工作流，以及 release assets 挂载 expert zip

### 错误码引导
- `searchKnowledgeBase` / `cloudbase-platform` skill 引导 Agent 按官方错误码文档排查，不再凭记忆推断套餐能力

## 🐛 问题修复

- 按结构化 `Code` 集中错误引导（不再依赖不稳定的 `Message` 文案）
- hosted MCP 缺陷批：cloud-mode 门禁、PG/dataModel、isError 语义、storagePG、rag 远程文档等
- 加固 cloud-mode 下 `deployApp` 的 localPath 门禁
- 恢复 cloudbase skill 描述中的激活关键模型词汇

## 🔧 维护与工程改进（可选阅读）

- env domain 工具命名收敛到 `query*` / `manage*` 体系
- dsh-plugin 0.1.0 下线右侧 details 面板
- 修复 Crawl CloudBase API Docs：目标分支 `chore/pure_doc_skill` 仍为 npm lockfile，恢复 `npm ci`（#981 pnpm 切换导致 schedule 失败）
- Skills / guideline `version` 元数据同步至 2.33.0
- Kimi 插件 MCP 依赖 pin 至 `@cloudbase/cloudbase-mcp@2.33.0`
