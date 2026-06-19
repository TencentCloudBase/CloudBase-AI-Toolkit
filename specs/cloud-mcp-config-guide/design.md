# 技术方案设计

## 1. 文档结构设计

### 1.1 文档位置
- 在 `doc/` 目录下创建新文档：`doc/cloud-mcp-config.mdx`
- 在 `doc/sidebar.json` 中添加文档链接，放在 MCP 分类下的 IDE 配置之前

### 1.2 文档内容结构

```
# 云端 MCP 配置说明

## 概述
- 什么是云端 MCP
- 云端 MCP vs 本地 MCP 的区别
- 使用场景

## 前置条件
- 云开发环境要求
- 部署要求

## 环境变量配置
### 获取腾讯云 API 密钥
- TENCENTCLOUD_SECRETID
- TENCENTCLOUD_SECRETKEY
- TENCENTCLOUD_SESSIONTOKEN（可选）

### 获取云开发环境 ID
- CLOUDBASE_ENV_ID

## 部署云端 MCP Server
- 一键部署到云开发平台
- 部署链接和步骤

## 配置 AI IDE
- SSE 方式配置示例
- 不同 IDE 的配置方法

## 常见问题
- 环境变量获取问题
- 配置问题排查
```

## 2. 技术实现

### 2.1 文档内容来源
- 参考 `mcp/meta.json` 中的环境变量定义
- 参考 `mcp/DOC.md` 和 `mcp/Intro.md` 中的云端 MCP 说明
- 参考外部链接提供的云端 MCP 配置说明
- 参考 `mcp/src/utils/cloud-mode.ts` 中的云端模式实现

### 2.2 环境变量获取说明
需要提供以下信息：
1. **TENCENTCLOUD_SECRETID 和 TENCENTCLOUD_SECRETKEY**
   - 获取链接：https://console.cloud.tencent.com/cam/capi
   - 获取步骤说明
   - 安全提示

2. **CLOUDBASE_ENV_ID**
   - 获取链接：https://tcb.cloud.tencent.com/dev
   - 获取步骤说明

3. **TENCENTCLOUD_SESSIONTOKEN**（可选）
   - 说明何时需要
   - 如何获取临时密钥

### 2.3 配置示例
提供不同 IDE 的 SSE 配置示例，参考现有的 IDE 配置文档格式。

## 3. 文档集成

### 3.1 更新 sidebar.json
在 MCP 分类下的 IDE 配置之前添加云端 MCP 配置文档链接。

### 3.2 更新相关文档
- 在 `doc/getting-started.mdx` 中添加云端 MCP 的简要说明和链接
- 在 `doc/mcp-tools.md` 中如果有相关说明，添加云端 MCP 的引用

## 4. 参考资源
- 外部链接：https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/mcp-tools#%E4%BA%91%E7%AB%AF-mcp-%E9%85%8D%E7%BD%AE%E8%AF%B4%E6%98%8E
- 部署链接：https://tcb.cloud.tencent.com/dev#/ai?tab=mcp&p&mcp-template=mcp-tcb
- 代码实现：`mcp/src/utils/cloud-mode.ts`, `mcp/meta.json`








