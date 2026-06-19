# 需求文档

## 介绍

将云函数日志获取方法升级为新版 getFunctionLogsV2，日志详情需通过 getFunctionLogDetail 单独查询，兼容 manger-node 4.4.0+。接口描述需明确告知用户：此接口只返回日志基础信息（LogList），如需日志详情请用 RequestId 调用 getFunctionLogDetail 工具。

## 需求

### 需求 1 - 升级云函数日志获取接口

**用户故事：** 作为开发者，我希望通过新版接口获取云函数日志，并能按需查询日志详情，以便更好地排查和分析云函数运行情况。

#### 验收标准

1. When 用户调用云函数日志查询工具时，系统应使用 getFunctionLogsV2 返回日志基础信息（含 RequestId），并在工具描述中明确提示详情需用 RequestId 查询。
2. When 用户需要查看具体日志内容时，系统应支持通过 RequestId 查询日志详情（getFunctionLogDetail）。
3. When 查询参数不合法或超出范围时，系统应返回明确的错误提示。 