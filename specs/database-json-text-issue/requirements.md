# 需求文档

## 介绍

当前数据库相关 tool（如 insertDocuments）部分参数采用了“json字符串”作为入参，导致 LLM 生成时容易出现格式错误，尤其是批量插入时。需将参数类型调整为直接 JSON 对象/数组，提升健壮性和易用性。

## 需求

### 需求 1 - Tool 入参类型调整

**用户故事：** 作为开发者，我希望数据库相关 tool 的嵌套 JSON 入参可以直接传递 JSON 对象/数组，而不是 JSON 字符串，以减少格式错误的概率。

#### 验收标准

1. While LLM 生成数据库 tool 入参时, when 传递嵌套 JSON 参数, the tool shall 支持直接传递 JSON 对象/数组，无需开发者手动序列化为字符串。
2. While tool handler 层接收到 JSON 对象/数组时, when 调用底层 SDK, the handler shall 自动完成序列化，无需调用方关心。
3. While 传递批量数据时, when insertDocuments 等 tool 被调用, the tool shall 能正确处理多个 JSON 对象组成的数组，无格式错误。
4. While 相关文档和注释更新后, when 用户查阅参数说明, the 文档 shall 明确参数类型和示例。
