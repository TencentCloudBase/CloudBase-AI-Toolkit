# 需求文档

## 介绍

当前遥测数据上报功能存在环境ID获取逻辑问题。当用户通过 `createCloudBaseMcpServer` 直接传入 `cloudBaseOptions` 包含 `envId` 时，遥测上报仍然只从环境变量或配置文件获取环境ID，导致上报数据不准确。

## 问题分析

1. **当前逻辑缺陷**：遥测上报函数 `reportToolCall` 和 `reportToolkitLifecycle` 只从 `process.env.CLOUDBASE_ENV_ID` 或配置文件获取环境ID
2. **数据不一致**：当用户通过 `cloudBaseOptions` 传入环境ID时，遥测数据中的环境ID可能为空或错误
3. **影响范围**：所有工具调用的遥测数据都可能包含错误的环境ID信息

## 需求

### 需求 1 - 修复遥测数据环境ID获取逻辑

**用户故事：** 当用户通过 `createCloudBaseMcpServer` 的 `cloudBaseOptions` 传入环境ID时，遥测数据上报应该优先使用传入的环境ID，确保数据一致性。

#### 验收标准

1. When 用户通过 `cloudBaseOptions` 传入 `envId` 时，the 遥测数据上报 shall 优先使用传入的环境ID
2. When 用户未通过 `cloudBaseOptions` 传入 `envId` 时，the 遥测数据上报 shall 回退到当前逻辑（环境变量或配置文件）
3. When 所有环境ID获取方式都失败时，the 遥测数据上报 shall 使用 'unknown' 作为默认值
4. When 工具调用发生错误时，the 遥测数据上报 shall 包含正确的环境ID信息
5. When Toolkit 生命周期事件发生时，the 遥测数据上报 shall 包含正确的环境ID信息

### 需求 2 - 优化遥测数据获取机制

**用户故事：** 遥测数据获取应该能够访问到服务器实例中存储的配置信息，避免重复的环境ID获取逻辑。

#### 验收标准

1. When 遥测上报函数被调用时，the 系统 shall 能够访问到服务器实例的 `cloudBaseOptions`
2. When 服务器实例包含环境ID配置时，the 遥测数据 shall 使用该配置
3. When 服务器实例不包含环境ID配置时，the 遥测数据 shall 使用回退机制
4. When 环境ID获取失败时，the 系统 shall 记录调试信息但不影响正常功能

## 技术约束

- 保持向后兼容性，不影响现有功能
- 避免循环依赖问题
- 保持遥测数据的准确性和完整性
- 确保错误处理机制正常工作 