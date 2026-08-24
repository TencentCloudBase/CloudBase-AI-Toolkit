# CloudBase MCP v2.30.0

## 🎉 新功能

### 环境管理
- 支持跨区域环境查询，便于在多地域场景下定位和管理 CloudBase 环境
- 更清晰地暴露鉴权凭据边界（credential scope），帮助理解当前凭证能操作哪些环境

## 🔧 其他改进

### 鉴权与 MCP
- 移除冗余的 `login_mode` 参数，统一用 `credential_scope` 表达凭据边界，降低配置歧义

### Kimi 插件
- 插件 zip 改为白名单打包，并使用无版本号的稳定资源名，便于发布与安装链路复用

## 🔧 维护与工程改进（可选阅读）

- Skills / guideline `version` 元数据同步至 2.30.0
