# 技术方案设计

## 架构与实现
- 保持 getFunctionLogs 工具接口不变，底层实现替换为 getFunctionLogsV2。
- 工具描述、参数说明、返回结构同步更新，明确提示仅返回基础信息，详情需用 RequestId 查询。
- 如未注册 getFunctionLogDetail 工具，则补充注册。

## 技术选型
- 依赖 manger-node 4.4.0+，使用新版 getFunctionLogsV2 和 getFunctionLogDetail。

## 参数与返回结构
- getFunctionLogs：参数与新版接口一致，返回 LogList[]，不含日志详情。
- getFunctionLogDetail：参数为 startTime、endTime、requestId，返回日志详情（LogJson 等）。

## 兼容性
- 保持原有工具接口调用方式不变，便于无缝升级。
- 参数校验 offset+limit≤10000，startTime/endTime 间隔≤1天。

## 用户指引
- 工具描述中明确提示：如需日志详情请用 RequestId 调用 getFunctionLogDetail。 