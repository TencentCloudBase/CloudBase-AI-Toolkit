# CodeBuddy 部署通知技术方案设计

## 系统架构

### 架构概述
在静态托管和云托管部署成功后，检测当前 IDE 环境，如果是 CodeBuddy IDE，则发送部署通知。

### 技术栈
- **IDE 检测**: 通过 `server.ide` 或 `process.env.INTEGRATION_IDE` 判断
- **通知 API**: `server.server.sendLoggingMessage`
- **路径处理**: Node.js `path` 模块
- **日志**: 使用现有的 logger 工具

## 核心设计

### 1. 通知发送辅助函数

创建一个通用的通知发送函数，封装 CodeBuddy IDE 检测和通知发送逻辑：

```typescript
/**
 * Send deployment notification to CodeBuddy IDE
 * @param server ExtendedMcpServer instance
 * @param notificationData Deployment notification data
 */
async function sendDeployNotification(
  server: ExtendedMcpServer,
  notificationData: {
    deployType: 'hosting' | 'cloudrun'; // 部署类型：hosting=静态托管，cloudrun=云托管
    url: string;
    projectId: string;
    projectName: string;
    consoleUrl: string;
  }
): Promise<void>
```

**实现要点：**
- 检查 `server.ide === 'CodeBuddy'` 或 `process.env.INTEGRATION_IDE === 'CodeBuddy'`
- 调用 `server.server.sendLoggingMessage` 发送通知，格式为：
  ```typescript
  {
    level: "notice",
    data: {
      type: "tcb",
      event: "deploy",
      data: {
        type: notificationData.deployType, // "hosting" 或 "cloudrun"
        url: notificationData.url,
        projectId: notificationData.projectId,
        projectName: notificationData.projectName,
        consoleUrl: notificationData.consoleUrl
      }
    }
  }
  ```
- 错误处理：捕获异常并记录日志，不影响主流程

### 2. 静态托管部署通知

**位置**: `mcp/src/tools/hosting.ts` - `uploadFiles` 工具

**触发时机**: 文件上传成功后，在返回结果之前

**数据获取：**
- `deployType`: 固定为 "hosting"（标识为静态托管）
- `url`: 使用已有的 `accessUrl`（`https://${staticDomain}/${cloudPath || ''}`）
- `projectId`: 使用 `getEnvId(cloudBaseOptions)` 获取
- `projectName`: 从 `localPath` 或 `targetPath` 提取目录名（使用 `path.basename`）
- `consoleUrl`: `https://console.cloud.tencent.com/tcb/hosting` 或 `https://tcb.cloud.tencent.com/dev?envId=${envId}#/hosting`

**实现位置**: 在 `uploadFiles` 工具的第 65 行之后，返回结果之前

### 3. 云托管部署通知

**位置**: `mcp/src/tools/cloudrun.ts` - `manageCloudRun` 工具的 `deploy` 操作

**触发时机**: 部署成功后，在返回结果之前

**数据获取：**
- `deployType`: 固定为 "cloudrun"（标识为云托管）
- `url`: 需要查询服务详情获取访问地址
  - 部署成功后，调用 `cloudrunService.detail({ serverName: input.serverName })` 获取服务详情
  - 从服务详情中提取访问地址（可能需要从 `BaseInfo` 或 `AccessInfo` 中获取）
- `projectId`: 使用 `getEnvId(cloudBaseOptions)` 获取（已有）
- `projectName`: 从 `targetPath` 提取目录名（使用 `path.basename`）
- `consoleUrl`: `https://tcb.cloud.tencent.com/dev?envId=${envId}#/cloudrun/detail?serverName=${serverName}`

**实现位置**: 在 `manageCloudRun` 工具的 `deploy` 操作中，第 588 行部署成功后，第 606 行返回结果之前

**注意事项**: 
- 如果无法获取服务访问地址，仍然发送通知，但 `url` 可以为空或提示信息
- 需要处理查询服务详情可能失败的情况

## 数据流设计

### 静态托管部署通知流程

```
uploadFiles 执行
  ↓
文件上传成功
  ↓
获取环境信息 (envInfo)
  ↓
提取 staticDomain 和构建 accessUrl
  ↓
提取 projectName (从 localPath)
  ↓
获取 envId
  ↓
构建 consoleUrl
  ↓
发送通知 (如果是 CodeBuddy IDE)
  ↓
返回结果
```

### 云托管部署通知流程

```
manageCloudRun deploy 执行
  ↓
部署成功
  ↓
查询服务详情 (获取访问地址)
  ↓
提取 projectName (从 targetPath)
  ↓
获取 envId (已有)
  ↓
构建 consoleUrl
  ↓
发送通知 (如果是 CodeBuddy IDE)
  ↓
返回结果
```

## 错误处理策略

1. **IDE 检测失败**: 静默失败，不影响部署流程
2. **通知发送失败**: 记录错误日志，但不抛出异常
3. **数据获取失败**: 
   - `url` 获取失败：使用空字符串或提示信息
   - `projectName` 获取失败：使用 "unknown" 或服务名称
   - `projectId` 获取失败：使用空字符串
   - `consoleUrl` 构建失败：使用基础控制台URL

## 测试策略

1. **单元测试**: 
   - 测试通知发送函数在不同 IDE 环境下的行为
   - 测试数据提取逻辑（projectName、consoleUrl 构建等）
2. **集成测试**:
   - 测试静态托管部署后通知发送
   - 测试云托管部署后通知发送
   - 测试非 CodeBuddy IDE 环境下不发送通知

## 安全性

- 通知数据不包含敏感信息（密钥、token 等）
- 仅包含公开的访问地址和控制台URL
- 错误信息不泄露内部实现细节

