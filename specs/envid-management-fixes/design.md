# 技术方案设计

## 架构概述

通过修复 envId 管理系统的多个 bug，统一环境ID获取逻辑，移除文件缓存机制，优化性能，并添加完整的测试覆盖。

## 技术方案

### 修复 1：超时时间配置

**文件**：`mcp/src/cloudbase-manager.ts`

**修改**：
```typescript
// 修改前
const ENV_ID_TIMEOUT = 60000000; // 60000 seconds

// 修改后
const ENV_ID_TIMEOUT = 600000; // 10 minutes (600 seconds) - matches InteractiveServer timeout
```

**理由**：与 InteractiveServer 的超时时间保持一致，注释和实际值匹配。

### 修复 2：统一环境变量使用

**文件**：`mcp/src/tools/cloudrun.ts`

**修改**：
- 将 4 处 `process.env.TCB_ENV_ID` 改为 `await getEnvId(cloudBaseOptions)`
- 添加 `getEnvId` 的导入

**理由**：保持与其他工具的一致性，使用统一的 envId 获取函数。

### 修复 3：envId 缓存同步

**文件**：`mcp/src/tools/interactive.ts`

**修改**：
```typescript
// 修改前
if (selectedEnvId) {
  await saveEnvIdToUserConfig(selectedEnvId);
  debug('环境ID已保存到配置文件:', selectedEnvId);
}

// 修改后
if (selectedEnvId) {
  // Update memory cache and process.env to prevent environment mismatch
  await envManager.setEnvId(selectedEnvId);
  debug('环境ID已更新缓存:', selectedEnvId);
}
```

**理由**：确保文件、缓存、process.env 三者同步，避免串环境问题。

### 修复 4：移除文件缓存机制

**涉及文件**：
- `mcp/src/cloudbase-manager.ts`
- `mcp/src/tools/interactive.ts`
- `mcp/src/tools/env.ts`
- `mcp/src/utils/telemetry.ts`
- `mcp/src/utils/cloud-mode.ts`

**修改**：
1. 移除 `saveEnvIdToUserConfig`、`loadEnvIdFromUserConfig`、`clearUserEnvId` 函数
2. 移除 `_fetchEnvId` 中从文件读取的逻辑
3. 移除 `setEnvId` 中保存到文件的逻辑
4. 更新所有引用这些函数的地方

**理由**：
- 避免多进程冲突
- 简化代码逻辑
- 环境ID属于进程级状态，不应跨进程共享

### 修复 5：优化 getCloudBaseManager

**文件**：`mcp/src/cloudbase-manager.ts`

**修改**：
```typescript
// 添加 getCachedEnvId 方法
getCachedEnvId(): string | null {
  return this.cachedEnvId;
}

// 优化 getCloudBaseManager
let finalEnvId: string | undefined;
if (requireEnvId) {
  // Optimize: Check if envManager has cached envId first (fast path)
  const cachedEnvId = envManager.getCachedEnvId();
  if (cachedEnvId) {
    debug('使用 envManager 缓存的环境ID:', cachedEnvId);
    finalEnvId = cachedEnvId;
  } else if (loginEnvId) {
    // If no cache but loginState has envId, use it to avoid triggering auto-setup
    debug('使用 loginState 中的环境ID:', loginEnvId);
    finalEnvId = loginEnvId;
  } else {
    // Only call envManager.getEnvId() when neither cache nor loginState has envId
    finalEnvId = await envManager.getEnvId();
  }
}
```

**理由**：
- 优先使用缓存（最快）
- 其次使用 loginState.envId（避免触发自动设置）
- 最后才调用 getEnvId()（可能触发自动设置）

### 修复 6：添加测试覆盖

**文件**：`tests/envid-management.test.js`

**测试覆盖**：
1. 超时时间配置验证
2. getEnvId 优先级测试
3. getCloudBaseManager 优化测试
4. 缓存同步测试
5. 文件缓存移除验证
6. CloudRun 工具修复验证
7. 环境切换场景测试
8. getCachedEnvId 方法测试

## 数据流设计

### 新的 envId 获取优先级

1. `cloudBaseOptions.envId`（如果传入）
2. `envManager.cachedEnvId`（内存缓存，最快）
3. `process.env.CLOUDBASE_ENV_ID`（进程环境变量）
4. `loginState.envId`（登录状态中的 envId）
5. `envManager.getEnvId()`（触发自动设置）

### 环境切换流程

```
用户切换环境
  ↓
_promptAndSetEnvironmentId()
  ↓
envManager.setEnvId(selectedEnvId)
  ↓
更新 cachedEnvId
  ↓
更新 process.env.CLOUDBASE_ENV_ID
  ↓
后续工具调用使用新环境ID ✅
```

## 安全性

- 移除文件缓存后，不再有文件并发写入的风险
- 环境ID仅在进程内存中，进程退出后自动清理
- 保持现有的错误处理机制

## 向后兼容性

- 所有公共 API 保持不变
- 移除文件缓存不影响现有功能（因为进程重启后会通过自动设置获取）
- 优化逻辑对用户透明

## 测试策略

1. **单元测试**：测试 envId 获取的各个路径
2. **集成测试**：测试环境切换场景
3. **代码验证测试**：验证代码中不再使用文件缓存和 TCB_ENV_ID

## 实施计划

1. 修复超时时间（立即修复）
2. 统一 cloudrun.ts 中的环境变量使用（立即修复）
3. 修复 envId 缓存同步问题（Critical - 立即修复）
4. 移除文件缓存机制（建议修复）
5. 优化 getCloudBaseManager（性能优化）
6. 添加测试覆盖（质量保障）

