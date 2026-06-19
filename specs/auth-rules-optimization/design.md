# 技术方案设计

## 架构概述

本次优化主要针对 CloudBase AI Toolkit 的规则文件进行更新，确保 AI 开发工具在处理登录认证需求时能够正确使用 CloudBase SDK 的内置功能，避免错误地使用云函数实现认证逻辑。

## 技术栈

- **规则文件格式**: Markdown (.mdc)
- **规则文件位置**: `config/rules/`
- **主要文件**: 
  - `web-development.mdc` - Web 开发规则
  - `miniprogram-development.mdc` - 小程序开发规则
  - `cloudbase-platform.mdc` - 云开发平台规则

## 技术选型

### Web 端认证方式
- **主要方法**: `auth.toDefaultLoginPage()` - 跳转到默认登录页面
- **匿名登录**: `auth.signInAnonymously()` - 匿名用户登录
- **自定义登录**: `auth.signInWithRedirect()` / `auth.signInWithPopup()` - 自定义登录页面
- **状态管理**: `auth.getLoginState()` / `auth.getCurrentUser()` - 获取登录状态和用户信息

### 小程序端认证方式
- **免登录特性**: 小程序云开发天然免登录
- **用户标识**: 通过 `wxContext.OPENID` 在云函数中获取用户 openid
- **用户管理**: 基于 openid 在云函数中进行用户数据管理

## 数据库/接口设计

### Web 端用户数据管理
```javascript
// 用户数据存储示例
const userCollection = db.collection('users');

// 创建用户记录
await userCollection.add({
  data: {
    uid: user.uid,
    email: user.email,
    nickname: user.nickName,
    avatar: user.avatarUrl,
    createTime: new Date()
  }
});
```

### 小程序端用户数据管理
```javascript
// 云函数中基于 openid 管理用户数据
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  
  // 基于 openid 查询或创建用户记录
  const userRecord = await db.collection('users').where({
    openid: openid
  }).get();
};
```

## 测试策略

1. **规则文件语法检查**: 确保 .mdc 文件格式正确
2. **内容完整性验证**: 确保认证相关规则完整且准确
3. **示例代码验证**: 确保提供的代码示例能够正常运行
4. **跨平台兼容性**: 确保 Web 和小程序规则不互相干扰

## 安全性

1. **认证方式隔离**: 明确区分 Web 端和小程序端的认证方式
2. **权限控制**: 强调数据库权限配置的重要性
3. **错误处理**: 在示例代码中包含完整的错误处理逻辑
4. **最佳实践**: 遵循 CloudBase 官方推荐的安全实践

## 实施计划

### 阶段一：规则文件更新
1. 更新 `web-development.mdc` 文件，强化 SDK 内置认证功能的使用
2. 更新 `miniprogram-development.mdc` 文件，明确免登录特性和 openid 使用方式
3. 更新 `cloudbase-platform.mdc` 文件，添加认证相关的最佳实践

### 阶段二：示例代码优化
1. 提供完整的 Web 端登录认证示例代码
2. 提供完整的小程序端用户管理示例代码
3. 添加详细的注释和说明

### 阶段三：验证和测试
1. 验证规则文件的语法和格式
2. 测试示例代码的可用性
3. 确保规则文件之间的协调性

## 风险评估

1. **规则冲突风险**: 不同规则文件之间可能存在冲突
   - 缓解措施: 明确规则适用范围，避免交叉引用
2. **代码示例过时风险**: SDK 版本更新可能导致示例代码过时
   - 缓解措施: 使用最新版本的 SDK，定期更新示例代码
3. **用户理解偏差风险**: 用户可能误解不同平台的认证方式
   - 缓解措施: 提供清晰的说明和对比，强调平台差异 