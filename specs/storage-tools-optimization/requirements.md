# 需求文档

## 介绍

优化 CloudBase MCP 工具中的 storage.ts，将其拆分为读写分离的两个工具，并增加删除文件功能，提升对象存储管理的完整性和易用性。

## 需求

### 需求 1 - 工具读写分离

**用户故事：** 作为开发者，我希望 storage 工具能够按照读写操作进行清晰分离，便于理解和使用。

#### 验收标准

1. When 使用 storage 工具时，the 系统 shall 提供两个独立的工具：queryStorage（只读操作）和 manageStorage（写操作）
2. While 执行查询操作时，the queryStorage 工具 shall 支持列出文件、获取文件信息、获取临时链接等只读功能
3. While 执行管理操作时，the manageStorage 工具 shall 支持上传文件、删除文件、下载文件等写操作功能

### 需求 2 - 增加删除文件功能

**用户故事：** 作为开发者，我希望能够删除对象存储中的文件，以便管理存储空间。

#### 验收标准

1. When 需要删除文件时，the manageStorage 工具 shall 支持 deleteFile 操作，能够批量删除指定路径的文件
2. When 需要删除文件夹时，the manageStorage 工具 shall 支持 deleteDirectory 操作，能够删除指定路径的文件夹及其内容
3. While 执行删除操作时，the 系统 shall 提供确认机制，防止误删除重要文件

### 需求 3 - 完整的文件管理功能

**用户故事：** 作为开发者，我希望拥有完整的文件管理功能，包括上传、下载、列表、删除等操作。

#### 验收标准

1. While 使用 queryStorage 工具时，the 系统 shall 支持 listDirectoryFiles、getFileInfo、getTemporaryUrl 等查询功能
2. While 使用 manageStorage 工具时，the 系统 shall 支持 uploadFile、uploadDirectory、downloadFile、downloadDirectory、deleteFile、deleteDirectory 等管理功能
3. When 执行文件操作时，the 系统 shall 提供详细的进度反馈和错误处理

### 需求 4 - 参考现有设计模式

**用户故事：** 作为开发者，我希望新的 storage 工具能够保持与现有工具一致的设计风格和代码结构。

#### 验收标准

1. While 设计新的 storage 工具时，the 代码结构 shall 参考 cloudrun.ts 的读写分离模式
2. When 实现工具功能时，the 错误处理和返回格式 shall 与现有工具保持一致
3. While 注册工具时，the 工具分类和注解 shall 遵循现有的命名规范
