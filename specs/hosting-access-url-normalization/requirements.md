# 需求文档

## 介绍

静态托管 `uploadFiles` 工具在返回部署访问地址和发送 IDE 部署通知时，当前会直接拼接 `https://{domain}/{cloudPath}`。当部署目标是目录而访问地址末尾未带 `/` 时，浏览器会将相对资源解析到错误位置，导致页面中的相对静态资源加载异常。

## 需求

### 需求 1 - 目录部署访问地址标准化

**用户故事：** 作为使用 CloudBase 静态托管部署 Web 项目的用户，我希望工具返回的目录访问地址自动带有尾部 `/`，这样我直接打开链接时，相对路径资源也能正确加载。

#### 验收标准

1. When `uploadFiles` 成功上传一个目录到静态托管时, the MCP 工具 shall 返回尾部带 `/` 的目录访问地址
2. When `uploadFiles` 成功上传到静态托管根目录时, the MCP 工具 shall 返回 `https://{staticDomain}/` 形式的访问地址
3. When `uploadFiles` 成功上传到子目录（例如 `vite-test`）时, the MCP 工具 shall 返回 `https://{staticDomain}/vite-test/` 形式的访问地址
4. When `uploadFiles` 成功上传单个文件时, the MCP 工具 shall 保持文件访问地址不额外追加 `/`

### 需求 2 - 部署通知地址一致性

**用户故事：** 作为在 IDE 中接收部署通知的用户，我希望通知里的访问地址和工具返回值一致，避免点击通知后因 URL 末尾缺少 `/` 而出现资源加载异常。

#### 验收标准

1. When `uploadFiles` 生成部署通知时, the MCP 工具 shall 使用与返回结果一致的标准化访问地址
2. When 目录访问地址需要补尾部 `/` 时, the MCP 工具 shall 同时在通知数据和工具返回值中使用补全后的地址

