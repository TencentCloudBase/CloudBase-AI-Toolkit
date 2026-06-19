# 需求文档

## 介绍

在 doc 目录中增加云端 MCP 的配置指南文档，主要说明如何配置云端 MCP 以及如何获取所需的环境变量参数。这将帮助用户了解如何通过远程 SSE 方式使用 CloudBase MCP，而不仅仅是在本地运行。

## 需求

### 需求 1 - 云端 MCP 配置指南文档

**用户故事：** 作为用户，我希望在文档中找到云端 MCP 的配置说明，包括如何获取所需的环境变量参数，以便我能够正确配置和使用云端 MCP 服务。

#### 验收标准

1. When 用户在文档中查找云端 MCP 配置信息时，系统应当提供完整的云端 MCP 配置指南文档。
2. When 用户查看云端 MCP 配置指南时，系统应当说明如何获取以下环境变量：
   - `TENCENTCLOUD_SECRETID` - 腾讯云 SecretId
   - `TENCENTCLOUD_SECRETKEY` - 腾讯云 SecretKey  
   - `TENCENTCLOUD_SESSIONTOKEN` - 腾讯云临时密钥 Token（可选，仅在使用临时密钥时需要）
   - `CLOUDBASE_ENV_ID` - 云开发环境 ID
3. When 用户查看云端 MCP 配置指南时，系统应当提供获取这些环境变量的详细步骤和链接。
4. When 用户查看云端 MCP 配置指南时，系统应当说明云端 MCP 与本地 MCP 的区别和使用场景。
5. When 用户查看云端 MCP 配置指南时，系统应当提供云端 MCP 的配置示例（SSE 方式）。
6. When 用户查看云端 MCP 配置指南时，系统应当说明如何部署云端 MCP Server 到云开发平台。








