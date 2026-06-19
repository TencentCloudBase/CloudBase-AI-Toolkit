# 技术方案设计

## 概述

在 `mcp/src/tools/hosting.ts` 中新增一个静态托管访问地址规范化函数，统一负责拼接 `staticDomain`、`cloudPath` 和目录/文件语义，避免目录 URL 缺少尾部 `/` 导致相对资源解析异常。

## 架构与改动点

- 工具入口：`mcp/src/tools/hosting.ts`
- 影响范围：`uploadFiles` 工具返回值中的 `accessUrl`，以及复用该字段的 CodeBuddy 部署通知
- 不改动 CloudBase 上传行为，仅修正展示和通知使用的访问地址

## 设计细节

### 1. 新增 URL 规范化辅助函数

新增内部辅助函数，输入：

- `staticDomain`
- `cloudPath`
- `localPath`
- `files`

输出：

- 标准化后的 HTTPS 访问地址

### 2. 目录与文件识别策略

按以下顺序判断访问目标是否应视为目录：

1. `localPath` 可读取且为目录
2. `cloudPath` 为空，视为根目录部署
3. `cloudPath` 以 `/` 结尾
4. `cloudPath` 不带文件扩展名，按目录路径处理

若判定为目录，则返回尾部带 `/` 的 URL；否则按文件 URL 返回。

### 3. 路径拼接策略

- 使用 POSIX 风格处理 URL path，避免 Windows 分隔符混入 URL
- 去除多余前导 `/`，避免出现双斜杠
- 根目录部署统一返回 `https://{staticDomain}/`

## 测试策略

- 运行 `mcp` 包构建，验证 TypeScript 编译通过
- 手工覆盖以下场景：
  - 根目录部署
  - 子目录部署
  - 单文件上传
  - 无法 `stat` 本地路径时的回退逻辑

## 安全性

- 仅调整返回 URL 的格式，不涉及鉴权、上传内容、环境信息和敏感字段处理

