# 需求文档

## 介绍

在 CodeBuddy IDE 中，当静态托管和云托管部署成功后，需要发送通知来显示部署地址信息，方便用户快速访问部署的应用。

## 需求

### 需求 1 - 静态托管部署成功通知

**用户故事：** 作为 CodeBuddy IDE 用户，当静态托管部署成功后，我希望收到一个通知显示访问地址，这样我可以快速打开部署的应用。

#### 验收标准

1. When 静态托管部署成功（`uploadFiles` 工具执行成功）时，the 系统 shall 在 CodeBuddy IDE 中发送部署通知
2. When 发送通知时，the 系统 shall 包含以下信息：
   - `type`: "tcb"
   - `event`: "deploy"
   - `data.type`: "hosting"（标识为静态托管）
   - `data.url`: 预览地址（完整的 HTTPS URL）
   - `data.projectId`: 环境ID（envId）
   - `data.projectName`: 项目目录名（从 targetPath 提取）
   - `data.consoleUrl`: 控制台URL（静态托管管理页面）
3. When 当前 IDE 不是 CodeBuddy 时，the 系统 shall 不发送通知（保持原有行为）
4. When 发送通知失败时，the 系统 shall 记录错误日志但不影响部署流程

### 需求 2 - 云托管部署成功通知

**用户故事：** 作为 CodeBuddy IDE 用户，当云托管部署成功后，我希望收到一个通知显示服务访问地址，这样我可以快速访问部署的后端服务。

#### 验收标准

1. When 云托管部署成功（`manageCloudRun` 工具的 `deploy` 操作执行成功）时，the 系统 shall 在 CodeBuddy IDE 中发送部署通知
2. When 发送通知时，the 系统 shall 包含以下信息：
   - `type`: "tcb"
   - `event`: "deploy"
   - `data.type`: "cloudrun"（标识为云托管）
   - `data.url`: 服务访问地址（从部署结果中获取）
   - `data.projectId`: 环境ID（envId）
   - `data.projectName`: 项目目录名（从 targetPath 提取）
   - `data.consoleUrl`: 控制台URL（云托管服务详情页面）
3. When 当前 IDE 不是 CodeBuddy 时，the 系统 shall 不发送通知（保持原有行为）
4. When 发送通知失败时，the 系统 shall 记录错误日志但不影响部署流程
5. When 无法获取服务访问地址时，the 系统 shall 仍然发送通知，但 `data.url` 可以为空或提示信息

## 技术约束

1. 通知格式必须符合 CodeBuddy IDE 的 `sendLoggingMessage` API 规范
2. 通知发送必须使用 `server.server.sendLoggingMessage` 方法
3. 仅在检测到当前 IDE 为 CodeBuddy 时发送通知
4. 通知发送失败不应影响部署流程的正常执行

