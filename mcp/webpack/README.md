# Webpack 配置说明

## 概述

本项目采用模块化的 webpack 配置架构，将复杂的单文件配置拆分为多个独立的配置文件，实现配置的复用和维护性。

## 文件结构

```
webpack/
├── base.config.cjs          # 基础配置
├── minimal-externals.cjs    # 最小化外部依赖配置
├── node-modules.cjs         # Node.js 内置模块列表
├── problematic-deps.cjs     # 问题依赖列表
├── library.config.cjs       # 库文件配置
├── cli.config.cjs          # CLI 配置
├── index.cjs               # 主配置文件
└── README.md               # 本文件
```

## 配置说明

### 基础配置 (base.config.cjs)
包含所有构建目标共享的配置：
- TypeScript 编译配置
- 插件配置 (ForkTsCheckerWebpackPlugin, IgnorePlugin, DefinePlugin)
- 优化配置
- 解析配置

### 依赖管理配置

#### minimal-externals.cjs
最小化外部依赖配置，只排除真正无法打包的依赖：
- 使用 webpack-node-externals 进行智能外部依赖管理
- 不设置 allowlist，默认打包所有依赖
- 只排除 Node.js 内置模块和问题依赖

#### node-modules.cjs
Node.js 内置模块列表，这些模块保持外部化：
- 核心模块 (fs, path, os, crypto 等)
- 带 node: 前缀的模块

#### problematic-deps.cjs
真正无法打包的问题依赖列表：
- 大型框架和工具 (express, ws, electron 等)
- AWS SDK (体积过大，兼容性问题)
- Babel 相关 (体积过大，兼容性问题)
- 其他有问题的依赖

### 构建目标配置

#### library.config.cjs
库文件配置，生成 ESM 和 CJS 两种格式：
- ESM 版本：`dist/index.js`
- CJS 版本：`dist/index.cjs`

#### cli.config.cjs
CLI 配置，生成 ESM 和 CJS 两种格式：
- ESM 版本：`dist/cli.js` (带 shebang)
- CJS 版本：`dist/cli.cjs` (带 shebang)

### 主配置文件 (index.cjs)
合并所有构建目标的配置，导出为 webpack 配置数组。

## 构建输出

构建完成后会生成以下文件：
- `dist/index.js` - ESM 格式的库文件
- `dist/index.cjs` - CJS 格式的库文件
- `dist/cli.js` - ESM 格式的 CLI 文件
- `dist/cli.cjs` - CJS 格式的 CLI 文件
- `dist/index.d.ts` - TypeScript 类型定义
- `dist/cli.d.ts` - CLI TypeScript 类型定义

## 依赖打包策略

### 最大化打包原则
- 默认打包所有第三方依赖
- 只排除 Node.js 内置模块和真正有问题的依赖
- 使用递归依赖分析，最大化 bundle 覆盖率

### 排除策略
1. **Node.js 内置模块**: 保持外部化
2. **问题依赖**: 只排除存在严重兼容性问题的依赖
3. **Native 模块**: 忽略 fsevents 等平台特定模块

## 使用方式

### 作为库使用
```javascript
// ESM
import { CloudBaseMCP } from '@cloudbase/cloudbase-mcp';

// CJS
const { CloudBaseMCP } = require('@cloudbase/cloudbase-mcp');
```

### 作为 CLI 使用
```bash
# 使用 ESM 版本
node dist/cli.js

# 使用 CJS 版本
node dist/cli.cjs
```

## 开发说明

### 添加新的构建目标
1. 在对应的配置文件中添加新的配置
2. 在主配置文件中导入并添加到导出数组
3. 更新 package.json 中的构建脚本（如需要）

### 修改依赖打包策略
1. 更新 `problematic-deps.cjs` 中的问题依赖列表
2. 更新 `node-modules.cjs` 中的 Node.js 模块列表
3. 测试构建确保没有兼容性问题

### 性能优化
- 使用 `transpileOnly: true` 提高 TypeScript 编译速度
- 使用 `ForkTsCheckerWebpackPlugin` 进行类型检查
- 启用代码压缩减小文件体积 