import { defineModule } from "../types.js";

export const databaseNoSQL = defineModule(
  {
    "readStructure.title": "读取 CloudBase NoSQL 数据库结构",
    "readStructure.description":
      "读取 CloudBase NoSQL 数据库集合与索引结构，支持列出集合、查看集合详情、列出索引以及检查索引是否存在。本工具为服务端管理工具，用于管理端查询数据库结构，不用于编写客户端代码。",
    "schema.readStructure.action": `listCollections: 列出集合列表
describeCollection: 描述集合详情（会返回索引摘要）
checkCollection: 检查集合是否存在
listIndexes: 列出指定集合的索引列表
checkIndex: 检查指定索引是否存在`,
    "schema.readStructure.limit": "返回数量限制(listCollections 操作时可选)",
    "schema.readStructure.offset": "偏移量(listCollections 操作时可选)",
    "schema.readStructure.collectionName": "集合名称(describeCollection、listIndexes、checkIndex 操作时必填)",
    "schema.readStructure.indexName": "索引名称(checkIndex 操作时必填)",
    "readStructure.listed": "获取 NoSQL 数据库集合列表成功",
    "readStructure.collectionRequiredCheck": "检查集合时必须提供 collectionName",
    "readStructure.collectionRequiredDescribe": "查看集合详情时必须提供 collectionName",
    "readStructure.collectionRequiredIndexes": "获取索引列表时必须提供 collectionName",
    "readStructure.indexRequired": "检查索引时必须提供 collectionName 和 indexName",
    "readStructure.collectionExists": "云开发数据库集合已存在",
    "readStructure.collectionNotExists": "云开发数据库集合不存在",
    "readStructure.described": "获取云开发数据库集合信息成功",
    "readStructure.indexesListed": "获取索引列表成功",
    "readStructure.indexExists": "索引已存在",
    "readStructure.indexNotExists": "索引不存在",
    "writeStructure.title": "创建并管理 CloudBase NoSQL 数据库集合",
    "writeStructure.description":
      "创建、删除和管理 CloudBase NoSQL 数据库集合（collection）。支持创建新集合、删除现有集合，以及通过 updateCollection 的 updateOptions.CreateIndexes / updateOptions.DropIndexes 添加索引和删除索引。当需要新建集合时，使用 action=createCollection。本工具为服务端管理工具，用于管理端操作集合和索引结构，不用于编写客户端代码。",
    "schema.writeStructure.action": `createCollection: 创建集合
updateCollection: 更新集合配置；添加索引请传 updateOptions.CreateIndexes，删除索引请传 updateOptions.DropIndexes
deleteCollection: 删除集合`,
    "schema.writeStructure.collectionName": "集合名称",
    "schema.writeStructure.createIndex.name": "要创建的索引名称",
    "schema.writeStructure.createIndex.unique": "是否唯一索引",
    "schema.writeStructure.createIndex.fieldName": "索引字段名",
    "schema.writeStructure.createIndex.direction": "索引方向，通常 1 表示升序，-1 表示降序",
    "schema.writeStructure.createIndex.fields": "索引字段列表，支持单字段或复合索引",
    "schema.writeStructure.createIndex.keySchema": "待创建索引的字段与约束配置",
    "schema.writeStructure.createIndexes": "要添加的索引列表",
    "schema.writeStructure.dropIndex.name": "要删除的索引名称",
    "schema.writeStructure.dropIndexes": "要删除的索引列表",
    "schema.writeStructure.updateOptions": "更新选项(updateCollection 时使用)。CreateIndexes 用于添加索引，DropIndexes 用于删除索引。",
    "writeStructure.alreadyExists": "集合已存在，无需重复创建",
    "writeStructure.created": "云开发数据库集合创建成功",
    "writeStructure.optionsRequired": "更新集合时必须提供 options",
    "writeStructure.updated": "云开发数据库集合更新成功",
    "writeStructure.notExists": "集合不存在",
    "writeStructure.deleted": "云开发数据库集合删除成功",
    "writeStructure.deleteInvalidParam":
      "deleteCollection 参数校验失败，请确认 collectionName 合法且已存在。当前 collectionName=\"{collectionName}\"。原始错误：{message}",
    "readContent.title": "查询并获取 CloudBase NoSQL 数据库数据记录",
    "readContent.description":
      "查询 CloudBase NoSQL 数据库中的数据记录。支持按条件筛选、分页、排序，适用于管理端数据查询与运维。limit 默认 100、最大 1000；超出请用 offset 分页。projection 仅支持 { field: 1|0 } 对象（示例 {\"_id\":1,\"name\":1,\"createdAt\":1}），不要传字段数组。",
    "schema.readContent.collectionName": "集合名称",
    "schema.readContent.instanceId": "可选：显式指定数据库实例ID；未传时会自动解析并缓存",
    "schema.readContent.query": "查询条件(对象或字符串,推荐对象)",
    "schema.readContent.projection": "返回字段投影，仅支持对象或对应 JSON 字符串，值只能是 1/0/true/false。合法示例：{\"_id\":1,\"name\":1,\"createdAt\":1}（包含）或 {\"password\":0}（排除）。不要传 [\"name\",\"age\"] 这类字段数组，也不要混用包含与排除（_id 除外）。",
    "schema.readContent.sort.key": "sort 字段名",
    "schema.readContent.sort.direction": "排序方向,1:升序,-1:降序",
    "schema.readContent.sort": "排序条件，仅支持数组 [{\"key\":\"createdAt\",\"direction\":-1}] 或对应 JSON 字符串。",
    "schema.readContent.limit": "返回数量限制，整数，范围 1-1000，默认 100。超过 1000 会被 Cloud API MgoLimit lte 校验拒绝；请用 offset 分页。",
    "schema.readContent.offset": "跳过的记录数",
    "readContent.success": "文档查询成功",
    "writeContent.title": "修改 CloudBase NoSQL 数据库数据记录",
    "writeContent.description":
      "修改 CloudBase NoSQL 数据库中的数据记录。支持插入、更新（含 $set/$inc/$push 等操作符）、删除、upsert 等操作，适用于管理端数据写入与运维。⚠️ 服务端写入不含 _openid：若集合依赖客户端 SDK（@cloudbase/js-sdk 或微信小程序 wx.cloud.database()）的行级安全规则（如 doc._openid == auth.openid），服务端写入时需手动补充 _openid 字段，否则客户端将无法读取到该数据。⚠️ 部分更新嵌套字段须使用点号路径，如 `$set: {\"shipping.city\": \"guangzhou\"}`，直接传嵌套对象会覆盖整个字段。",
    "schema.writeContent.action": "insert: 插入数据（新增文档）\nupdate: 更新数据\ndelete: 删除数据",
    "schema.writeContent.collectionName": "集合名称",
    "schema.writeContent.instanceId": "可选：显式指定数据库实例ID；未传时会自动解析并缓存",
    "schema.writeContent.documents": "要插入的文档对象数组,每个文档都是对象(insert 操作必填)",
    "schema.writeContent.query": "查询条件(对象或字符串,推荐对象)(update/delete 操作必填)",
    "schema.writeContent.update": `更新内容(对象或字符串,推荐对象)(update 操作必填)。按 MongoDB 更新语义传入 MgoUpdate：部分更新请使用 \`$set\`、\`$inc\`、\`$unset\`、\`$push\` 等操作符，例如使用 \`$set\` 更新 \`status\`；不要直接传"字段到值的普通对象"，否则可能替换整条文档。

⚠️ 嵌套字段必须用点号路径（如 \`shipping.city\`），禁止整对象替换：
- ❌ 错误：{ "$set": { "shipping": { "city": "guangzhou" } } } — shipping 被整块替换，原有 address/province 等字段全部丢失
- ✅ 正确：{ "$set": { "shipping.city": "guangzhou" } } — 仅更新 city，shipping 下其他字段保留`,
    "schema.writeContent.isMulti": "是否更新多条记录(update/delete 操作可选)",
    "schema.writeContent.upsert": "是否在不存在时插入(update 操作可选)",
    "writeContent.documentsRequired": "insert 操作时必须提供 documents",
    "writeContent.queryRequiredUpdate": "update 操作时必须提供 query",
    "writeContent.updateRequired": "update 操作时必须提供 update",
    "writeContent.queryRequiredDelete": "delete 操作时必须提供 query",
    "writeContent.inserted": "文档插入成功",
    "writeContent.updated": "文档更新成功",
    "writeContent.updatedWithWarning": "文档更新成功；{warning}",
    "writeContent.deleted": "文档删除成功",
    "writeContent.authLinkedDocWarning":
      "若前端会用 doc(uid) 读取该集合，请改为直接创建 `_id = uid` 的文档；基于 uid 查询再 upsert 往往会生成不同的 `_id`，导致后续 doc(uid) 读取失败。",
    "sort.directionInvalid": "非法 sort direction: {value}，仅支持 1 / -1",
    "sort.itemInvalid": "sort 数组项必须是 { key, direction } 对象",
    "sort.keyRequired": "sort.key 必须是非空字符串",
    "sort.jsonRequired": "sort 必须是 sort 数组的 JSON 字符串",
    "sort.arrayInvalid":
      "sort 仅支持数组 [{\"key\":\"createdAt\",\"direction\":-1}] 或对应 JSON 字符串",
    "projection.guidance":
      "projection 必须是字段投影对象（或对应 JSON 字符串），值只能是 1/0/true/false。合法示例：{example}（只返回这些字段），或 {excludeExample}（排除字段）。不要传字段名数组、逗号分隔字符串、查询条件，也不要在同一投影里混用包含(1/true)与排除(0/false)（_id 除外）。",
    "projection.invalidJson": "projection 必须是合法 JSON 对象字符串。{guidance}",
    "projection.arrayUnsupported":
      "projection 不支持字段名数组。请改为对象，例如 {example}。{guidance}",
    "projection.objectRequired": "projection 必须是对象。请改为例如 {example}。{guidance}",
    "projection.keyRequired": "projection 字段名必须是非空字符串。{guidance}",
    "projection.invalidFlag":
      "projection[\"{key}\"] 的值非法（当前为 {value}），仅支持 1/0/true/false。合法示例：{example}。{guidance}",
    "projection.mixedModes":
      "projection 不能同时混用包含(1/true)与排除(0/false)（_id 除外）。请只保留一种模式，例如 {example} 或 {excludeExample}。",
    "limit.notNumber":
      "limit 必须是数字，取值范围 1-{max}（默认 {fallback}）。超出上限时请用 offset 分页，例如 limit={max}, offset=0，再 offset+=limit。",
    "limit.notInteger": "limit 必须是整数，取值范围 1-{max}。当前值：{value}",
    "limit.outOfRange":
      "limit 超出上限：当前 {value}，允许范围 1-{max}（Cloud API MgoLimit lte）。请将 limit 调整为 ≤{max}，并用 offset 分页拉取更多数据（例如 limit={max}, offset=0，下一页 offset={max}）。",
    "queryError.illegalProjection":
      "QueryRecords 投影非法：{message}。修正建议：{guidance}",
    "queryError.mgoLimitExceeded":
      "QueryRecords MgoLimit 超限：{message}。limit 最大为 {max}，请缩小 limit 并用 offset 分页（例如 limit={max}, offset=0）。",
    "collectionReady.waiting":
      "createCollection 后正在等待 NoSQL 集合就绪",
    "collectionReady.ready":
      "NoSQL 集合已就绪，可执行后续操作",
    "collectionReady.timeoutWithLastError":
      "集合 {collection} 创建成功后等待就绪超时 ({timeoutMs}ms)，最后一次检查错误: {reason}",
    "collectionReady.timeoutStillUnavailable":
      "集合 {collection} 创建成功后等待就绪超时 ({timeoutMs}ms)，集合仍未进入可用状态",
    "unsupportedAction": "不支持的操作类型: {action}",
  },
  {
    "readStructure.title": "Read CloudBase NoSQL database structure",
    "readStructure.description":
      "Read CloudBase NoSQL database collection and index structures. Supports listing collections, describing a collection, listing indexes, and checking index existence. This is a server-side management tool for querying database structure from the admin side, not for writing client code.",
    "schema.readStructure.action": `listCollections: List collections
describeCollection: Describe collection details (including an index summary)
checkCollection: Check whether a collection exists
listIndexes: List indexes for a specified collection
checkIndex: Check whether a specified index exists`,
    "schema.readStructure.limit": "Maximum number of results (optional for listCollections)",
    "schema.readStructure.offset": "Result offset (optional for listCollections)",
    "schema.readStructure.collectionName": "Collection name (required for describeCollection, listIndexes, and checkIndex)",
    "schema.readStructure.indexName": "Index name (required for checkIndex)",
    "readStructure.listed": "Successfully listed NoSQL database collections",
    "readStructure.collectionRequiredCheck":
      "collectionName is required when checking a collection",
    "readStructure.collectionRequiredDescribe":
      "collectionName is required when describing a collection",
    "readStructure.collectionRequiredIndexes":
      "collectionName is required when listing indexes",
    "readStructure.indexRequired":
      "collectionName and indexName are required when checking an index",
    "readStructure.collectionExists":
      "The CloudBase database collection already exists",
    "readStructure.collectionNotExists":
      "The CloudBase database collection does not exist",
    "readStructure.described":
      "Successfully retrieved the CloudBase database collection info",
    "readStructure.indexesListed": "Successfully listed indexes",
    "readStructure.indexExists": "The index already exists",
    "readStructure.indexNotExists": "The index does not exist",
    "writeStructure.title":
      "Create and manage CloudBase NoSQL database collections",
    "writeStructure.description":
      "Create, delete, and manage CloudBase NoSQL database collections. Supports creating new collections, deleting existing collections, and adding/removing indexes via updateCollection's updateOptions.CreateIndexes / updateOptions.DropIndexes. Use action=createCollection to create a new collection. This is a server-side management tool for operating collection and index structures from the admin side, not for writing client code.",
    "schema.writeStructure.action": `createCollection: Create a collection
updateCollection: Update collection configuration; pass updateOptions.CreateIndexes to add indexes and updateOptions.DropIndexes to remove indexes
deleteCollection: Delete a collection`,
    "schema.writeStructure.collectionName": "Collection name",
    "schema.writeStructure.createIndex.name": "Name of the index to create",
    "schema.writeStructure.createIndex.unique": "Whether the index is unique",
    "schema.writeStructure.createIndex.fieldName": "Indexed field name",
    "schema.writeStructure.createIndex.direction": "Index direction; 1 usually means ascending and -1 means descending",
    "schema.writeStructure.createIndex.fields": "Index field list supporting single-field and compound indexes",
    "schema.writeStructure.createIndex.keySchema": "Field and constraint configuration for the index to create",
    "schema.writeStructure.createIndexes": "Indexes to add",
    "schema.writeStructure.dropIndex.name": "Name of the index to remove",
    "schema.writeStructure.dropIndexes": "Indexes to remove",
    "schema.writeStructure.updateOptions": "Update options for updateCollection. CreateIndexes adds indexes and DropIndexes removes indexes.",
    "writeStructure.alreadyExists":
      "Collection already exists; no need to create it again",
    "writeStructure.created":
      "CloudBase database collection created successfully",
    "writeStructure.optionsRequired":
      "options is required when updating a collection",
    "writeStructure.updated":
      "CloudBase database collection updated successfully",
    "writeStructure.notExists": "Collection does not exist",
    "writeStructure.deleted":
      "CloudBase database collection deleted successfully",
    "writeStructure.deleteInvalidParam":
      "deleteCollection parameter validation failed. Make sure collectionName is valid and exists. Current collectionName=\"{collectionName}\". Original error: {message}",
    "readContent.title": "Query and fetch CloudBase NoSQL database records",
    "readContent.description":
      "Query data records in the CloudBase NoSQL database. Supports filtering, pagination, and sorting for admin-side data queries and operations.limit defaults to 100 with a maximum of 1000; use offset pagination beyond that.projection only supports a { field: 1|0 } object (example {\"_id\":1,\"name\":1,\"createdAt\":1}); do not pass field arrays.",
    "schema.readContent.collectionName": "Collection name",
    "schema.readContent.instanceId": "Optional explicit database instance ID; when omitted, it is resolved and cached automatically",
    "schema.readContent.query": "Query condition as an object or string; an object is recommended",
    "schema.readContent.projection": "Return-field projection. Only an object or equivalent JSON string is supported, and values must be 1/0/true/false. Valid examples: {\"_id\":1,\"name\":1,\"createdAt\":1} (include) or {\"password\":0} (exclude). Do not pass field arrays such as [\"name\",\"age\"], and do not mix inclusion and exclusion except for _id.",
    "schema.readContent.sort.key": "Sort field name",
    "schema.readContent.sort.direction": "Sort direction: 1=ascending, -1=descending",
    "schema.readContent.sort": "Sort condition. Only an array such as [{\"key\":\"createdAt\",\"direction\":-1}] or the equivalent JSON string is supported.",
    "schema.readContent.limit": "Maximum number of results; an integer from 1 to 1000, defaulting to 100. Values above 1000 are rejected by the Cloud API MgoLimit lte validation; use offset pagination.",
    "schema.readContent.offset": "Number of records to skip",
    "readContent.success": "Documents queried successfully",
    "writeContent.title": "Modify CloudBase NoSQL database records",
    "writeContent.description":
      "Modify data records in the CloudBase NoSQL database. Supports insert, update (with $set/$inc/$push and other operators), delete, upsert, and more for admin-side data writes and operations.⚠️ Server-side writes do not include _openid: if the collection relies on client-side SDK (@cloudbase/js-sdk or WeChat Mini Program wx.cloud.database()) row-level security rules (e.g. doc._openid == auth.openid), you must manually add the _openid field on server-side writes, or clients will not be able to read the data.⚠️ Partial updates of nested fields must use dot paths, e.g. `$set: {\"shipping.city\": \"guangzhou\"}`; passing a nested object directly overwrites the whole field.",
    "schema.writeContent.action": "insert: Insert data (add documents)\nupdate: Update data\ndelete: Delete data",
    "schema.writeContent.collectionName": "Collection name",
    "schema.writeContent.instanceId": "Optional explicit database instance ID; when omitted, it is resolved and cached automatically",
    "schema.writeContent.documents": "Array of document objects to insert; each document must be an object (required for insert)",
    "schema.writeContent.query": "Query condition as an object or string; an object is recommended (required for update/delete)",
    "schema.writeContent.update": `Update content as an object or string; an object is recommended (required for update). Pass MgoUpdate using MongoDB update semantics: for partial updates, use operators such as \`$set\`, \`$inc\`, \`$unset\`, and \`$push\`, for example \`$set\` to update \`status\`. Do not pass a plain field-to-value object directly, because it may replace the entire document.

⚠️ Nested fields must use dot notation (such as \`shipping.city\`); replacing the whole object is prohibited:
- ❌ Incorrect: { "$set": { "shipping": { "city": "guangzhou" } } } — replaces all of shipping and loses existing fields such as address and province
- ✅ Correct: { "$set": { "shipping.city": "guangzhou" } } — updates only city and preserves other fields under shipping`,
    "schema.writeContent.isMulti": "Whether to update multiple records (optional for update/delete)",
    "schema.writeContent.upsert": "Whether to insert when no record exists (optional for update)",
    "writeContent.documentsRequired":
      "documents is required for the insert action",
    "writeContent.queryRequiredUpdate":
      "query is required for the update action",
    "writeContent.updateRequired": "update is required for the update action",
    "writeContent.queryRequiredDelete":
      "query is required for the delete action",
    "writeContent.inserted": "Documents inserted successfully",
    "writeContent.updated": "Documents updated successfully",
    "writeContent.updatedWithWarning":
      "Documents updated successfully; {warning}",
    "writeContent.deleted": "Documents deleted successfully",
    "writeContent.authLinkedDocWarning":
      "If the frontend reads this collection with doc(uid), create the document with `_id = uid` directly instead; querying by uid then upserting often generates a different `_id`, causing later doc(uid) reads to fail.",
    "sort.directionInvalid":
      "Invalid sort direction: {value}. Only 1 / -1 are supported",
    "sort.itemInvalid":
      "Each sort array item must be a { key, direction } object",
    "sort.keyRequired": "sort.key must be a non-empty string",
    "sort.jsonRequired": "sort must be a JSON string of the sort array",
    "sort.arrayInvalid":
      "sort only supports an array like [{\"key\":\"createdAt\",\"direction\":-1}] or the equivalent JSON string",
    "projection.guidance":
      "projection must be a field projection object (or the equivalent JSON string) with values limited to 1/0/true/false.Valid examples: {example} (return only these fields), or {excludeExample} (exclude fields).Do not pass field-name arrays, comma-separated strings, or query conditions, and do not mix inclusion (1/true) with exclusion (0/false) in the same projection (except _id).",
    "projection.invalidJson":
      "projection must be a valid JSON object string. {guidance}",
    "projection.arrayUnsupported":
      "projection does not support field-name arrays. Use an object instead, e.g. {example}. {guidance}",
    "projection.objectRequired":
      "projection must be an object. Use e.g. {example}. {guidance}",
    "projection.keyRequired":
      "projection field names must be non-empty strings. {guidance}",
    "projection.invalidFlag":
      "Invalid value for projection[\"{key}\"] (currently {value}); only 1/0/true/false are supported. Valid example: {example}. {guidance}",
    "projection.mixedModes":
      "projection cannot mix inclusion (1/true) and exclusion (0/false) (except _id). Keep only one mode, e.g. {example} or {excludeExample}.",
    "limit.notNumber":
      "limit must be a number in the range 1-{max} (default {fallback}). Use offset pagination beyond the cap, e.g. limit={max}, offset=0, then offset+=limit.",
    "limit.notInteger":
      "limit must be an integer in the range 1-{max}. Current value: {value}",
    "limit.outOfRange":
      "limit exceeds the cap: current {value}, allowed range 1-{max} (Cloud API MgoLimit lte). Set limit to <= {max} and use offset pagination to fetch more data (e.g. limit={max}, offset=0, next page offset={max}).",
    "queryError.illegalProjection":
      "Invalid QueryRecords projection: {message}. Fix hint: {guidance}",
    "queryError.mgoLimitExceeded":
      "QueryRecords MgoLimit exceeded: {message}. limit is capped at {max}; reduce limit and paginate with offset (e.g. limit={max}, offset=0).",
    "collectionReady.waiting":
      "Waiting for NoSQL collection readiness after createCollection",
    "collectionReady.ready":
      "NoSQL collection is ready for subsequent operations",
    "collectionReady.timeoutWithLastError":
      "Timed out ({timeoutMs}ms) waiting for collection {collection} to become ready after creation. Last check error: {reason}",
    "collectionReady.timeoutStillUnavailable":
      "Timed out ({timeoutMs}ms) waiting for collection {collection} to become ready after creation. The collection is still unavailable",
    "unsupportedAction": "Unsupported action type: {action}",
  },
);
