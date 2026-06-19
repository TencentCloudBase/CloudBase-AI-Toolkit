# 技术方案设计

## 架构概述

将现有的 `storage.ts` 工具拆分为两个独立的工具，实现读写分离的设计模式：

1. **queryStorage** - 只读操作工具
2. **manageStorage** - 写操作工具

## 技术架构

### 工具结构设计

```
storage.ts (重构后)
├── queryStorage (只读操作)
│   ├── listDirectoryFiles - 列出目录文件
│   ├── getFileInfo - 获取文件信息
│   └── getTemporaryUrl - 获取临时链接
└── manageStorage (写操作)
    ├── uploadFile - 上传文件
    ├── uploadDirectory - 上传目录
    ├── downloadFile - 下载文件
    ├── downloadDirectory - 下载目录
    ├── deleteFile - 删除文件
    └── deleteDirectory - 删除目录
```

### 技术选型

- **框架**: 继续使用现有的 CloudBase Manager SDK
- **设计模式**: 参考 `cloudrun.ts` 的读写分离模式
- **错误处理**: 统一的错误处理和返回格式
- **类型安全**: 使用 Zod 进行输入参数验证

## 详细设计

### 1. queryStorage 工具

**功能**: 提供所有只读的文件查询操作
**输入参数**: 
- `action`: 操作类型（list, info, url）
- `cloudPath`: 云端文件路径
- `maxAge`: 临时链接有效期（可选）

**支持操作**:
- `list`: 列出目录下的所有文件
- `info`: 获取指定文件的详细信息
- `url`: 获取文件的临时下载链接

### 2. manageStorage 工具

**功能**: 提供所有文件管理操作
**输入参数**:
- `action`: 操作类型（upload, download, delete）
- `localPath`: 本地文件路径
- `cloudPath`: 云端文件路径
- `force`: 强制操作开关（删除操作需要）

**支持操作**:
- `upload`: 上传文件或目录
- `download`: 下载文件或目录
- `delete`: 删除文件或目录

## 数据库/接口设计

### CloudBase Storage API 映射

| 操作类型 | CloudBase API | 工具方法 |
|---------|---------------|----------|
| 列出文件 | `listDirectoryFiles()` | queryStorage.list |
| 文件信息 | `getFileInfo()` | queryStorage.info |
| 临时链接 | `getTemporaryUrl()` | queryStorage.url |
| 上传文件 | `uploadFile()` | manageStorage.upload |
| 上传目录 | `uploadDirectory()` | manageStorage.upload |
| 下载文件 | `downloadFile()` | manageStorage.download |
| 下载目录 | `downloadDirectory()` | manageStorage.download |
| 删除文件 | `deleteFile()` | manageStorage.delete |
| 删除目录 | `deleteDirectory()` | manageStorage.delete |

## 测试策略

### 单元测试
- 测试每个工具的参数验证
- 测试错误处理逻辑
- 测试返回格式一致性

### 集成测试
- 测试与 CloudBase Manager 的集成
- 测试各种文件操作场景
- 测试错误恢复机制

## 安全性考虑

### 删除操作安全
- 删除操作需要 `force` 参数确认
- 提供详细的删除文件列表预览
- 支持批量删除前的确认机制

### 路径安全
- 验证云端路径格式
- 防止路径遍历攻击
- 限制操作范围在指定环境内

## 性能优化

### 批量操作
- 支持批量文件删除
- 支持目录递归操作
- 优化大文件传输性能

### 进度反馈
- 上传/下载进度回调
- 长时间操作的进度显示
- 操作状态实时更新

## 兼容性

### 向后兼容
- 保持现有 `uploadFile` 功能不变
- 新增功能不影响现有使用方式
- 保持相同的返回格式

### 版本管理
- 工具版本号更新
- 功能变更日志记录
- 废弃功能标记
