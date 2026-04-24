# 云开发基础能力 MCP 接入

支持通过 MCP 协议来管理云开发基础能力，包括云开发环境管理、静态网站部署，数据库集合管理、数据库文档操作等。

[前往云开发平台运行 MCP Server](https://tcb.cloud.tencent.com/dev#/ai?tab=mcp&p&mcp-template=mcp-tcb)


---

## 功能特点

- **☁️ 云开发环境管理**：提供获取所有云开发环境信息、获取环境合法域名列表、添加和删除安全域名、获取和修改当前环境信息等功能。
- **💻 数据库集合管理**：支持创建、检查存在、更新、获取详细信息、列出集合、检查索引存在、查询数据分布等数据库集合相关操作。
- **📒 数据库文档操作**：可向集合中插入文档、查询文档、更新文档、删除文档。
- **🎯 数据模型查询**：数据模型查询工具，支持查询和列表数据模型（只读操作）。list操作返回基础信息，get操作返回详细信息含简化的Schema（字段列表、格式、关联关系等），docs操作生成SDK使用文档，提供低代码数据模型的查看和使用能力。
- **🌍 静态托管管理**：实现上传文件到静态网站托管、获取文件列表、删除文件或文件夹、搜索文件、绑定和解绑自定义域名、获取静态网站配置、检查域名配置、修改域名配置等功能。
- **💻临时文件管理**：能在临时目录创建文件，支持文本内容或 base64 编码的二进制内容；读取临时目录中的文件，支持文本和二进制文件。

## 使用示例

![](https://tcb-advanced-a656fc-1257967285.tcloudbaseapp.com/resources/2025-04/lowcode-2256227)

## 使用说明

### 远程 MCP

本项目支持[一键部署到腾讯云开发平台](https://docs.cloudbase.net/ai/mcp/develop/host-mcp)，提供远程 SSE 访问

[☁️ 前往云开发平台部署 MCP Server](https://tcb.cloud.tencent.com/dev#/ai?tab=mcp&p&mcp-template=mcp-alapi-cn)

部署完毕之后，可参考页面中的使用 MCP 说明，使用远程 SSE 访问 MCP Server。

### 本地 MCP

在支持 MCP 的本地客户端运行时，也可以使用通过 `npx` 来调用 `cloudbase-mcp` 工具。

```js
{
  "mcpServers": {
    "cloudbase-mcp": {
      "command": "npx",
      "args": ["npm-global-exec@latest", "@cloudbase/cloudbase-mcp@latest"],
      "env": {
        "TENCENTCLOUD_SECRETID": "腾讯云 SecretId",
        "TENCENTCLOUD_SECRETKEY": "腾讯云 SecretKey",
        "TENCENTCLOUD_SESSIONTOKEN": "腾讯云临时密钥Token，如果使用临时密钥才需要传入",
        "CLOUDBASE_ENV_ID": "云开发环境 ID"
      }
    }
  }
}
```

## 环境变量


- 需要将 `TENCENTCLOUD_SECRETID` 和 `TENCENTCLOUD_SECRETKEY`  / `TENCENTCLOUD_SESSIONTOKEN`配置为**您在云开发控制台获取的 SecretId 和 SecretKey**  （[获取腾讯云 API 密钥](https://console.cloud.tencent.com/cam/capi)）
- 需要将 `CLOUDBASE_ENV_ID` 配置为**您在云开发控制台获取的环境 ID**, [获取云开发环境 ID](https://tcb.cloud.tencent.com/dev) 


---

## 🗺️ 功能清单

### 云开发环境管理

| 工具标识                  | 功能描述                                  | 核心参数                                                                                     |
|---------------------------|-----------------------------------------|---------------------------------------------------------------------------------------------|
| `listEnvs`                | 获取所有云开发环境信息                    | 无                                                                                           |
| `getEnvAuthDomains`       | 获取云开发环境的合法域名列表              | 无                                                                                           |
| `createEnvDomain`         | 为云开发环境添加安全域名                  | `domains`（必填，安全域名数组）                                                             |
| `deleteEnvDomain`         | 删除云开发环境的指定安全域名              | `domains`（必填，安全域名数组）                                                             |
| `getEnvInfo`              | 获取当前云开发环境信息                    | 无                                                                                           |
| `updateEnvInfo`           | 修改云开发环境别名                      | `alias`（必填，环境别名）                                                                   |


---

### 数据库集合管理

| 工具标识                  | 功能描述                                  | 核心参数                                                                                     |
|---------------------------|-----------------------------------------|---------------------------------------------------------------------------------------------|
| `createCollection`        | 创建一个新的云开发数据库集合              | `collectionName`（必填，集合名称）                                                          |
| `checkCollectionExists`   | 检查云开发数据库集合是否存在              | `collectionName`（必填，集合名称）                                                          |
| `updateCollection`        | 更新云开发数据库集合配置（创建或删除索引） | `collectionName`（必填，集合名称），`options`（必填，更新选项，支持创建和删除索引）         |
| `describeCollection`      | 获取云开发数据库集合的详细信息            | `collectionName`（必填，集合名称）                                                          |
| `listCollections`         | 获取云开发数据库集合列表                  | `offset`（选填，偏移量），`limit`（选填，返回数量限制）                                       |
| `checkIndexExists`        | 检查索引是否存在                          | `collectionName`（必填，集合名称），`indexName`（必填，索引名称）                            |
| `distribution`            | 查询数据库中集合的数据分布情况            | 无                                                                                           |

---

### 数据库文档操作

| 工具标识                  | 功能描述                                  | 核心参数                                                                                     |
|---------------------------|-----------------------------------------|---------------------------------------------------------------------------------------------|
| `insertDocuments`         | 向集合中插入一个或多个文档                | `collectionName`（必填，集合名称），`documents`（必填，要插入的文档数组，每个文档为 JSON 字符串） |
| `queryDocuments`          | 查询集合中的文档                          | `collectionName`（必填，集合名称），`query`（选填，查询条件，JSON 字符串），`projection`（选填，返回字段投影，JSON 字符串），`sort`（选填，排序条件，JSON 字符串），`limit`（选填，返回数量限制），`offset`（选填，跳过的记录数） |
| `updateDocuments`         | 更新集合中的文档                          | `collectionName`（必填，集合名称），`query`（必填，查询条件，JSON 字符串），`update`（必填，更新内容，JSON 字符串），`isMulti`（选填，是否更新多条记录），`upsert`（选填，是否在不存在时插入） |
| `deleteDocuments`         | 删除集合中的文档                          | `collectionName`（必填，集合名称），`query`（必填，查询条件，JSON 字符串），`isMulti`（选填，是否删除多条记录） |

---

### 静态托管管理

| 工具标识                  | 功能描述                                  | 核心参数                                                                                     |
|---------------------------|-----------------------------------------|---------------------------------------------------------------------------------------------|
| `uploadFiles`             | 上传文件到静态网站托管                    | `localPath`（选填，本地文件或文件夹路径），`cloudPath`（选填，云端文件或文件夹路径），`files`（选填，多文件上传配置），`ignore`（选填，忽略文件模式） |
| `listFiles`               | 获取静态网站托管的文件列表                | 无                                                                                           |
| `deleteFiles`             | 删除静态网站托管的文件或文件夹            | `cloudPath`（必填，云端文件或文件夹路径），`isDir`（选填，是否为文件夹，默认为 `false`）     |
| `findFiles`               | 搜索静态网站托管的文件                    | `prefix`（必填，匹配前缀），`marker`（选填，起始对象键标记），`maxKeys`（选填，单次返回最大条目数） |
| `createHostingDomain`     | 绑定自定义域名                            | `domain`（必填，自定义域名），`certId`（必填，证书 ID）                                       |
| `deleteHostingDomain`     | 解绑自定义域名                            | `domain`（必填，自定义域名）                                                                 |
| `getWebsiteConfig`        | 获取静态网站配置                          | 无                                                                                           |
| `tcbCheckResource`        | 检查域名配置                              | `domains`（必填，域名列表）                                                                  |
| `tcbModifyAttribute`      | 修改域名配置                              | `domain`（必填，域名），`domainId`（必填，域名 ID），`domainConfig`（必填，域名配置）         |

---

### 临时文件管理

| 工具标识                  | 功能描述                                  | 核心参数                                                                                     |
|---------------------------|-----------------------------------------|---------------------------------------------------------------------------------------------|
| `createTempFile`          | 在临时目录创建文件，支持文本内容或 base64 编码的二进制内容 | `content`（必填，文件内容，可以是普通文本或 base64 编码的二进制内容），`isBase64`（选填，是否为 base64 编码，默认为 `false`），`extension`（选填，文件扩展名，如 `.txt`, `.png` 等） |
| `readTempFile`            | 读取临时目录中的文件，支持文本和二进制文件 | `filePath`（必填，文件路径），`asBase64`（选填，是否以 base64 格式返回内容，默认为 `false`） |



---

## 🔌 使用方式

- [在云开发 Agent 中使用](https://docs.cloudbase.net/ai/mcp/use/agent)
- [在 MCP Host 中使用](https://docs.cloudbase.net/ai/mcp/use/mcp-host)
- [通过 SDK 接入](https://docs.cloudbase.net/ai/mcp/use/sdk)

---

[云开发 MCP 控制台](https://tcb.cloud.tencent.com/dev#/ai?tab=mcp)  
