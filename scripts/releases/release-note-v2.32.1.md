# CloudBase MCP v2.32.1

## 🎉 新功能

### 小程序消息推送
- 识别云函数 / 云托管两种推送模式（`pushMode`），并支持 `ensureContainerMode` / `setContainerCallback` 切换与配置云托管整包接收
- `subscribe` 前校验目标云函数是否真实存在，避免绑到不存在的函数

## 🐛 问题修复

- 消息推送：宿主未注入函数列表 hook 时，降级跳过存在性校验（兼容微信开发者工具）

## 📚 文档更新

- Skills：补充推送模式（cloudfunction/container）说明，并统一使用微信侧工具名

## 🔧 维护与工程改进（可选阅读）

- Skills / guideline `version` 元数据同步至 2.32.1
