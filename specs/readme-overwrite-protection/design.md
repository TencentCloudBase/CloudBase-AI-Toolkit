# 技术方案设计

## 架构概述

在现有的 `downloadTemplate` 工具基础上，增加对 README.md 文件的特殊保护逻辑，确保在下载 rules 模板时不会意外覆盖用户项目的重要文档。

## 技术栈

- TypeScript
- Node.js fs 模块
- 现有的 MCP 工具架构

## 技术选型

### 文件保护策略

采用**条件性跳过**策略：
- 对于 rules 模板，如果目标路径已存在 README.md 且 `overwrite=false`，则跳过该文件
- 对于其他模板，保持原有行为不变
- 当 `overwrite=true` 时，允许覆盖所有文件

### 实现方案

1. **修改 `copyFile` 函数**：增加对 README.md 文件的特殊处理逻辑
2. **增加文件类型判断**：区分 rules 模板和其他模板
3. **优化输出信息**：明确显示跳过的文件信息

## 数据库/接口设计

无需数据库变更，仅修改现有 MCP 工具的内部逻辑。

## 测试策略

1. **单元测试**：测试 `copyFile` 函数对 README.md 的保护逻辑
2. **集成测试**：测试完整的 `downloadTemplate` 工具流程
3. **场景测试**：
   - rules 模板 + 存在 README.md + overwrite=false
   - rules 模板 + 不存在 README.md
   - rules 模板 + overwrite=true
   - 其他模板 + 存在 README.md

## 安全性

- 保护用户项目的重要文档不被意外覆盖
- 保持向后兼容性，不影响现有功能
- 提供明确的用户反馈，避免混淆

## 实现细节

```typescript
// 在 copyFile 函数中增加特殊逻辑
function shouldSkipReadme(template: string, destPath: string, overwrite: boolean): boolean {
  const isReadme = path.basename(destPath).toLowerCase() === 'readme.md';
  const isRulesTemplate = template === 'rules';
  const exists = fs.existsSync(destPath);
  
  return isReadme && isRulesTemplate && exists && !overwrite;
}
``` 