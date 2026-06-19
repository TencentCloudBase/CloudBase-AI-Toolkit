# 实施计划

- [ ] 1. 创建通知发送辅助函数
  - 在 `mcp/src/tools/hosting.ts` 或新建工具文件（如 `mcp/src/utils/notification.ts`）中创建 `sendDeployNotification` 函数
  - 实现 CodeBuddy IDE 检测逻辑（检查 `server.ide` 或 `process.env.INTEGRATION_IDE`）
  - 实现通知发送逻辑（调用 `server.server.sendLoggingMessage`）
  - 通知格式：`type: "tcb"`, `event: "deploy"`, `data.type: "hosting" | "cloudrun"`
  - 添加错误处理和日志记录
  - _需求: 需求 1, 需求 2_

- [ ] 2. 实现静态托管部署通知
  - 在 `mcp/src/tools/hosting.ts` 的 `uploadFiles` 工具中，部署成功后调用通知函数
  - 设置 `deployType` 为 "hosting"（标识为静态托管）
  - 提取 `projectName`：从 `localPath` 提取目录名（如果 `localPath` 是文件，则提取父目录名）
  - 获取 `projectId`：使用 `getEnvId(cloudBaseOptions)` 获取环境ID
  - 构建 `consoleUrl`：`https://console.cloud.tencent.com/tcb/hosting` 或 `https://tcb.cloud.tencent.com/dev?envId=${envId}#/hosting`
  - 使用已有的 `accessUrl` 作为 `url`
  - _需求: 需求 1_

- [ ] 3. 实现云托管部署通知
  - 在 `mcp/src/tools/cloudrun.ts` 的 `manageCloudRun` 工具的 `deploy` 操作中，部署成功后调用通知函数
  - 设置 `deployType` 为 "cloudrun"（标识为云托管）
  - 查询服务详情：调用 `cloudrunService.detail({ serverName: input.serverName })` 获取服务访问地址
  - 提取 `projectName`：从 `targetPath` 提取目录名（使用 `path.basename`）
  - 获取 `projectId`：使用已有的 `getEnvId(cloudBaseOptions)` 获取环境ID
  - 构建 `consoleUrl`：`https://tcb.cloud.tencent.com/dev?envId=${envId}#/cloudrun/detail?serverName=${serverName}`
  - 从服务详情中提取访问地址作为 `url`（如果获取失败，使用空字符串或提示信息）
  - _需求: 需求 2_

- [ ] 4. 测试和验证
  - 测试静态托管部署通知在 CodeBuddy IDE 中正常发送
  - 测试云托管部署通知在 CodeBuddy IDE 中正常发送
  - 测试非 CodeBuddy IDE 环境下不发送通知
  - 测试通知数据格式正确性
  - 测试错误处理（通知发送失败不影响部署流程）
  - _需求: 需求 1, 需求 2_

