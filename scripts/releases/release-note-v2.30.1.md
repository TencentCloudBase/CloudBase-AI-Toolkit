# CloudBase MCP v2.30.1

## 🔧 其他改进

### Kimi 插件
- 插件 zip 改为自包含结构：顶层仅保留 `kimi.plugin.json` 与 `skills/cloudbase/`，28 个兄弟 skills 在打包时组装进 `skills/cloudbase/references/`
- 压缩包内容与 manifest 声明的激活契约（`references/<skill-id>/SKILL.md`）始终同步，避免发布产物与源码漂移

## 🔧 维护与工程改进（可选阅读）

- Skills / guideline `version` 元数据同步至 2.30.1
