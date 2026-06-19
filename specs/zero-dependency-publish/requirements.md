# 需求文档

## 介绍

优化 `@cloudbase/cloudbase-mcp` 和 `@cloudbase/cli` 两个 npm 包的发布体验，通过移除发布包中的 dependencies，实现零依赖发布，解决安装慢、容易失败的问题，特别是通过 npx 安装时的体验问题。

## 背景

### 问题现状

当前 `@cloudbase/cloudbase-mcp` 和 `@cloudbase/cli` 两个包虽然已经通过 webpack 将所有依赖 bundle 到 dist 目录中，但 package.json 中仍然保留了完整的 dependencies 列表。这导致了严重的用户体验问题：

#### 1. 安装性能问题

**问题表现：**
- `npm install` 时需要下载和安装所有依赖包（@cloudbase/cloudbase-mcp 有 18 个依赖，@cloudbase/cli 有 40+ 个依赖）
- 即使 dist 目录已经包含了所有 bundle 后的代码，npm 仍会执行完整的依赖安装流程
- 安装时间从几秒增加到几十秒甚至几分钟

**根本原因：**
npm 的安装机制会检查 package.json 中的 dependencies，即使这些依赖已经被 bundle 到代码中，npm 仍然会：
1. 解析依赖树
2. 下载所有依赖包
3. 安装到 node_modules
4. 执行依赖的安装脚本（postinstall 等）

#### 2. npx 体验问题

**问题表现：**
- 使用 `npx @cloudbase/cloudbase-mcp` 时，每次执行都需要先安装依赖
- 网络不稳定时经常失败，错误信息不友好
- 用户需要等待漫长的安装过程才能使用工具

**推导过程：**
```
npx 执行流程：
1. 检查本地缓存 → 未找到
2. 下载包到临时目录
3. 读取 package.json，发现 dependencies
4. 执行 npm install --production（安装生产依赖）
5. 运行 bin 命令
```

由于步骤 4 的存在，即使 bundle 文件已经包含了所有代码，npx 仍然会尝试安装依赖，导致：
- 延迟：每次执行都需要等待依赖安装完成
- 失败率：网络问题、依赖版本冲突等导致安装失败
- 用户体验差：用户看到的是"正在安装依赖"而不是"正在运行工具"

#### 3. 依赖冲突风险

**问题表现：**
- 当用户项目中已安装某些依赖的不同版本时，可能出现版本冲突
- 即使 bundle 文件不依赖这些包，npm 仍会尝试安装，导致冲突

**推导过程：**
```
用户项目依赖：
  - express@4.x
  
cloudbase-mcp package.json：
  - express@5.x
  
结果：
  npm 尝试安装 express@5.x
  → 与用户项目的 express@4.x 冲突
  → 安装失败或产生版本冲突警告
```

但实际上，bundle 文件已经包含了 express@5.x 的代码，不需要在用户项目中安装。

#### 4. 包体积和存储问题

**问题表现：**
- 虽然 dist 目录已经 bundle 了所有代码，但 npm 仍会下载完整的 node_modules
- 临时目录占用大量磁盘空间
- CI/CD 环境中缓存占用增加

### 解决方案推导

#### 方案对比

**方案 A：保留 dependencies（当前方案）**
- ✅ 符合 npm 传统实践
- ✅ 便于安全审计（npm audit）
- ❌ 安装慢
- ❌ npx 体验差
- ❌ 容易失败

**方案 B：移除 dependencies（目标方案）**
- ✅ 安装快（无需安装依赖）
- ✅ npx 体验好（直接运行）
- ✅ 零依赖冲突
- ✅ 包体积小
- ⚠️ 需要确保 bundle 完整性
- ⚠️ 需要自动化测试验证

#### 技术可行性分析

**前提条件验证：**
1. ✅ **Bundle 完整性**：webpack 配置已经将所有运行时依赖打包到 dist 中
2. ✅ **功能验证**：`@cloudbase/cloudbase-mcp` 已有自动化测试验证 bundle 文件质量（`tests/npx-simulate.test.js`）
3. ✅ **实践验证**：CodeBuddy 等 AI IDE 中内置的 MCP 服务器均采用零依赖方式
4. ✅ **参考案例**：`@anthropic-ai/claude-code` 等优秀实践证明零依赖方案可行

**风险分析：**
- **风险 1**：Bundle 不完整导致运行时错误
  - **缓解措施**：建立自动化测试，在发布前验证 bundle 完整性
- **风险 2**：某些依赖无法 bundle（如 native 模块）
  - **缓解措施**：webpack 配置已处理，使用 externals 排除问题依赖
- **风险 3**：安全审计困难
  - **缓解措施**：在开发环境保留完整依赖列表，仅发布时移除

### 参考实践

#### 1. @anthropic-ai/claude-code
- **特点**：完全零依赖，所有代码 bundle 在 vendor/ 和 cli.js 中
- **package.json**：仅包含基本信息，无 dependencies 字段
- **效果**：安装速度快，npx 体验优秀
- **参考链接**：https://www.npmjs.com/package/@anthropic-ai/claude-code

#### 2. @tencent-ai/codebuddy-code
- **特点**：完全零依赖，所有代码已 bundle
- **package.json**：dependencies 为空对象 `{}`
- **效果**：作为 CodeBuddy AI IDE 的内置包，安装和启动速度极快
- **参考链接**：https://www.npmjs.com/package/@tencent-ai/codebuddy-code?activeTab=dependencies
- **意义**：这是腾讯 AI 团队的实践，证明了零依赖方案在大型 CLI 工具中的可行性

#### 3. cli-cursor
- **特点**：最小化依赖，只有一个轻量级依赖 `restore-cursor`
- **package.json**：仅包含必要的依赖
- **效果**：作为 CLI 工具库，安装快速
- **参考链接**：https://www.npmjs.com/package/cli-cursor?activeTab=dependencies
- **意义**：展示了 CLI 工具的最佳实践，尽可能减少依赖

#### 4. CodeBuddy 内置 MCP 服务器
- **特点**：所有 MCP 服务器均采用零依赖 bundle 方式
- **效果**：启动快，无需安装依赖，用户体验流畅
- **意义**：在实际生产环境中验证了零依赖方案的可行性

#### 5. @cloudbase/cloudbase-mcp 现有测试
- **测试文件**：`tests/npx-simulate.test.js`
- **测试内容**：
  - 模拟 npx 环境（npm pack + 解包 + 零依赖安装）
  - 验证 CLI 启动
  - 验证 MCP 连接
  - 验证工具调用功能
  - 验证环境信息查询功能
- **效果**：确保 bundle 文件在零依赖环境下正常工作
- **意义**：提供了完整的测试方案参考

## 需求

### 需求 1 - 发布时移除 dependencies

**用户故事：** 作为包维护者，我希望在发布 npm 包时自动移除 package.json 中的 dependencies，使发布的包不包含任何依赖声明。

#### 验收标准

1. When 执行 `npm publish` 时，the 系统 shall 在发布前自动备份并清空 package.json 中的 dependencies
2. When 发布完成后，the 系统 shall 自动恢复原始的 dependencies
3. When 发布的包被安装时，the 系统 shall 不安装任何 dependencies（因为 package.json 中没有声明）
4. When 本地开发时，the 系统 shall 保持完整的 dependencies 列表

### 需求 2 - Bundle 质量自动化测试

**用户故事：** 作为开发者，我希望通过自动化测试确保所有依赖都已正确 bundle 到 dist 中，移除 dependencies 后功能仍然正常。

#### 验收标准

1. When 构建完成后，the 系统 shall 验证所有运行时依赖都已包含在 bundle 中
2. When 移除 dependencies 后，the 系统 shall 能够正常运行所有功能
3. When 通过 npx 安装时，the 系统 shall 能够正常执行 CLI 命令
4. When 作为库导入时，the 系统 shall 能够正常提供所有 API

#### 测试要求

**@cloudbase/cloudbase-mcp（已有测试）：**
- ✅ 已有 `tests/npx-simulate.test.js` 测试文件
- ✅ 测试内容：
  - 模拟 npx 环境（npm pack + 解包 + 零依赖安装）
  - 验证 CLI 启动和基础功能
  - 验证 MCP 服务器连接
  - 验证工具调用功能
  - 验证环境信息查询功能
- ✅ 测试覆盖：确保 bundle 文件在零依赖环境下正常工作

**@cloudbase/cli（需要新增测试）：**
- ⚠️ 需要建立类似的自动化测试
- ⚠️ 测试内容应包括：
  - 模拟 npx 环境测试
  - 验证 CLI 命令执行（如 `tcb --help`、`tcb login` 等）
  - 验证核心功能模块（如云函数、数据库、存储等）
  - 验证在零依赖环境下的完整功能
- ⚠️ 测试应集成到 CI/CD 流程中，在发布前自动执行

#### 测试策略

1. **零依赖环境模拟**：
   - 使用 `npm pack` 打包
   - 解包到临时目录
   - 不安装任何 dependencies（或安装空的 dependencies）
   - 直接运行 bundle 文件

2. **功能完整性验证**：
   - CLI 启动测试
   - 核心功能模块测试
   - API 调用测试
   - 错误处理测试

3. **集成测试**：
   - 模拟真实使用场景
   - 验证与外部服务的交互
   - 验证配置和认证流程

4. **参考实现**：
   - 参考 `@cloudbase/cloudbase-mcp` 的 `tests/npx-simulate.test.js`
   - 参考 CodeBuddy 中内置 MCP 服务器的测试方式

### 需求 3 - 发布脚本自动化

**用户故事：** 作为开发者，我希望发布流程完全自动化，无需手动操作 package.json。

#### 验收标准

1. When 执行 `npm publish` 时，the 系统 shall 自动执行发布前准备脚本
2. When 发布完成后，the 系统 shall 自动执行恢复脚本
3. When 发布过程中出现错误时，the 系统 shall 自动恢复 package.json 到原始状态
4. When 查看 git 状态时，the 系统 shall 不显示 package.json 的修改（因为已自动恢复）

### 需求 4 - 兼容现有构建流程

**用户故事：** 作为维护者，我希望新的发布流程不影响现有的构建和测试流程。

#### 验收标准

1. When 执行 `npm run build` 时，the 系统 shall 正常工作，不受发布脚本影响
2. When 执行 `npm test` 时，the 系统 shall 正常工作，使用完整的 dependencies
3. When 执行 `npm install` 时，the 系统 shall 安装所有开发依赖
4. When CI/CD 流程运行时，the 系统 shall 不受影响

### 需求 5 - 文档更新

**用户故事：** 作为用户，我希望了解包的使用方式，知道不需要安装任何依赖。

#### 验收标准

1. When 查看 README 时，the 系统 shall 说明包已完全 bundle，无需安装依赖
2. When 查看 package.json 时，the 系统 shall 显示空的 dependencies（在发布的包中）
3. When 通过 npx 使用时，the 系统 shall 能够快速安装和执行

## 技术约束

1. 必须保持与现有 webpack 构建流程的兼容性
2. 发布脚本必须支持错误恢复机制
3. 不能影响本地开发和测试环境
4. 必须支持两个包：`@cloudbase/cloudbase-mcp` 和 `@cloudbase/cli`

## 依赖分析

### @cloudbase/cloudbase-mcp
当前 dependencies 数量：18 个
- @cloudbase/cals
- @cloudbase/functions-framework
- @cloudbase/manager-node
- @cloudbase/mcp
- @cloudbase/toolbox
- @modelcontextprotocol/sdk
- 以及其他 12 个依赖

### @cloudbase/cli
当前 dependencies 数量：40+ 个
- @cloudbase/cloud-api
- @cloudbase/cloudbase-mcp
- @cloudbase/framework-core
- @cloudbase/functions-framework
- @cloudbase/iac-core
- @cloudbase/lowcode-cli
- @cloudbase/manager-node
- @cloudbase/toolbox
- 以及其他 30+ 个依赖

## 参考案例

- `@anthropic-ai/claude-code`：完全零依赖，所有代码 bundle 在 vendor/ 和 cli.js 中
- package.json 仅包含基本信息，无 dependencies 字段
- 安装速度快，npx 体验优秀

