# 环境开通流程优化 - 变更日志

## 配置调整

### 变更说明

根据用户反馈，对环境开通流程进行了以下配置调整：

#### 1. 环境类型动态获取 ✅
**变更前**:
- 固定使用 `Type: "sv_tcb_personal_qps_free"`

**变更后**:
- 使用活动返回的第一个 Type
- 从 `firstActivity.Type` 或 `firstActivity.ActivityType` 字段获取
- 回退值：`"sv_tcb_personal_qps_free"`

**代码变更**:
```typescript
// Before
const createResult = await cloudbase.commonService("tcb").call({
  Action: "CreateFreeEnvByActivity",
  Param: {
    Alias: "ai-native",
    Type: "sv_tcb_personal_qps_free",
    // ...
  }
});

// After
const firstActivity = activities[0];
const activityType = firstActivity.Type || firstActivity.ActivityType || "sv_tcb_personal_qps_free";

const createResult = await cloudbase.commonService("tcb").call({
  Action: "CreateFreeEnvByActivity",
  Param: {
    Alias: "ai-native",
    Type: activityType,  // Dynamic
    // ...
  }
});
```

**影响**:
- 更灵活地适配不同活动类型
- 支持新用户、回流用户等不同活动的环境类型

#### 2. 移除 PolicyNames 参数 ✅
**变更前**:
```typescript
PolicyNames: [
  "QcloudAccessForTCBRole",
  "QcloudAccessForTCBRoleInAccessCloudBaseRun"
]
```

**变更后**:
- 完全移除 `PolicyNames` 参数
- InitTcb 接口不再传入该参数

**代码变更**:
```typescript
// Before
await cloudbase.commonService("tcb").call({
  Action: "InitTcb",
  Param: {
    Source: "qcloud",
    Channel: "mcp-auto-setup",
    PolicyNames: [
      "QcloudAccessForTCBRole",
      "QcloudAccessForTCBRoleInAccessCloudBaseRun"
    ]
  }
});

// After
await cloudbase.commonService("tcb").call({
  Action: "InitTcb",
  Param: {
    Source: "qcloud",
    Channel: "mcp"
  }
});
```

**影响**:
- 简化初始化流程
- 减少不必要的权限配置

#### 3. Channel 参数调整 ✅
**变更前**:
- `Channel: "mcp-auto-setup"`

**变更后**:
- `Channel: "mcp"`

**代码变更**:
```typescript
// Before
Channel: "mcp-auto-setup"

// After
Channel: "mcp"
```

**影响**:
- 统一标识符，使用简短的 "mcp"
- 便于统计和追踪

## 文件变更清单

### 代码文件
- ✅ `mcp/src/tools/env-setup.ts`
  - 移除 PolicyNames 参数
  - Channel 改为 "mcp"
  - Type 改为动态获取

### 文档文件
- ✅ `specs/env-setup-optimization/design.md` - 技术方案更新
- ✅ `specs/env-setup-optimization/tasks.md` - 任务描述更新
- ✅ `specs/env-setup-optimization/IMPLEMENTATION_SUMMARY.md` - 实施总结更新
- ✅ `specs/env-setup-optimization/CHANGELOG.md` - 新增变更日志

## 验证结果

- ✅ **TypeScript 编译**: 通过
- ✅ **代码格式化**: 已按项目规范调整
- ✅ **文档同步**: 所有文档已更新

## 配置总结

### 当前配置（最终版）

**InitTcb**:
```typescript
{
  Source: "qcloud",
  Channel: "mcp"
  // PolicyNames: 不传入
}
```

**CreateFreeEnvByActivity**:
```typescript
{
  Alias: "ai-native",
  Type: activityType,  // 动态获取
  CloseAutoPay: true,
  EnableExcess: "true",
  IsAutoRenew: "false",
  Source: "qcloud"
}
```

**DescribeUserPromotionalActivity**:
```typescript
{
  Names: ["NewUser", "ReturningUser", "BaasFree"]
}
```

## 向后兼容性

- ✅ 所有变更都是参数级别的调整
- ✅ 不影响现有的流程逻辑
- ✅ 不影响统计上报
- ✅ 不影响错误处理
- ✅ 不影响 CloudMode 兼容性

## 建议

1. **测试建议**:
   - 测试不同活动类型的环境创建
   - 验证 Type 字段的获取逻辑
   - 确认 Channel="mcp" 的统计数据正常

2. **监控建议**:
   - 关注 activityType 的实际取值
   - 监控不同活动类型的成功率
   - 收集 Type 字段的数据分布

3. **后续优化**:
   - 根据实际运行数据调整回退值
   - 优化活动类型的选择逻辑
   - 考虑支持多个活动类型的优先级








