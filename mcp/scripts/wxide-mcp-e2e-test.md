# 微信 IDE CloudBase MCP 端到端验收测试

> 执行前提：已通过 MCP Inspector 启动本地 MCP server（使用 test-with-ticket.cjs）
> 本次测试目标环境：cloud1-5g39elugeec5ba0f

请按顺序完成以下所有测试任务，每步完成后输出「✅ PASS」或「❌ FAIL: <原因>」，最终汇总结果。

---

## 第一组：环境查询

**T01** 调用 `queryEnv(action="list")`，列出当前环境列表，确认 `cloud1-5g39elugeec5ba0f` 在其中，输出其 Status、Region、PackageName。

**T02** 调用 `queryEnv(action="info", envId="cloud1-5g39elugeec5ba0f")`，获取环境详情，确认返回了资源信息（Storages/Functions/Databases 字段存在）。

---

## 第二组：云函数

**T03** 调用 `queryFunctions(action="listFunctions")`，列出所有云函数，输出函数名列表。

**T04** 取 T03 中任意一个函数名（假设叫 `mcp_test_fn`，如果没有先记录实际名字），调用 `queryFunctions(action="getFunctionDetail", functionName="<实际函数名>")`，确认返回了 Runtime、MemorySize、Timeout。

**T05（微信云调用）** 调用 `manageFunctions(action="updateFunctionConfig", functionName="<实际函数名>", func={"Role": "TCB_QcsRole", "VpcConfig": {}})`，模拟更新函数配置，确认返回成功。

**T06（定时触发器）** 调用 `manageFunctions(action="createFunctionTriggers", functionName="<实际函数名>", triggers=[{"TriggerName": "mcp_test_timer", "Type": "timer", "TriggerDesc": "0 0 * * * * *"}])`，创建一个每小时整点触发的定时器，确认成功。

**T07** 调用 `queryFunctions(action="listFunctionTriggers", functionName="<实际函数名>")`，确认 T06 创建的触发器 `mcp_test_timer` 出现在列表中。

**T08** 调用 `manageFunctions(action="deleteFunctionTriggers", functionName="<实际函数名>", triggerNames=["mcp_test_timer"])`，删除刚才的触发器，确认成功。

**T09（调用函数）** 调用 `manageFunctions(action="invokeFunction", functionName="<实际函数名>", params={"source": "mcp_e2e_test"})`，触发函数执行，确认返回了 RequestId 或函数响应体。

---

## 第三组：数据库

**T10** 调用 `readNoSqlDatabaseStructure(action="listCollections")`，列出所有集合。

**T11** 调用 `writeNoSqlDatabaseStructure(action="createCollection", collectionName="mcp_e2e_test_col")`，创建测试集合，确认成功。

**T12** 调用 `writeNoSqlDatabaseContent(action="insertDocuments", collectionName="mcp_e2e_test_col", documents=[{"name": "test_item_1", "value": 42, "tags": ["mcp", "e2e"]}, {"name": "test_item_2", "value": 99, "tags": ["mcp"]}])`，插入两条测试数据。

> ⚠️ 注意：服务端写入不含 _openid，如集合有行级安全规则需手动补充。

**T13** 调用 `readNoSqlDatabaseContent(collectionName="mcp_e2e_test_col", query={"tags": {"$in": ["e2e"]}})`，查询包含 "e2e" tag 的文档，确认返回 test_item_1。

**T14** 调用 `writeNoSqlDatabaseContent(action="updateDocuments", collectionName="mcp_e2e_test_col", query={"name": "test_item_1"}, update={"$set": {"value": 100, "updated": true}})`，更新 test_item_1 的 value 为 100，确认成功。

**T15** 调用 `writeNoSqlDatabaseContent(action="deleteDocuments", collectionName="mcp_e2e_test_col", query={"name": "test_item_2"})`，删除 test_item_2，确认成功。

**T16** 调用 `readNoSqlDatabaseContent(collectionName="mcp_e2e_test_col")`，确认只剩 1 条记录（test_item_1，value=100）。

---

## 第四组：存储

**T17** 调用 `queryStorage(action="listFiles", prefix="")`，列出存储根目录文件列表。

**T18** 调用 `manageStorage(action="uploadFile", cloudPath="mcp-e2e-test/hello.txt", fileContent="hello from mcp e2e test")`，上传一个测试文件。

**T19** 调用 `queryStorage(action="getFileInfo", cloudPath="mcp-e2e-test/hello.txt")`，确认文件存在，返回了 Size 或 ETag。

**T20** 调用 `manageStorage(action="deleteFiles", cloudPaths=["mcp-e2e-test/hello.txt"])`，删除测试文件，确认成功。

---

## 第五组：权限

**T21** 调用 `queryPermissions(action="getDatabasePermissions", collectionName="mcp_e2e_test_col")`，查询测试集合的安全规则，输出当前规则内容。

**T22** 调用 `managePermissions(action="modifyDatabasePermissions", collectionName="mcp_e2e_test_col", permissions="readonly")`，将测试集合改为只读权限，确认成功。

**T23** 调用 `queryPermissions(action="getDatabasePermissions", collectionName="mcp_e2e_test_col")`，确认权限已变更为 readonly。

---

## 第六组：日志

**T24** 调用 `queryLogs(action="checkLogService")`，确认日志服务已开通（返回 Status=NORMAL 或类似字段）。

**T25** 调用 `queryLogs(action="searchLogs", keyword="mcp_e2e_test", startTime=<当前时间前1小时>, endTime=<当前时间>)`，搜索最近日志，确认接口正常返回（可能无结果，但不报错即 PASS）。

---

## 清理（测试完成后执行）

请在验收通过后，执行以下清理 prompt：

```
请清理本次 MCP 端到端测试产生的所有测试数据：

1. 删除数据库集合 mcp_e2e_test_col（调用 writeNoSqlDatabaseStructure(action="deleteCollection", collectionName="mcp_e2e_test_col")）
2. 确认存储文件 mcp-e2e-test/hello.txt 已删除（T20 已执行则跳过）
3. 确认触发器 mcp_test_timer 已删除（T08 已执行则跳过）

清理完成后输出汇总报告。
```

---

## 验收标准

- T01~T25 全部 PASS → 集成验收通过
- 任何 FAIL → 记录工具名、入参、错误信息，提交 issue
