import ParameterTable from '../../api-reference/components/ApiContainer';

# MCP 工具

当前包含 36 个工具，按功能分组如下。

源数据: [tools.json](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/blob/main/scripts/tools.json)

---

## 工具总览

### 认证与登录

- [`auth`](#auth)

### 环境管理

- [`envQuery`](#envquery)
- [`envDomainManagement`](#envdomainmanagement)

### NoSQL 数据库

- [`readNoSqlDatabaseStructure`](#readnosqldatabasestructure)
- [`writeNoSqlDatabaseStructure`](#writenosqldatabasestructure)
- [`readNoSqlDatabaseContent`](#readnosqldatabasecontent)
- [`writeNoSqlDatabaseContent`](#writenosqldatabasecontent)

### MySQL 数据库

- [`querySqlDatabase`](#querysqldatabase)
- [`manageSqlDatabase`](#managesqldatabase)

### 数据模型

- [`manageDataModel`](#managedatamodel)
- [`modifyDataModel`](#modifydatamodel)

### 云函数

- [`queryFunctions`](#queryfunctions)
- [`manageFunctions`](#managefunctions)

### 静态托管

- [`uploadFiles`](#uploadfiles)
- [`deleteFiles`](#deletefiles)
- [`findFiles`](#findfiles)

### 域名管理

- [`domainManagement`](#domainmanagement)

### 云存储

- [`queryStorage`](#querystorage)
- [`manageStorage`](#managestorage)

### 模板与文件

- [`downloadTemplate`](#downloadtemplate)
- [`downloadRemoteFile`](#downloadremotefile)

### 搜索与知识库

- [`searchWeb`](#searchweb)
- [`searchKnowledgeBase`](#searchknowledgebase)

### 云托管

- [`queryCloudRun`](#querycloudrun)
- [`manageCloudRun`](#managecloudrun)

### 网关

- [`queryGateway`](#querygateway)
- [`manageGateway`](#managegateway)

### 应用认证

- [`queryAppAuth`](#queryappauth)
- [`manageAppAuth`](#manageappauth)

### 权限管理

- [`queryPermissions`](#querypermissions)
- [`managePermissions`](#managepermissions)

### 日志

- [`queryLogs`](#querylogs)

### AI Agent

- [`queryAgents`](#queryagents)
- [`manageAgents`](#manageagents)

### 激励计划

- [`activateInviteCode`](#activateinvitecode)

### 云 API

- [`callCloudApi`](#callcloudapi)

---

## 云端 MCP 配置说明


### 环境变量配置

使用云端 MCP 需要配置以下环境变量：

| 环境变量 | 说明 | 获取方式 |
|---------|------|---------|
| `TENCENTCLOUD_SECRETID` | 腾讯云 SecretId | [获取腾讯云 API 密钥](https://console.cloud.tencent.com/cam/capi) |
| `TENCENTCLOUD_SECRETKEY` | 腾讯云 SecretKey | [获取腾讯云 API 密钥](https://console.cloud.tencent.com/cam/capi) |
| `TENCENTCLOUD_SESSIONTOKEN` | 非必填，腾讯云临时密钥 Token（可选） | 仅在使用临时密钥时需要，可通过 [STS 服务](https://console.cloud.tencent.com/cam/capi) 获取 |
| `CLOUDBASE_ENV_ID` | 云开发环境 ID | [获取云开发环境 ID](https://tcb.cloud.tencent.com/dev) |

## 详细规格

### `auth`
CloudBase（腾讯云开发）开发阶段登录与环境绑定。登录后即可访问云资源；环境(env)是云函数、数据库、静态托管等资源的隔离单元，绑定环境后其他 MCP 工具才能操作该环境。支持：查询状态、发起登录、绑定环境(set_env)、退出登录。

#### 参数

<ParameterTable
  parameters={[
    {
      name: "action",
      type: "string",
      description: `动作：status=查询状态，start_auth=发起登录，set_env=绑定环境(传envId)，logout=退出登录 可填写的值: "status", "start_auth", "set_env", "logout", "get_temp_credentials"`,
    },
    {
      name: "authMode",
      type: "string",
      description: `认证模式：device=设备码授权，web=浏览器回调授权 可填写的值: "device", "web"`,
    },
    {
      name: "oauthEndpoint",
      type: "string",
      description: `高级可选：自定义 device-code 登录 endpoint。配置后 oauthCustom 默认按 true 处理`,
    },
    {
      name: "clientId",
      type: "string",
      description: `高级可选：自定义 device-code 登录 client_id，不传则使用默认值`,
    },
    {
      name: "oauthCustom",
      type: "boolean",
      description: `高级可选：自定义 endpoint 返回格式开关。未配置 endpoint 时默认 false；配置 endpoint 后默认 true，且不能设为 false`,
    },
    {
      name: "envId",
      type: "string",
      description: `环境ID(CloudBase 环境唯一标识)，绑定后工具将操作该环境。action=set_env 时必填`,
    },
    {
      name: "confirm",
      type: "string",
      description: `action=logout 时确认操作，传 yes 可填写的值: const "yes"`,
    },
    {
      name: "reveal",
      type: "boolean",
      description: `action=get_temp_credentials 时可选。true=返回明文临时密钥；默认 false 仅返回脱敏结果`,
    }
  ]}
/>

---

### `envQuery`
查询云开发环境相关信息，支持查询环境列表、当前环境信息、安全域名和静态网站托管配置。（原工具名：listEnvs/getEnvInfo/getEnvAuthDomains/getWebsiteConfig，为兼容旧AI规则可继续使用这些名称）当 action=list 时，标准返回字段为 EnvId、Alias、Status、EnvType、Region、PackageId、PackageName、IsDefault，并支持通过 fields 白名单裁剪这些字段；aliasExact=true 时会按别名精确筛选，避免把前缀相近的环境误当作候选；即使传入 envId，action=list 也只返回摘要，不会返回完整资源明细或 expiry。如需查询某个已知环境的详细信息，请使用 action=info。action=info 会在可用时补充 BillingInfo（如 ExpireTime、PayMode、IsAutoRenew 等计费字段）。

#### 参数

<ParameterTable
  parameters={[
    {
      name: "action",
      type: "string",
      required: true,
      description: `查询类型：list=环境列表/摘要筛选（即使传 envId 也只返回 EnvId、Alias、Status、EnvType、Region、PackageId、PackageName、IsDefault，不支持 expiry），info=当前环境详细信息（详情中可查看更完整资源字段），domains=安全域名列表，hosting=静态网站托管配置 可填写的值: "list", "info", "domains", "hosting"`,
    },
    {
      name: "alias",
      type: "string",
      description: `按环境别名筛选。action=list 时可选`,
    },
    {
      name: "aliasExact",
      type: "boolean",
      description: `按环境别名精确筛选。action=list 时可选；与 alias 配合使用`,
    },
    {
      name: "envId",
      type: "string",
      description: `按环境 ID 精确筛选。action=list 时可选；注意 list + envId 仍只返回摘要，如需该环境详情请改用 action=info`,
    },
    {
      name: "limit",
      type: "integer",
      description: `返回数量上限。action=list 时可选`,
    },
    {
      name: "offset",
      type: "integer",
      description: `分页偏移。action=list 时可选`,
    },
    {
      name: "fields",
      type: "array of string",
      description: `返回字段白名单。仅支持 EnvId、Alias、Status、EnvType、Region、PackageId、PackageName、IsDefault。action=list 时可选`,
    }
  ]}
/>

---

### `envDomainManagement`
管理云开发环境的安全域名（安全域名 / CORS 白名单），支持添加和删除操作。（原工具名：createEnvDomain/deleteEnvDomain，为兼容旧AI规则可继续使用这些名称）当浏览器 Web 应用需要从本地 Vite / dev server 直接访问 CloudBase 资源时，应先用 envQuery(action=domains) 检查当前实际浏览器 origin 对应的 host:port 是否已在白名单中，再按该实际值添加。新增或删除后通常需要继续轮询 envQuery(action=domains) 确认状态收敛；安全域名一般约 10 分钟生效。⚠️ 重要：此工具仅用于 CORS/请求来源验证，不涉及 SSL 证书。如需绑定自定义域名供公网 HTTPS 访问，请使用 manageGateway(action="bindCustomDomain")。

#### 参数

<ParameterTable
  parameters={[
    {
      name: "action",
      type: "string",
      required: true,
      description: `操作类型：create=添加安全域名，delete=删除安全域名 可填写的值: "create", "delete"`,
    },
    {
      name: "domains",
      type: "array of string",
      required: true,
      description: `安全域名数组（格式：host:port，例如 localhost:5173 或 127.0.0.1:4173）。注意：不是自定义域名，不需要证书。`,
    }
  ]}
/>

---

### `readNoSqlDatabaseStructure`
读取 NoSQL 数据库集合与索引结构，支持列出集合、查看集合详情、列出索引以及检查索引是否存在。本工具为服务端管理工具，用于管理端查询数据库结构，不用于编写客户端代码。

#### 参数

<ParameterTable
  parameters={[
    {
      name: "action",
      type: "string",
      required: true,
      description: `listCollections: 列出集合列表 describeCollection: 描述集合详情（会返回索引摘要） checkCollection: 检查集合是否存在 listIndexes: 列出指定集合的索引列表 checkIndex: 检查指定索引是否存在 可填写的值: "listCollections", "describeCollection", "checkCollection", "listIndexes", "checkIndex"`,
    },
    {
      name: "limit",
      type: "number",
      description: `返回数量限制(listCollections 操作时可选)`,
    },
    {
      name: "offset",
      type: "number",
      description: `偏移量(listCollections 操作时可选)`,
    },
    {
      name: "collectionName",
      type: "string",
      description: `集合名称(describeCollection、listIndexes、checkIndex 操作时必填)`,
    },
    {
      name: "indexName",
      type: "string",
      description: `索引名称(checkIndex 操作时必填)`,
    }
  ]}
/>

---

### `writeNoSqlDatabaseStructure`
修改 NoSQL 数据库结构，支持创建/删除集合，以及通过 updateCollection 的 updateOptions.CreateIndexes / updateOptions.DropIndexes 添加索引和删除索引。本工具为服务端管理工具，用于管理端操作集合和索引结构，不用于编写客户端代码。

#### 参数

<ParameterTable
  parameters={[
    {
      name: "action",
      type: "string",
      required: true,
      description: `createCollection: 创建集合 updateCollection: 更新集合配置；添加索引请传 updateOptions.CreateIndexes，删除索引请传 updateOptions.DropIndexes deleteCollection: 删除集合 可填写的值: "createCollection", "updateCollection", "deleteCollection"`,
    },
    {
      name: "collectionName",
      type: "string",
      required: true,
      description: `集合名称`,
    },
    {
      name: "updateOptions",
      type: "object",
      description: `更新选项(updateCollection 时使用)。CreateIndexes 用于添加索引，DropIndexes 用于删除索引。`,
      children: [
        {
          name: "CreateIndexes",
          type: "array of object",
          description: `要添加的索引列表`,
          children: [
            {
              name: "IndexName",
              type: "string",
              required: true,
              description: `要创建的索引名称`,
            },
            {
              name: "MgoKeySchema",
              type: "object",
              required: true,
              description: `待创建索引的字段与约束配置`,
              children: [
                {
                  name: "MgoIsUnique",
                  type: "boolean",
                  required: true,
                  description: `是否唯一索引`,
                },
                {
                  name: "MgoIndexKeys",
                  type: "array of object",
                  required: true,
                  description: `索引字段列表，支持单字段或复合索引`,
                  children: [
                    {
                      name: "Name",
                      type: "string",
                      required: true,
                      description: `索引字段名`,
                    },
                    {
                      name: "Direction",
                      type: "string",
                      required: true,
                      description: `索引方向，通常 1 表示升序，-1 表示降序`,
                    }
                  ],
                }
              ],
            }
          ],
        },
        {
          name: "DropIndexes",
          type: "array of object",
          description: `要删除的索引列表`,
          children: [
            {
              name: "IndexName",
              type: "string",
              required: true,
              description: `要删除的索引名称`,
            }
          ],
        }
      ],
    }
  ]}
/>

---

### `readNoSqlDatabaseContent`
查询并获取 NoSQL 数据库数据记录。⚠️ 本工具为服务端管理工具，用于管理端/运维端查询。当任务要求编写客户端应用代码时（例如「用 JS SDK 读取数据」），不应使用本工具，而应在项目代码中编写 @cloudbase/js-sdk 客户端代码（如 db.collection().where().get()）。

#### 参数

<ParameterTable
  parameters={[
    {
      name: "collectionName",
      type: "string",
      required: true,
      description: `集合名称`,
    },
    {
      name: "instanceId",
      type: "string",
      description: `可选：显式指定数据库实例ID；未传时会自动解析并缓存`,
    },
    {
      name: "query",
      type: "union",
      description: `查询条件(对象或字符串,推荐对象)`,
    },
    {
      name: "projection",
      type: "union",
      description: `返回字段投影(对象或字符串,推荐对象)`,
    },
    {
      name: "sort",
      type: "union",
      description: `排序条件，仅支持数组 [{"key":"createdAt","direction":-1}] 或对应 JSON 字符串。`,
    },
    {
      name: "limit",
      type: "number",
      description: `返回数量限制`,
    },
    {
      name: "offset",
      type: "number",
      description: `跳过的记录数`,
    }
  ]}
/>

---

### `writeNoSqlDatabaseContent`
修改 NoSQL 数据库数据记录。⚠️ 本工具为服务端管理工具，用于管理端/运维端操作（如后台脚本、数据迁移、批量修改）。当任务要求编写客户端应用代码时（例如「用 JS SDK 登录并插入数据」、「在前端读写数据库」），不应使用本工具，而应在项目代码中编写 @cloudbase/js-sdk 客户端代码（如 app.database().collection().add()、db.collection().where().get() 等）。可按 MongoDB updateOne/updateMany 的心智模型理解：部分更新必须使用 `$set`、`$inc`、`$push` 等更新操作符；如果直接传「字段到值的普通对象」这类内容，底层会把它当作替换内容，存在覆盖整条文档的风险。更新嵌套对象中的某个字段时必须使用点号路径，例如把 `address.city` 设为 `shenzhen`；如果把整个 `address` 对象作为 `$set` 的值传入，则整个 `address` 对象会被替换，同级其他字段将丢失。若集合中的角色/档案文档会在前端通过 `db.collection(...).doc(uid)` 读取，请确保文档 `_id` 就是该 `uid`；不要用按 `uid` 条件查询再配合 `upsert=true` 的方式去更新 `users` / `profiles`，否则经常会生成一个不同的 `_id`，导致后续 `doc(uid)` 读取命中不到。

#### 参数

<ParameterTable
  parameters={[
    {
      name: "action",
      type: "string",
      required: true,
      description: `insert: 插入数据（新增文档） update: 更新数据 delete: 删除数据 可填写的值: "insert", "update", "delete"`,
    },
    {
      name: "collectionName",
      type: "string",
      required: true,
      description: `集合名称`,
    },
    {
      name: "instanceId",
      type: "string",
      description: `可选：显式指定数据库实例ID；未传时会自动解析并缓存`,
    },
    {
      name: "documents",
      type: "array of object",
      description: `要插入的文档对象数组,每个文档都是对象(insert 操作必填)`,
    },
    {
      name: "query",
      type: "union",
      description: `查询条件(对象或字符串,推荐对象)(update/delete 操作必填)`,
    },
    {
      name: "update",
      type: "union",
      description: `更新内容(对象或字符串,推荐对象)(update 操作必填)。按 MongoDB 更新语义传入 MgoUpdate：部分更新请使用 \`$set\`、\`$inc\`、\`$unset\`、\`$push\` 等操作符，例如使用 \`$set\` 更新 \`status\`；不要直接传“字段到值的普通对象”，否则可能替换整条文档。更新嵌套字段时必须使用点号路径，例如通过 \`$set\` 更新 \`address.city\`；不要把整个 \`address\` 对象作为 \`$set\` 的值传入，否则会替换整个 \`address\` 对象。`,
    },
    {
      name: "isMulti",
      type: "boolean",
      description: `是否更新多条记录(update/delete 操作可选)`,
    },
    {
      name: "upsert",
      type: "boolean",
      description: `是否在不存在时插入(update 操作可选)`,
    }
  ]}
/>

---

### `querySqlDatabase`
Query SQL database information. Supports read-only SQL execution, MySQL provisioning result lookup, MySQL task status lookup, and current instance context discovery.

#### 参数

<ParameterTable
  parameters={[
    {
      name: "action",
      type: "string",
      required: true,
      description: `runQuery=execute read-only SQL; describeCreateResult=query CreateMySQL result; describeTaskStatus=query MySQL task status; getInstanceInfo=get current SQL instance context 可填写的值: "runQuery", "describeCreateResult", "describeTaskStatus", "getInstanceInfo"`,
    },
    {
      name: "sql",
      type: "string",
      description: `Read-only SQL used by action=runQuery`,
    },
    {
      name: "request",
      type: "object",
      description: `Official request payload used by describeCreateResult/describeTaskStatus`,
    },
    {
      name: "dbInstance",
      type: "object",
      description: `Optional SQL database instance context for runQuery`,
      children: [
        {
          name: "instanceId",
          type: "string",
        },
        {
          name: "schema",
          type: "string",
        }
      ],
    }
  ]}
/>

---

### `manageSqlDatabase`
Manage SQL database resources. Supports MySQL provisioning, MySQL destruction, write SQL/DDL execution, and schema initialization. IMPORTANT: MySQL must be provisioned first (action=provisionMySQL with confirm=true) before any runStatement or initializeSchema call. If MySQL is not yet provisioned, the tool will return MYSQL_NOT_CREATED with a nextAction to provision first.

#### 参数

<ParameterTable
  parameters={[
    {
      name: "action",
      type: "string",
      required: true,
      description: `provisionMySQL=create MySQL instance; destroyMySQL=destroy MySQL instance; runStatement=execute write SQL or DDL; initializeSchema=run ordered schema initialization statements 可填写的值: "provisionMySQL", "destroyMySQL", "runStatement", "initializeSchema"`,
    },
    {
      name: "confirm",
      type: "boolean",
      description: `Explicit confirmation required for action=provisionMySQL or action=destroyMySQL`,
    },
    {
      name: "sql",
      type: "string",
      description: `SQL statement used by action=runStatement`,
    },
    {
      name: "request",
      type: "object",
      description: `Official request payload used by action=provisionMySQL or action=destroyMySQL`,
    },
    {
      name: "statements",
      type: "array of string",
      description: `Ordered schema initialization SQL statements used by action=initializeSchema`,
    },
    {
      name: "requireReady",
      type: "boolean",
      description: `Whether initializeSchema should block until MySQL is confirmed ready. Defaults to true.`,
    },
    {
      name: "statusContext",
      type: "object",
      description: `Optional provisioning status requests used to confirm readiness before initializeSchema`,
      children: [
        {
          name: "createResultRequest",
          type: "object",
        },
        {
          name: "taskStatusRequest",
          type: "object",
        }
      ],
    },
    {
      name: "dbInstance",
      type: "object",
      description: `Optional SQL database instance context for runStatement/initializeSchema`,
      children: [
        {
          name: "instanceId",
          type: "string",
        },
        {
          name: "schema",
          type: "string",
        }
      ],
    }
  ]}
/>

---

### `manageDataModel`
数据模型查询工具，支持查询和列表数据模型（只读操作）。通过 action 参数区分操作类型：list=获取模型列表（不含Schema，可选 names 参数过滤），get=查询单个模型详情（含Schema字段列表、格式、关联关系等，需要提供 name 参数），docs=生成SDK使用文档（需要提供 name 参数）

#### 参数

<ParameterTable
  parameters={[
    {
      name: "action",
      type: "string",
      required: true,
      description: `操作类型：get=查询单个模型（含Schema字段列表、格式、关联关系，需要提供 name 参数），list=获取模型列表（不含Schema，可选 names 参数过滤），docs=生成SDK使用文档（需要提供 name 参数） 可填写的值: "get", "list", "docs"`,
    },
    {
      name: "name",
      type: "string",
      description: `要查询的数据模型名称。当 action='get' 或 action='docs' 时，此参数为必填项，必须提供已存在的数据模型名称。可通过 action='list' 操作获取可用的模型名称列表`,
    },
    {
      name: "names",
      type: "array of string",
      description: `模型名称数组（list操作时可选，用于过滤）`,
    }
  ]}
/>

---

### `modifyDataModel`
基于Mermaid classDiagram创建数据模型。为保持兼容性，工具名仍为 modifyDataModel；当前仅支持创建新模型，不支持更新现有模型结构。内置异步任务监控，自动轮询直至完成或超时。

#### 参数

<ParameterTable
  parameters={[
    {
      name: "mermaidDiagram",
      type: "string",
      required: true,
      description: `Mermaid classDiagram代码，描述数据模型结构。 示例： classDiagram     class Student {         name: string <<姓名>>         age: number = 18 <<年龄>>         gender: x-enum = "男" <<性别>>         classId: string <<班级ID>>         identityId: string <<身份ID>>         course: Course[] <<课程>>         required() ["name"]         unique() ["name"]         enum_gender() ["男", "女"]         display_field() "name"     }     class Class {         className: string <<班级名称>>         display_field() "className"     }     class Course {         name: string <<课程名称>>         students: Student[] <<学生>>         display_field() "name"     }     class Identity {         number: string <<证件号码>>         display_field() "number"     }     %% 关联关系     Student "1" --> "1" Identity : studentId     Student "n" --> "1" Class : student2class     Student "n" --> "m" Course : course     Student "n" <-- "m" Course : students     %% 类的命名     note for Student "学生模型"     note for Class "班级模型"     note for Course "课程模型"     note for Identity "身份模型" `,
    },
    {
      name: "action",
      type: "string",
      description: `操作类型：create=创建新模型 可填写的值: "create"`,
    },
    {
      name: "publish",
      type: "boolean",
      description: `是否立即发布模型`,
    },
    {
      name: "dbInstanceType",
      type: "string",
      description: `数据库实例类型`,
    }
  ]}
/>

---

### `queryFunctions`
函数域统一只读入口。通过更自解释的 action 查询函数列表、函数详情、日志、层、触发器和代码下载地址。

#### 参数

<ParameterTable
  parameters={[
    {
      name: "action",
      type: "string",
      required: true,
      description: `只读操作类型，例如 listFunctions、getFunctionDetail、listFunctionLogs 可填写的值: "listFunctions", "getFunctionDetail", "listFunctionLogs", "getFunctionLogDetail", "listFunctionLayers", "listLayers", "listLayerVersions", "getLayerVersionDetail", "listFunctionTriggers", "getFunctionDownloadUrl"`,
    },
    {
      name: "functionName",
      type: "string",
      description: `函数名称。listFunctionLogs、getFunctionDetail、listFunctionLayers、listFunctionTriggers、getFunctionDownloadUrl 时必填`,
    },
    {
      name: "limit",
      type: "number",
      description: `分页数量。列表类 action 可选`,
    },
    {
      name: "offset",
      type: "number",
      description: `分页偏移。列表类 action 可选`,
    },
    {
      name: "codeSecret",
      type: "string",
      description: `代码保护密钥`,
    },
    {
      name: "startTime",
      type: "string",
      description: `日志查询开始时间，格式必须为 YYYY-MM-DD HH:mm:ss（如 2024-01-01 00:00:00）。与 endTime 间隔不能超过一天。不传时默认查询最近一天`,
    },
    {
      name: "endTime",
      type: "string",
      description: `日志查询结束时间，格式必须为 YYYY-MM-DD HH:mm:ss（如 2024-01-01 23:59:59）。与 startTime 间隔不能超过一天。不传时默认为当前时间`,
    },
    {
      name: "requestId",
      type: "string",
      description: `日志 requestId。获取日志详情时必填`,
    },
    {
      name: "qualifier",
      type: "string",
      description: `函数版本，日志查询时可选`,
    },
    {
      name: "runtime",
      type: "string",
      description: `层查询的运行时筛选`,
    },
    {
      name: "searchKey",
      type: "string",
      description: `层名称搜索关键字`,
    },
    {
      name: "layerName",
      type: "string",
      description: `层名称。层相关 action 必填`,
    },
    {
      name: "layerVersion",
      type: "number",
      description: `层版本号。获取层版本详情时必填`,
    }
  ]}
/>

---

### `manageFunctions`
函数域统一写入口。通过 action 管理函数创建、代码更新、配置更新、调用函数、触发器和层绑定。危险操作需要显式 confirm=true。

#### 参数

<ParameterTable
  parameters={[
    {
      name: "action",
      type: "string",
      required: true,
      description: `写操作类型，例如 createFunction、updateFunctionCode、invokeFunction、deleteFunction、attachLayer 可填写的值: "createFunction", "updateFunctionCode", "updateFunctionConfig", "invokeFunction", "deleteFunction", "createFunctionTrigger", "deleteFunctionTrigger", "createLayerVersion", "deleteLayerVersion", "attachLayer", "detachLayer", "updateFunctionLayers"`,
    },
    {
      name: "func",
      type: "object",
      description: `createFunction 操作的函数配置`,
      children: [
        {
          name: "name",
          type: "string",
          required: true,
          description: `函数名称`,
        },
        {
          name: "type",
          type: "string",
          description: `函数类型 可填写的值: "Event", "HTTP"`,
        },
        {
          name: "protocolType",
          type: "string",
          description: `HTTP 云函数协议类型 可填写的值: "HTTP", "WS"`,
        },
        {
          name: "protocolParams",
          type: "object",
          children: [
            {
              name: "wsParams",
              type: "object",
              children: [
                {
                  name: "idleTimeOut",
                  type: "number",
                  description: `WebSocket 空闲超时时间（秒）`,
                }
              ],
            }
          ],
        },
        {
          name: "instanceConcurrencyConfig",
          type: "object",
          children: [
            {
              name: "dynamicEnabled",
              type: "boolean",
            },
            {
              name: "maxConcurrency",
              type: "number",
            }
          ],
        },
        {
          name: "timeout",
          type: "number",
          description: `函数超时时间`,
        },
        {
          name: "envVariables",
          type: "object",
          description: `环境变量`,
        },
        {
          name: "vpc",
          type: "object",
          description: `私有网络配置`,
          children: [
            {
              name: "vpcId",
              type: "string",
              required: true,
            },
            {
              name: "subnetId",
              type: "string",
              required: true,
            }
          ],
        },
        {
          name: "runtime",
          type: "string",
          description: `运行时环境。Event 函数支持多种运行时:   Nodejs: Nodejs20.19, Nodejs18.15, Nodejs16.13, Nodejs14.18, Nodejs12.16, Nodejs10.15, Nodejs8.9   Python: Python3.10, Python3.9, Python3.7, Python3.6, Python2.7   Php: Php8.0, Php7.4, Php7.2   Java: Java8, Java11   Golang: Golang1 推荐运行时:   Node.js: Nodejs18.15   Python: Python3.9   PHP: Php7.4   Java: Java11   Go: Golang1`,
        },
        {
          name: "triggers",
          type: "array of object",
          description: `触发器配置数组`,
          children: [
            {
              name: "name",
              type: "string",
              required: true,
              description: `触发器名称`,
            },
            {
              name: "type",
              type: "string",
              required: true,
              description: `触发器类型 可填写的值: "timer"`,
            },
            {
              name: "config",
              type: "string",
              required: true,
              description: `触发器配置。timer 必须使用 CloudBase 7 段 cron 格式：秒 分 时 日 月 星期 年。⚠️ 不支持标准 5 段 cron（如 */5 * * * * 是错误的）。正确示例：0 */5 * * * * *（每5分钟）、0 0 2 1 * * *（每月1号2点）、0 30 9 * * * *（每天9:30）`,
            }
          ],
        },
        {
          name: "handler",
          type: "string",
          description: `函数入口`,
        },
        {
          name: "ignore",
          type: "union",
          description: `忽略文件`,
        },
        {
          name: "isWaitInstall",
          type: "boolean",
          description: `是否等待依赖安装`,
        },
        {
          name: "layers",
          type: "array of object",
          description: `Layer 配置`,
          children: [
            {
              name: "name",
              type: "string",
              required: true,
            },
            {
              name: "version",
              type: "number",
              required: true,
            }
          ],
        }
      ],
    },
    {
      name: "functionRootPath",
      type: "string",
      description: `创建或更新函数代码时默认推荐的本地目录方式。必须是直接包含函数文件夹的目录绝对路径（如 /abs/path/cloudfunctions 或 /abs/path/functions），不要传项目根目录（如 /abs/path），也不要传到函数名子目录（如 /abs/path/cloudfunctions/hello）。本地应按 cloudfunctions/<functionName>/index.js 或 functions/<functionName>/index.js 布局，此参数传 cloudfunctions 或 functions 目录的绝对路径。SDK 会自动拼接函数名子目录，无需预先压缩 zip 或 base64 编码。`,
    },
    {
      name: "force",
      type: "boolean",
      description: `createFunction 时是否覆盖`,
    },
    {
      name: "functionName",
      type: "string",
      description: `函数名称。大多数 action 使用该字段作为统一目标`,
    },
    {
      name: "zipFile",
      type: "string",
      description: `仅兼容特殊场景：预先准备好的代码包 base64 编码。普通 createFunction/updateFunctionCode 默认不要先压缩 zip，优先使用 functionRootPath。`,
    },
    {
      name: "handler",
      type: "string",
      description: `函数入口`,
    },
    {
      name: "timeout",
      type: "number",
      description: `配置更新时的超时时间`,
    },
    {
      name: "envVariables",
      type: "object",
      description: `配置更新时要合并的环境变量`,
    },
    {
      name: "vpc",
      type: "unknown",
      description: `配置更新时的 VPC 信息`,
    },
    {
      name: "params",
      type: "object",
      description: `invokeFunction 的调用参数`,
    },
    {
      name: "triggers",
      type: "array of unknown",
      description: `createFunctionTrigger 的触发器列表`,
    },
    {
      name: "triggerName",
      type: "string",
      description: `deleteFunctionTrigger 的目标触发器名称`,
    },
    {
      name: "layerName",
      type: "string",
      description: `层名称`,
    },
    {
      name: "layerVersion",
      type: "number",
      description: `层版本号`,
    },
    {
      name: "contentPath",
      type: "string",
      description: `层内容路径，可为目录或 ZIP 文件`,
    },
    {
      name: "base64Content",
      type: "string",
      description: `层内容的 base64 编码`,
    },
    {
      name: "runtimes",
      type: "array of string",
      description: `层适用的运行时列表`,
    },
    {
      name: "description",
      type: "string",
      description: `层版本描述`,
    },
    {
      name: "licenseInfo",
      type: "string",
      description: `层许可证信息`,
    },
    {
      name: "layers",
      type: "array of object",
      description: `updateFunctionLayers 的目标层列表，顺序即最终顺序`,
      children: [
        {
          name: "layerName",
          type: "string",
          required: true,
          description: `层名称`,
        },
        {
          name: "layerVersion",
          type: "number",
          required: true,
          description: `层版本号`,
        }
      ],
    },
    {
      name: "codeSecret",
      type: "string",
      description: `层绑定时的代码保护密钥`,
    },
    {
      name: "confirm",
      type: "boolean",
      description: `危险操作确认开关。deleteFunction、deleteFunctionTrigger、deleteLayerVersion、detachLayer 等删除类操作需要显式传入 confirm=true`,
    }
  ]}
/>

---

### `uploadFiles`
上传文件到静态网站托管，仅用于 Web 站点部署，不用于云存储对象上传。部署前请先完成构建；如果站点会部署到子路径，请检查构建配置中的 publicPath、base、assetPrefix 等是否使用相对路径，避免静态资源加载失败。若需要上传 COS 云存储文件，请使用 manageStorage。对于本地评测、现有脚手架补全或仅需本地开发服务器验证的任务，通常不需要调用此工具，除非用户明确要求部署站点。

#### 参数

<ParameterTable
  parameters={[
    {
      name: "localPath",
      type: "string",
      description: `本地文件或文件夹路径，需要是绝对路径，例如 /tmp/files/data.txt。`,
    },
    {
      name: "cloudPath",
      type: "string",
      description: `静态托管云端文件或文件夹路径，例如 files/data.txt。若部署到子路径，请同时检查构建配置中的 publicPath、base、assetPrefix 等是否为相对路径。云存储对象路径请改用 manageStorage。`,
    },
    {
      name: "files",
      type: "array of object",
      description: `多文件上传配置`,
      children: [
        {
          name: "localPath",
          type: "string",
          required: true,
        },
        {
          name: "cloudPath",
          type: "string",
          required: true,
        }
      ],
    },
    {
      name: "ignore",
      type: "union",
      description: `忽略文件模式`,
    }
  ]}
/>

---

### `deleteFiles`
删除静态网站托管的文件或文件夹

#### 参数

<ParameterTable
  parameters={[
    {
      name: "cloudPath",
      type: "string",
      required: true,
      description: `云端文件或文件夹路径`,
    },
    {
      name: "isDir",
      type: "boolean",
      description: `是否为文件夹`,
    }
  ]}
/>

---

### `findFiles`
搜索静态网站托管的文件

#### 参数

<ParameterTable
  parameters={[
    {
      name: "prefix",
      type: "string",
      required: true,
      description: `匹配前缀`,
    },
    {
      name: "marker",
      type: "string",
      description: `起始对象键标记`,
    },
    {
      name: "maxKeys",
      type: "number",
      description: `单次返回最大条目数`,
    }
  ]}
/>

---

### `domainManagement`
统一的域名管理工具，支持绑定、解绑、查询和修改域名配置。绑定、解绑和修改通常是异步传播流程，调用后应继续使用 action=check 轮询确认域名是否已出现、已删除或配置已收敛。

#### 参数

<ParameterTable
  parameters={[
    {
      name: "action",
      type: "string",
      required: true,
      description: `操作类型: create=绑定域名, delete=解绑域名, check=查询域名配置, modify=修改域名配置 可填写的值: "create", "delete", "check", "modify"`,
    },
    {
      name: "domain",
      type: "string",
      description: `域名`,
    },
    {
      name: "certId",
      type: "string",
      description: `证书ID（绑定域名时必需）`,
    },
    {
      name: "domains",
      type: "array of string",
      description: `域名列表（查询配置时使用）`,
    },
    {
      name: "domainId",
      type: "number",
      description: `域名ID（修改配置时必需）`,
    },
    {
      name: "domainConfig",
      type: "object",
      description: `域名配置（修改配置时使用）`,
      children: [
        {
          name: "Refer",
          type: "object",
          children: [
            {
              name: "Switch",
              type: "string",
              required: true,
            },
            {
              name: "RefererRules",
              type: "array of object",
              children: [
                {
                  name: "RefererType",
                  type: "string",
                  required: true,
                },
                {
                  name: "Referers",
                  type: "array of string",
                  required: true,
                },
                {
                  name: "AllowEmpty",
                  type: "boolean",
                  required: true,
                }
              ],
            }
          ],
        },
        {
          name: "Cache",
          type: "array of object",
          children: [
            {
              name: "RuleType",
              type: "string",
              required: true,
            },
            {
              name: "RuleValue",
              type: "string",
              required: true,
            },
            {
              name: "CacheTtl",
              type: "number",
              required: true,
            }
          ],
        },
        {
          name: "IpFilter",
          type: "object",
          children: [
            {
              name: "Switch",
              type: "string",
              required: true,
            },
            {
              name: "FilterType",
              type: "string",
            },
            {
              name: "Filters",
              type: "array of string",
            }
          ],
        },
        {
          name: "IpFreqLimit",
          type: "object",
          children: [
            {
              name: "Switch",
              type: "string",
              required: true,
            },
            {
              name: "Qps",
              type: "number",
            }
          ],
        }
      ],
    }
  ]}
/>

---

### `queryStorage`
查询云存储信息，支持列出目录文件、获取文件信息、获取临时下载链接等只读操作。返回的文件信息包括文件名、大小、修改时间、下载链接等。

#### 参数

<ParameterTable
  parameters={[
    {
      name: "action",
      type: "string",
      required: true,
      description: `查询操作类型：list=列出目录下的所有文件，info=获取指定文件的详细信息，url=获取文件的临时下载链接，read=读取文本文件内容 可填写的值: "list", "info", "url", "read"`,
    },
    {
      name: "cloudPath",
      type: "string",
      required: true,
      description: `云端文件路径，例如 files/data.txt 或 files/（目录）`,
    },
    {
      name: "maxAge",
      type: "number",
      description: `临时链接有效期，单位为秒，取值范围：1-86400，默认值：3600（1小时）`,
    }
  ]}
/>

---

### `manageStorage`
管理云存储文件，仅用于 COS/Storage 对象，不用于静态网站托管。支持上传文件/目录、下载文件/目录、删除文件/目录等操作。删除操作需要设置force=true进行确认，防止误删除重要文件。

#### 参数

<ParameterTable
  parameters={[
    {
      name: "action",
      type: "string",
      required: true,
      description: `管理操作类型：upload=上传文件或目录，download=下载文件或目录，delete=删除文件或目录 可填写的值: "upload", "download", "delete"`,
    },
    {
      name: "localPath",
      type: "string",
      required: true,
      description: `本地文件路径，建议传入绝对路径，例如 /tmp/files/data.txt`,
    },
    {
      name: "cloudPath",
      type: "string",
      required: true,
      description: `云端文件路径，例如 files/data.txt`,
    },
    {
      name: "force",
      type: "boolean",
      description: `强制操作开关，删除操作时建议设置为true以确认删除，默认false`,
    },
    {
      name: "isDirectory",
      type: "boolean",
      description: `是否为目录操作，true=目录操作，false=文件操作，默认false`,
    }
  ]}
/>

---

### `downloadTemplate`
自动下载并部署CloudBase项目模板。
**Note**: Call this tool when the user requests to create a new project using a CloudBase template.

支持的模板:
- react: React + CloudBase 全栈应用模板
- vue: Vue + CloudBase 全栈应用模板
- miniprogram: 微信小程序 + 云开发模板  
- uniapp: UniApp + CloudBase 跨端应用模板
- rules: 只包含AI编辑器配置文件（包含Cursor、WindSurf、CodeBuddy等所有主流编辑器配置），适合在已有项目中补充AI编辑器配置

支持的IDE类型:
- all: 下载所有IDE配置
- cursor: Cursor AI编辑器
- 其他IDE类型见下方列表

注意：如果未传入 ide 参数且无法从环境变量检测到 IDE，将提示错误并要求传入 ide 参数
- windsurf: WindSurf AI编辑器
- codebuddy: CodeBuddy AI编辑器
- claude-code: Claude Code AI编辑器
- cline: Cline AI编辑器
- gemini-cli: Gemini CLI
- opencode: OpenCode AI编辑器
- qwen-code: 通义灵码
- baidu-comate: 百度Comate
- openai-codex-cli: OpenAI Codex CLI
- augment-code: Augment Code
- github-copilot: GitHub Copilot
- roocode: RooCode AI编辑器
- tongyi-lingma: 通义灵码
- trae: Trae AI编辑器
- qoder: Qoder AI编辑器
- antigravity: Google Antigravity AI编辑器
- vscode: Visual Studio Code
- kiro: Kiro AI编辑器
- aider: Aider AI编辑器

特别说明：
- rules 模板会自动包含当前 mcp 版本号信息（版本号：2.18.0），便于后续维护和版本追踪
- 下载 rules 模板时，如果项目中已存在 README.md 文件，系统会自动保护该文件不被覆盖（除非设置 overwrite=true）

#### 参数

<ParameterTable
  parameters={[
    {
      name: "template",
      type: "string",
      required: true,
      description: `要下载的模板类型 可填写的值: "react", "vue", "miniprogram", "uniapp", "rules"`,
    },
    {
      name: "ide",
      type: "string",
      required: true,
      description: `指定要下载的IDE类型。 可填写的值: "all", "cursor", "windsurf", "codebuddy", "claude-code", "cline", "gemini-cli", "opencode", "qwen-code", "baidu-comate", "openai-codex-cli", "augment-code", "github-copilot", "roocode", "tongyi-lingma", "trae", "qoder", "antigravity", "vscode", "kiro", "aider", "iflow-cli"`,
    },
    {
      name: "overwrite",
      type: "boolean",
      description: `是否覆盖已存在的文件，默认为false（不覆盖）`,
    }
  ]}
/>

---

### `searchWeb`
使用联网来进行信息检索，如查询最新的新闻、文章、股价、天气等。支持自然语言查询，也可以直接输入网址获取网页内容

#### 参数

<ParameterTable
  parameters={[
    {
      name: "query",
      type: "string",
      required: true,
      description: `搜索关键词、问题或网址，支持自然语言`,
    }
  ]}
/>

---

### `searchKnowledgeBase`
云开发知识库智能检索工具，支持向量查询 (vector)、固定技能文档 (skill)、OpenAPI 文档 (openapi) 和 CloudBase 官方文档 (docs) 查询。

      强烈推荐始终优先使用固定技能文档 (skill)、OpenAPI 文档 (openapi) 或 CloudBase 官方文档 (docs) 模式进行检索，仅当固定文档无法覆盖你的问题时，再使用向量查询 (vector) 模式。

      ⚠️ 重要：当 CloudBase skills 处于禁用状态或当前 IDE 不支持 skill 文件读取时，必须使用 searchKnowledgeBase(mode=skill, skillName=...) 来获取 CloudBase 技能文档内容，而不是尝试直接读取 skill 文件。直接读取可能返回 400 错误。示例：
      - 需要 auth-tool 指南时：searchKnowledgeBase(mode=skill, skillName=auth-tool)
      - 需要 auth-web 指南时：searchKnowledgeBase(mode=skill, skillName=auth-web)
      - 需要 cloudbase-agent 指南时：searchKnowledgeBase(mode=skill, skillName=cloudbase-agent)

      固定技能文档 (skill) 查询当前支持 23 个固定文档，分别是：
      文档名：ai-model-nodejs 文档介绍：Use this skill when developing Node.js backend services or CloudBase cloud functions (Express/Koa/NestJS, serverless, backend APIs) that need CloudBase AI managed model capabilities via @cloudbase/node-sdk ≥3.16.0. It covers generateText, streamText, and CloudBase-managed generateImage(); within the CloudBase SDK family, Node SDK is the only SDK that exposes managed image generation. Do NOT use this skill when the user explicitly wants to call Tencent Cloud / Hunyuan model APIs directly, use separate cloud-side quotas or billing, or avoid the CloudBase AI managed access layer. Not for browser/Web apps (use ai-model-web) or WeChat Mini Program (use ai-model-wechat).
文档名：ai-model-web 文档介绍：Use this skill when developing browser/Web applications (React/Vue/Angular, static websites, SPAs) that need AI capabilities. Features text generation (generateText) and streaming (streamText) via @cloudbase/js-sdk. Built-in models include Hunyuan (hunyuan-2.0-instruct-20251111 recommended) and DeepSeek (deepseek-v3.2 recommended). NOT for Node.js backend (use ai-model-nodejs), WeChat Mini Program (use ai-model-wechat), or image generation (Node SDK only).
文档名：ai-model-wechat 文档介绍：Use this skill when developing WeChat Mini Programs (小程序, 企业微信小程序, wx.cloud-based apps) that need AI capabilities. Features text generation (generateText) and streaming (streamText) with callback support (onText, onEvent, onFinish) via wx.cloud.extend.AI. Built-in models include Hunyuan (hunyuan-2.0-instruct-20251111 recommended) and DeepSeek (deepseek-v3.2 recommended). API differs from JS/Node SDK - streamText requires data wrapper, generateText returns raw response. NOT for browser/Web apps (use ai-model-web), Node.js backend (use ai-model-nodejs), or image generation (not supported).
文档名：auth-nodejs 文档介绍：CloudBase Node SDK auth guide for server-side identity, user lookup, and custom login tickets. This skill should be used when Node.js code must read caller identity, inspect end users, or bridge an existing user system into CloudBase; not when configuring providers or building client login UI.
文档名：auth-tool 文档介绍：CloudBase auth provider configuration and login-readiness guide. This skill should be used when users need to inspect, enable, disable, or configure auth providers, publishable-key prerequisites, login methods, SMS/email sender setup, or other provider-side readiness before implementing a client or backend auth flow.
文档名：auth-web 文档介绍：CloudBase Web Authentication Quick Guide for frontend integration after auth-tool has already been checked. Provides concise and practical Web authentication solutions with multiple login methods and complete user management.
文档名：auth-wechat 文档介绍：CloudBase WeChat Mini Program native authentication guide. This skill should be used when users need mini program identity handling, OPENID/UNIONID access, or `wx.cloud` auth behavior in projects where login is native and automatic.
文档名：cloud-functions 文档介绍：CloudBase function runtime guide for building, deploying, and debugging your own Event Functions or HTTP Functions. This skill should be used when users need application runtime code on CloudBase, not when they are merely calling CloudBase official platform APIs.
文档名：cloud-storage-web 文档介绍：Complete guide for CloudBase cloud storage using Web SDK (@cloudbase/js-sdk) - upload, download, temporary URLs, file management, and best practices.
文档名：cloudbase-agent 文档介绍：Build and deploy AI agents with CloudBase Agent SDK (TypeScript & Python). Implements the AG-UI protocol for streaming agent-UI communication. Use when deploying agent servers, using LangGraph/LangChain/CrewAI adapters, building custom adapters, understanding AG-UI protocol events, or building web/mini-program UI clients. Supports both TypeScript (@cloudbase/agent-server) and Python (cloudbase-agent-server via FastAPI).
文档名：cloudbase-platform 文档介绍：CloudBase platform overview and routing guide. This skill should be used when users need high-level capability selection, platform concepts, console navigation, or cross-platform best practices before choosing a more specific implementation skill.
文档名：cloudrun-development 文档介绍：CloudBase Run backend development rules (Function mode/Container mode). Use this skill when deploying backend services that require long connections, multi-language support, custom environments, or AI agent development.
文档名：data-model-creation 文档介绍：Optional advanced tool for complex data modeling. For simple table creation, use relational-database-tool directly with SQL statements.
文档名：http-api 文档介绍：CloudBase official HTTP API client guide. This skill should be used when backends, scripts, or non-SDK clients must call CloudBase platform APIs over raw HTTP instead of using a platform SDK or MCP management tool.
文档名：miniprogram-development 文档介绍：WeChat Mini Program development skill for building, debugging, previewing, testing, publishing, and optimizing mini program projects. This skill should be used when users ask to create, develop, modify, debug, preview, test, deploy, publish, launch, review, or optimize WeChat Mini Programs, mini program pages, components, `tabBar`, routing, navigation, icon assets, project structure, project configuration, `project.config.json`, `appid` setup, device preview, real-device validation, WeChat Developer Tools workflows, `miniprogram-ci` preview/upload flows, or mini program release processes. It should also be used when users explicitly mention CloudBase, `wx.cloud`, Tencent CloudBase, 腾讯云开发, or 云开发 in a mini program project.
文档名：no-sql-web-sdk 文档介绍：Use CloudBase document database Web SDK to query, create, update, and delete data. Supports complex queries, pagination, aggregation, realtime, and geolocation queries.
文档名：no-sql-wx-mp-sdk 文档介绍：Use CloudBase document database WeChat MiniProgram SDK to query, create, update, and delete data. Supports complex queries, pagination, aggregation, and geolocation queries.
文档名：ops-inspector 文档介绍：AIOps-style one-click inspection skill for CloudBase resources. Use this skill when users need to diagnose errors, check resource health, inspect logs, or run a comprehensive health check across cloud functions, CloudRun services, databases, and other CloudBase resources.
文档名：relational-database-tool 文档介绍：This is the required documentation for agents operating on the CloudBase Relational Database through MCP. It defines the canonical SQL management flow with `querySqlDatabase`, `manageSqlDatabase`, `queryPermissions`, and `managePermissions`, including MySQL provisioning, destroy flow, async status checks, safe query execution, schema initialization, and permission updates.
文档名：relational-database-web 文档介绍：Use when building frontend Web apps that talk to CloudBase Relational Database via @cloudbase/js-sdk – provides the canonical init pattern so you can then use Supabase-style queries from the browser.
文档名：spec-workflow 文档介绍：Use when medium-to-large changes need explicit requirements, technical design, and task planning before implementation, especially for multi-module work, unclear acceptance criteria, or architecture-heavy requests.
文档名：ui-design 文档介绍：Use when users need visual direction, interface hierarchy, layout decisions, design specifications, or prototypes before implementing a Web or mini program UI.
文档名：web-development 文档介绍：Use when users need to implement, integrate, debug, build, deploy, or validate a Web frontend after the product direction is already clear, especially for React, Vue, Vite, browser flows, or CloudBase Web integration.

      OpenAPI 文档 (openapi) 查询当前支持 5 个 API 文档，分别是：
      API名：functions API介绍：Cloud Functions API - 云函数 HTTP API
API名：storage API介绍：Storage API - 云存储 HTTP API
API名：mysqldb API介绍：MySQL RESTful API - 云开发 MySQL 数据库 HTTP API
API名：auth API介绍：Authentication API - 身份认证 HTTP API
API名：cloudrun API介绍：CloudRun API - 云托管服务 HTTP API

#### 参数

<ParameterTable
  parameters={[
    {
      name: "mode",
      type: "string",
      required: true,
      description: ` 可填写的值: "vector", "skill", "openapi", "docs"`,
    },
    {
      name: "skillName",
      type: "string",
      description: `mode=skill 时指定。技能名称。 可填写的值: "ai-model-nodejs", "ai-model-web", "ai-model-wechat", "auth-nodejs", "auth-tool", "auth-web", "auth-wechat", "cloud-functions", "cloud-storage-web", "cloudbase-agent", "cloudbase-platform", "cloudrun-development", "data-model-creation", "http-api", "miniprogram-development", "no-sql-web-sdk", "no-sql-wx-mp-sdk", "ops-inspector", "relational-database-tool", "relational-database-web", "spec-workflow", "ui-design", "web-development"`,
    },
    {
      name: "apiName",
      type: "string",
      description: `mode=openapi 时指定。API 名称。 可填写的值: "functions", "storage", "mysqldb", "auth", "cloudrun"`,
    },
    {
      name: "action",
      type: "string",
      description: `mode=docs 时指定。CloudBase 文档操作类型：listModules=列出所有文档模块，listModuleDocs=获取指定模块的目录结构，findByName=按名称/路径/URL 智能查找，readDoc=读取指定文档 Markdown，searchDocs=全文搜索官方文档。 可填写的值: "listModules", "listModuleDocs", "findByName", "readDoc", "searchDocs"`,
    },
    {
      name: "moduleName",
      type: "string",
      description: `mode=docs 且 action=listModuleDocs 时指定。模块名称。`,
    },
    {
      name: "input",
      type: "string",
      description: `mode=docs 且 action=findByName 时指定。支持模块名、文档标题、层级路径或 URL。`,
    },
    {
      name: "docPath",
      type: "string",
      description: `mode=docs 且 action=readDoc 时指定。文档相对路径或完整 URL。`,
    },
    {
      name: "query",
      type: "string",
      description: `mode=docs 且 action=searchDocs 时指定。全文检索关键词。`,
    },
    {
      name: "threshold",
      type: "number",
      description: `mode=vector 时指定。相似性检索阈值`,
    },
    {
      name: "id",
      type: "string",
      description: `mode=vector 时指定。知识库范围，默认 cloudbase。cloudbase=云开发全量知识，scf=云开发的云函数知识, miniprogram=小程序知识（不包含云开发与云函数知识） 可填写的值: "cloudbase", "scf", "miniprogram"`,
    },
    {
      name: "content",
      type: "string",
      description: `mode=vector 时指定。检索内容`,
    },
    {
      name: "options",
      type: "object",
      description: `mode=vector 时指定。其他选项`,
      children: [
        {
          name: "chunkExpand",
          type: "array of number",
          description: `指定返回的文档内容的展开长度,例如 [3,3]代表前后展开长度`,
        }
      ],
    },
    {
      name: "limit",
      type: "number",
      description: `mode=vector 时指定。指定返回最相似的 Top K 的 K 的值`,
    }
  ]}
/>

---

### `queryCloudRun`
查询云托管服务信息，支持获取服务列表、查询服务详情、获取可用模板列表和部署日志。返回的服务信息包括服务名称、状态、访问类型、配置详情以及最近部署上下文。

#### 参数

<ParameterTable
  parameters={[
    {
      name: "action",
      type: "string",
      required: true,
      description: `查询操作类型：list=获取云托管服务列表（支持分页和筛选），detail=查询指定服务的详细信息（包含服务配置和最新部署状态），templates=获取可用的项目模板列表（用于初始化新项目），getDeployLog=获取指定服务最近一次或指定构建的部署日志 可填写的值: "list", "detail", "templates", "getDeployLog"`,
    },
    {
      name: "pageSize",
      type: "number",
      description: `分页大小，控制每页返回的服务数量。取值范围：1-100，默认值：10。建议根据网络性能和显示需求调整`,
    },
    {
      name: "pageNum",
      type: "number",
      description: `页码，用于分页查询。从1开始，默认值：1。配合pageSize使用可实现分页浏览`,
    },
    {
      name: "serverName",
      type: "string",
      description: `服务名称筛选条件，支持模糊匹配。例如：输入"test"可匹配"test-service"、"my-test-app"等服务名称。留空则查询所有服务`,
    },
    {
      name: "serverType",
      type: "string",
      description: `服务类型筛选条件：function=函数型云托管（仅支持Node.js，有特殊的开发要求和限制，适合简单的API服务），container=容器型服务（推荐使用，支持任意语言和框架如Java/Go/Python/PHP/.NET等，适合大多数应用场景） 可填写的值: "function", "container"`,
    },
    {
      name: "detailServerName",
      type: "string",
      description: `要查询详细信息或部署日志的服务名称。当action为detail或getDeployLog时建议提供，必须是已存在的服务名称。可通过list操作获取可用的服务名称列表`,
    },
    {
      name: "buildId",
      type: "number",
      description: `构建ID，仅在action=getDeployLog时使用。不传时默认返回最近一次部署的构建日志`,
    }
  ]}
/>

---

### `manageCloudRun`
管理云托管服务，按开发顺序支持：初始化项目（可从模板开始，模板列表可通过 queryCloudRun 查询）、下载服务代码、本地运行（仅函数型服务）、部署代码、删除服务。部署可配置CPU、内存、实例数、访问类型等参数。删除操作需要确认，建议设置force=true。

#### 参数

<ParameterTable
  parameters={[
    {
      name: "action",
      type: "string",
      required: true,
      description: `云托管服务管理操作类型：init=从模板初始化新的云托管项目代码（在targetPath目录下创建以serverName命名的子目录，支持多种语言和框架模板），download=从云端下载现有服务的代码到本地进行开发，run=在本地运行函数型云托管服务（用于开发和调试，仅支持函数型服务），deploy=将本地代码部署到云端云托管服务（支持函数型和容器型），delete=删除指定的云托管服务（不可恢复，需要确认），createAgent=创建函数型Agent（基于函数型云托管开发AI智能体） 可填写的值: "init", "download", "run", "deploy", "delete", "createAgent"`,
    },
    {
      name: "serverName",
      type: "string",
      required: true,
      description: `云托管服务名称，用于标识和管理服务。命名规则：支持大小写字母、数字、连字符和下划线，必须以字母开头，长度3-45个字符。在init操作中会作为在targetPath下创建的子目录名，在其他操作中作为目标服务名`,
    },
    {
      name: "targetPath",
      type: "string",
      description: `本地代码路径，必须是绝对路径。在deploy操作中指定要部署的代码目录，在download操作中指定下载目标目录，在init操作中指定云托管服务的上级目录（会在该目录下创建以serverName命名的子目录）。建议约定：项目根目录下的cloudrun/目录，例如：/Users/username/projects/my-project/cloudrun`,
    },
    {
      name: "serverConfig",
      type: "object",
      description: `服务配置项，用于部署时设置服务的运行参数。包括资源规格、访问权限、环境变量等配置。不提供时使用默认配置`,
      children: [
        {
          name: "OpenAccessTypes",
          type: "array of string",
          description: `公网访问类型配置，控制服务的访问权限：OA=办公网访问，PUBLIC=公网访问（默认，可通过HTTPS域名访问），MINIAPP=小程序访问，VPC=VPC访问（仅同VPC内可访问）。可配置多个类型`,
        },
        {
          name: "Cpu",
          type: "number",
          description: `CPU规格配置，单位为核。可选值：0.25、0.5、1、2、4、8等。注意：内存规格必须是CPU规格的2倍（如CPU=0.25时内存=0.5，CPU=1时内存=2）。影响服务性能和计费`,
        },
        {
          name: "Mem",
          type: "number",
          description: `内存规格配置，单位为GB。可选值：0.5、1、2、4、8、16等。注意：必须是CPU规格的2倍。影响服务性能和计费`,
        },
        {
          name: "MinNum",
          type: "number",
          description: `最小实例数配置，控制服务的最小运行实例数量。设置为0时支持缩容到0（无请求时不产生费用），设置为大于0时始终保持指定数量的实例运行（确保快速响应但会增加成本）。建议设置为1以降低冷启动延迟，提升用户体验`,
        },
        {
          name: "MaxNum",
          type: "number",
          description: `最大实例数配置，控制服务的最大运行实例数量。当请求量增加时，服务最多可以扩展到指定数量的实例，超过此数量后将拒绝新的请求。建议根据业务峰值设置`,
        },
        {
          name: "PolicyDetails",
          type: "array of object",
          description: `扩缩容配置数组，用于配置服务的自动扩缩容策略。可配置多个扩缩容策略`,
          children: [
            {
              name: "PolicyType",
              type: "string",
              required: true,
              description: `扩缩容类型：cpu=基于CPU使用率扩缩容，mem=基于内存使用率扩缩容，cpu/mem=基于CPU和内存使用率扩缩容 可填写的值: "cpu", "mem", "cpu/mem"`,
            },
            {
              name: "PolicyThreshold",
              type: "number",
              required: true,
              description: `扩缩容阈值，单位为百分比。如60表示当资源使用率达到60%时触发扩缩容`,
            }
          ],
        },
        {
          name: "CustomLogs",
          type: "string",
          description: `自定义日志配置，用于配置服务的日志收集和存储策略`,
        },
        {
          name: "Port",
          type: "number",
          description: `服务监听端口配置。函数型服务固定为3000，容器型服务可自定义。服务代码必须监听此端口才能正常接收请求`,
        },
        {
          name: "EnvParams",
          type: "string",
          description: `环境变量配置，JSON字符串格式。用于传递配置信息给服务代码，如'{"DATABASE_URL":"mysql://...","NODE_ENV":"production"}'。敏感信息建议使用环境变量而非硬编码`,
        },
        {
          name: "Dockerfile",
          type: "string",
          description: `Dockerfile文件名配置，仅容器型服务需要。指定用于构建容器镜像的Dockerfile文件路径，默认为项目根目录下的Dockerfile`,
        },
        {
          name: "BuildDir",
          type: "string",
          description: `构建目录配置，指定代码构建的目录路径。当代码结构与标准不同时使用，默认为项目根目录`,
        },
        {
          name: "InternalAccess",
          type: "string",
          description: `内网访问开关配置，控制是否启用内网访问。true=启用内网访问（可通过云开发SDK直接调用），false=关闭内网访问（仅公网访问）`,
        },
        {
          name: "InternalDomain",
          type: "string",
          description: `内网域名配置，用于配置服务的内网访问域名。仅在启用内网访问时有效`,
        },
        {
          name: "EntryPoint",
          type: "array of string",
          description: `Dockerfile EntryPoint参数配置，仅容器型服务需要。指定容器启动时的入口程序数组，如["node","app.js"]`,
        },
        {
          name: "Cmd",
          type: "array of string",
          description: `Dockerfile Cmd参数配置，仅容器型服务需要。指定容器启动时的默认命令数组，如["npm","start"]`,
        }
      ],
    },
    {
      name: "template",
      type: "string",
      description: `项目模板标识符，用于指定初始化项目时使用的模板。可通过queryCloudRun的templates操作获取可用模板列表。常用模板：helloworld=Hello World示例，nodejs=Node.js项目模板，python=Python项目模板等`,
    },
    {
      name: "runOptions",
      type: "object",
      description: `本地运行参数配置，仅函数型云托管服务支持。用于配置本地开发环境的运行参数，不影响云端部署`,
      children: [
        {
          name: "port",
          type: "number",
          description: `本地运行端口配置，仅函数型服务有效。指定服务在本地运行时监听的端口号，默认3000。确保端口未被其他程序占用`,
        },
        {
          name: "envParams",
          type: "object",
          description: `本地运行时的附加环境变量配置，用于本地开发和调试。格式为键值对，如{"DEBUG":"true","LOG_LEVEL":"debug"}。这些变量仅在本地运行时生效`,
        },
        {
          name: "runMode",
          type: "string",
          description: `运行模式：normal=普通函数模式，agent=Agent模式（用于AI智能体开发） 可填写的值: "normal", "agent"`,
        },
        {
          name: "agentId",
          type: "string",
          description: `Agent ID，在agent模式下使用，用于标识特定的Agent实例`,
        }
      ],
    },
    {
      name: "agentConfig",
      type: "object",
      description: `Agent配置项，仅在createAgent操作时使用`,
      children: [
        {
          name: "agentName",
          type: "string",
          required: true,
          description: `Agent名称，用于生成BotId`,
        },
        {
          name: "botTag",
          type: "string",
          description: `Bot标签，用于生成BotId，不提供时自动生成`,
        },
        {
          name: "description",
          type: "string",
          description: `Agent描述信息`,
        },
        {
          name: "template",
          type: "string",
          description: `Agent模板类型，默认为blank（空白模板）`,
        }
      ],
    },
    {
      name: "force",
      type: "boolean",
      description: `强制操作开关，用于跳过确认提示。默认false（需要确认），设置为true时跳过所有确认步骤。删除操作时强烈建议设置为true以避免误操作`,
    },
    {
      name: "serverType",
      type: "string",
      description: `服务类型配置：function=函数型云托管（仅支持Node.js，有特殊的开发要求和限制，适合简单的API服务），container=容器型服务（推荐使用，支持任意语言和框架如Java/Go/Python/PHP/.NET等，适合大多数应用场景）。不提供时自动检测：1)现有服务类型 2)有Dockerfile→container 3)有@cloudbase/aiagent-framework依赖→function 4)其他情况→container 可填写的值: "function", "container"`,
    }
  ]}
/>

---

### `queryGateway`
网关域统一只读入口。通过 action 查询网关域名、访问入口和目标暴露情况。

#### 参数

<ParameterTable
  parameters={[
    {
      name: "action",
      type: "string",
      required: true,
      description: `只读操作类型，例如 getAccess、listDomains 可填写的值: "getAccess", "listDomains", "listRoutes", "getRoute", "listCustomDomains"`,
    },
    {
      name: "targetType",
      type: "string",
      description: `目标资源类型。当前支持 function，后续可扩展 可填写的值: "function"`,
    },
    {
      name: "targetName",
      type: "string",
      description: `目标资源名称。getAccess 时必填`,
    },
    {
      name: "routeId",
      type: "string",
      description: `路由 ID。getRoute 时可选`,
    }
  ]}
/>

---

### `manageGateway`
网关域统一写入口。通过 action 创建目标访问入口，后续承接更通用的网关配置能力。为已存在的 HTTP 云函数补默认域名访问时，通常使用 createAccess 并提供 targetType="function"、targetName、type="HTTP" 与期望 path。注意 createAccess 只创建网关入口，不会自动修改函数资源权限。⚠️ 如需绑定带 SSL 证书的自定义域名供公网 HTTPS 访问，使用 action="bindCustomDomain"（需要 domain 和 certificateId 参数）；如需配置 CORS/安全域名（无证书），请使用 envDomainManagement 工具。

#### 参数

<ParameterTable
  parameters={[
    {
      name: "action",
      type: "string",
      required: true,
      description: `写操作类型，例如 createAccess。为已有函数补默认域名访问入口时使用 createAccess；若 action=createAccess 且 targetType=function，必须显式提供 type。 可填写的值: "createAccess", "createRoute", "updateRoute", "deleteRoute", "bindCustomDomain", "deleteCustomDomain", "deleteAccess", "updatePathAuth"`,
    },
    {
      name: "targetType",
      type: "string",
      description: `目标资源类型。当前支持 function，后续可扩展 可填写的值: "function"`,
    },
    {
      name: "targetName",
      type: "string",
      description: `目标资源名称。createAccess 到云函数时填写函数名`,
    },
    {
      name: "path",
      type: "string",
      description: `访问路径，默认 /{targetName}。例如为 HTTP 函数暴露 /api/hello 时传 /api/hello。该参数只创建网关入口，不会自动放开函数资源权限。`,
    },
    {
      name: "type",
      type: "string",
      description: `目标函数的运行时类型，不是接入协议。createAccess 到已创建的 HTTP 云函数时传 HTTP；给 Event 函数补网关访问时传 Event 或省略。省略会默认按 Event 路由处理，可能让 HTTP 云函数访问后返回 FUNCTION_PARAM_INVALID。 可填写的值: "Event", "HTTP"`,
    },
    {
      name: "auth",
      type: "boolean",
      description: `是否开启网关路径鉴权。若要走默认域名做匿名或浏览器访问，通常设为 false；该开关仅控制网关入口本身，不会修改函数资源权限，仍需检查并按需调整函数安全规则。`,
    },
    {
      name: "route",
      type: "object",
      description: `HTTP 路由配置对象`,
      children: [
        {
          name: "routeId",
          type: "string",
        },
        {
          name: "path",
          type: "string",
        },
        {
          name: "serviceType",
          type: "string",
        },
        {
          name: "serviceName",
          type: "string",
        },
        {
          name: "auth",
          type: "boolean",
        }
      ],
    },
    {
      name: "domain",
      type: "string",
      description: `自定义域名`,
    },
    {
      name: "certificateId",
      type: "string",
      description: `证书 ID`,
    },
    {
      name: "accessName",
      type: "string",
      description: `访问入口名称，保留字段`,
    }
  ]}
/>

---

### `queryAppAuth`
应用侧认证配置只读入口。用于查询登录方式、provider、publishable key、API key、client 配置和静态域名等认证准备状态。⚠️ 本工具为管理端配置查询工具，不执行用户登录。当任务要求编写客户端登录代码时（例如「用 JS SDK 登录」），应先通过本工具确认配置状态，再在项目代码中编写 @cloudbase/js-sdk 客户端登录代码（如 auth.signInWithPassword()），而非使用本工具完成登录。若业务要接受普通用户名样式标识符，先查询 action=getLoginConfig；若 usernamePassword=false，下一步应立即调用 manageAppAuth(action=patchLoginStrategy, patch=\{ usernamePassword: true \})，不要直接写 email 登录 API。

#### 参数

<ParameterTable
  parameters={[
    {
      name: "action",
      type: "string",
      required: true,
      description: ` 可填写的值: "getLoginConfig", "listProviders", "getProvider", "getClientConfig", "getPublishableKey", "getStaticDomain", "listApiKeys"`,
    },
    {
      name: "providerId",
      type: "string",
      description: `provider 标识，如 email、google`,
    },
    {
      name: "clientId",
      type: "string",
      description: `OAuth client_id / DescribeClient 的 Id；省略时默认使用当前环境 ID（默认客户端）`,
    },
    {
      name: "keyType",
      type: "string",
      description: `API key 类型过滤，可选 publish_key 或 api_key 可填写的值: "publish_key", "api_key"`,
    },
    {
      name: "pageNumber",
      type: "integer",
      description: `API key 列表页码，从 1 开始`,
    },
    {
      name: "pageSize",
      type: "integer",
      description: `API key 列表每页条数`,
    }
  ]}
/>

---

### `manageAppAuth`
应用侧认证配置写入口。用于修改登录方式、provider、client 配置，确保 publishable key，以及创建或删除 API key、自定义登录密钥。⚠️ 本工具为管理端配置工具，不执行用户登录。当任务要求编写客户端登录代码时（例如「用 JS SDK 登录」），应先通过本工具完成配置（如启用 usernamePassword、获取 publishable key），再在项目代码中编写 @cloudbase/js-sdk 客户端登录代码（如 auth.signInWithPassword()），而非使用本工具完成登录。若前端要接受普通用户名样式标识符，应先执行 action=patchLoginStrategy 并传入 patch=\{ usernamePassword: true \}，再实现对应前端登录逻辑。

#### 参数

<ParameterTable
  parameters={[
    {
      name: "action",
      type: "string",
      required: true,
      description: ` 可填写的值: "patchLoginStrategy", "addProvider", "updateProvider", "deleteProvider", "updateClientConfig", "ensurePublishableKey", "createApiKey", "deleteApiKey", "createCustomLoginKeys"`,
    },
    {
      name: "patch",
      type: "object",
      description: `patchLoginStrategy 使用的简化登录策略 patch，如 { usernamePassword: true }`,
    },
    {
      name: "providerId",
      type: "string",
      description: `provider 标识，如 email、google；addProvider 时也可作为自定义 provider Id`,
    },
    {
      name: "providerType",
      type: "string",
      description: `addProvider 时的 provider 协议类型，如 OAUTH、OIDC、EMAIL`,
    },
    {
      name: "displayName",
      type: "union",
      description: `addProvider 时的展示名称，可传字符串或多语言对象`,
    },
    {
      name: "clientId",
      type: "string",
      description: `updateClientConfig 时的客户端 Id；省略时默认使用当前环境 ID`,
    },
    {
      name: "config",
      type: "object",
      description: `provider / client 的配置对象`,
    },
    {
      name: "keyType",
      type: "string",
      description: `createApiKey 时的 API key 类型，默认 publish_key 可填写的值: "publish_key", "api_key"`,
    },
    {
      name: "keyName",
      type: "string",
      description: `createApiKey 时的 API key 名称`,
    },
    {
      name: "expireIn",
      type: "integer",
      description: `createApiKey 时的有效期，单位秒；0 表示不过期`,
    },
    {
      name: "keyId",
      type: "string",
      description: `deleteApiKey 时的 API key 唯一标识`,
    }
  ]}
/>

---

### `queryPermissions`
权限域统一只读入口。支持查询资源权限、角色列表/详情、应用用户列表/详情。

#### 参数

<ParameterTable
  parameters={[
    {
      name: "action",
      type: "string",
      required: true,
      description: ` 可填写的值: "getResourcePermission", "listResourcePermissions", "listRoles", "getRole", "listUsers", "getUser"`,
    },
    {
      name: "resourceType",
      type: "string",
      description: ` 可填写的值: "noSqlDatabase", "sqlDatabase", "function", "storage"`,
    },
    {
      name: "resourceId",
      type: "string",
    },
    {
      name: "resourceIds",
      type: "array of string",
    },
    {
      name: "roleId",
      type: "string",
    },
    {
      name: "roleIdentity",
      type: "string",
    },
    {
      name: "roleName",
      type: "string",
    },
    {
      name: "uid",
      type: "string",
    },
    {
      name: "username",
      type: "string",
    },
    {
      name: "pageNo",
      type: "number",
    },
    {
      name: "pageSize",
      type: "number",
    }
  ]}
/>

---

### `managePermissions`
权限域统一写入口。支持修改资源权限、角色管理、成员与策略增删、应用用户 CRUD。`createUser` / `updateUser` 是环境侧应用用户管理能力，适合测试账号、管理员或预置用户，不应替代浏览器里的 Web SDK 注册表单；前端用户名密码注册应使用 `auth.signUp(\{ username, password \})`，登录应使用 `auth.signInWithPassword(\{ username, password \})`。注意：`securityRule` 的详细语义取决于 `resourceType`；`doc._openid`、`auth.openid`、查询条件子集校验，以及 `create` / `update` / `delete` JSON 模板仅适用于 `resourceType="noSqlDatabase"` 的文档数据库安全规则。配置 `function` 或 `storage` 时，请参考各自官方安全规则文档，而不是复用 NoSQL 模板。

#### 参数

<ParameterTable
  parameters={[
    {
      name: "action",
      type: "string",
      required: true,
      description: ` 可填写的值: "updateResourcePermission", "createRole", "updateRole", "deleteRoles", "addRoleMembers", "removeRoleMembers", "addRolePolicies", "removeRolePolicies", "createUser", "updateUser", "deleteUsers"`,
    },
    {
      name: "resourceType",
      type: "string",
      description: `目标资源类型。\`securityRule\` 的具体语义依赖这个值；\`noSqlDatabase\` 使用集合安全规则，\`function\` 与 \`storage\` 也有各自独立的安全规则语义，不要套用 NoSQL 规则语法。 可填写的值: "noSqlDatabase", "sqlDatabase", "function", "storage"`,
    },
    {
      name: "resourceId",
      type: "string",
    },
    {
      name: "permission",
      type: "string",
      description: ` 可填写的值: "READONLY", "PRIVATE", "ADMINWRITE", "ADMINONLY", "CUSTOM"`,
    },
    {
      name: "securityRule",
      type: "string",
      description: `资源类型特定的规则内容，详细语义依赖 \`resourceType\`。当 \`resourceType="noSqlDatabase"\` 且 \`permission="CUSTOM"\` 时，应传文档数据库安全规则 JSON（文档型数据库规则：\`https://docs.cloudbase.net/database/security-rules\`）；键通常为 \`read\` / \`create\` / \`update\` / \`delete\`，值为表达式。重要：\`create\` 规则验证写入数据，此时文档尚不存在，不能使用 \`doc.*\`；\`read\` / \`update\` / \`delete\` 规则可使用 \`doc.*\` 引用已有文档字段。不要把 \`doc._openid\`、\`auth.openid\`、查询条件子集校验或 \`create\` / \`update\` / \`delete\` 模板误用于 \`function\`、\`storage\` 或 \`sqlDatabase\`。如需配置 \`function\` 或 \`storage\`，请改查官方安全规则文档：云函数 \`https://docs.cloudbase.net/cloud-function/security-rules\`，云存储 \`https://docs.cloudbase.net/storage/security-rules\`。示例：{"read":"auth.uid != null","create":"auth.uid != null && auth.loginType != "ANONYMOUS"","update":"auth.uid != null && doc._openid == auth.openid","delete":"auth.uid != null && doc._openid == auth.openid"}`,
    },
    {
      name: "roleId",
      type: "string",
    },
    {
      name: "roleIds",
      type: "array of string",
    },
    {
      name: "roleName",
      type: "string",
    },
    {
      name: "roleIdentity",
      type: "string",
    },
    {
      name: "description",
      type: "string",
    },
    {
      name: "memberUids",
      type: "array of string",
    },
    {
      name: "policies",
      type: "array of object",
    },
    {
      name: "uid",
      type: "string",
    },
    {
      name: "uids",
      type: "array of string",
    },
    {
      name: "username",
      type: "string",
    },
    {
      name: "password",
      type: "string",
    },
    {
      name: "userStatus",
      type: "string",
      description: ` 可填写的值: "ACTIVE", "BLOCKED"`,
    }
  ]}
/>

---

### `queryLogs`
日志域统一只读入口。支持检查日志服务状态并搜索 CLS 日志。

#### 参数

<ParameterTable
  parameters={[
    {
      name: "action",
      type: "string",
      required: true,
      description: ` 可填写的值: "checkLogService", "searchLogs"`,
    },
    {
      name: "queryString",
      type: "string",
    },
    {
      name: "service",
      type: "string",
      description: ` 可填写的值: "tcb", "tcbr"`,
    },
    {
      name: "startTime",
      type: "string",
    },
    {
      name: "endTime",
      type: "string",
    },
    {
      name: "limit",
      type: "number",
    },
    {
      name: "context",
      type: "string",
    },
    {
      name: "sort",
      type: "string",
      description: ` 可填写的值: "asc", "desc"`,
    }
  ]}
/>

---

### `queryAgents`
Agent 域统一只读入口。支持列表、详情与日志查询。

#### 参数

<ParameterTable
  parameters={[
    {
      name: "action",
      type: "string",
      required: true,
      description: ` 可填写的值: "listAgents", "getAgent", "getAgentLogs"`,
    },
    {
      name: "agentId",
      type: "string",
    },
    {
      name: "pageNumber",
      type: "number",
    },
    {
      name: "pageSize",
      type: "number",
    },
    {
      name: "params",
      type: "object",
    }
  ]}
/>

---

### `manageAgents`
Agent 域统一写入口。支持创建、更新和删除远端 Agent。

#### 参数

<ParameterTable
  parameters={[
    {
      name: "action",
      type: "string",
      required: true,
      description: ` 可填写的值: "createAgent", "updateAgent", "deleteAgent"`,
    },
    {
      name: "agentId",
      type: "string",
    },
    {
      name: "params",
      type: "object",
    }
  ]}
/>

---

### `downloadRemoteFile`
下载远程文件到项目根目录下的指定相对路径。例如：小程序的 Tabbar 等素材图片，必须使用 **png** 格式，可以从 Unsplash、wikimedia【一般选用 500 大小即可、Pexels、Apple 官方 UI 等资源中选择来下载。

#### 参数

<ParameterTable
  parameters={[
    {
      name: "url",
      type: "string",
      required: true,
      description: `远程文件的 URL 地址`,
    },
    {
      name: "relativePath",
      type: "string",
      required: true,
      description: `相对于项目根目录的路径，例如：'assets/images/logo.png' 或 'docs/api.md'。不允许使用 ../ 等路径遍历操作。`,
    }
  ]}
/>

---

### `activateInviteCode`
云开发 AI编程激励计划，通过邀请码激活用户激励。

#### 参数

<ParameterTable
  parameters={[
    {
      name: "InviteCode",
      type: "string",
      required: true,
      description: `待激活的邀请码`,
    }
  ]}
/>

---

### `callCloudApi`
通用的云 API 调用工具，主要用于 CloudBase / 腾讯云管控面与依赖资源相关 API 调用。调用前请先确认 service、Action 与 Param，避免猜测 Action 名称。如果你的目标是通过 HTTP 协议直接集成 auth/functions/cloudrun/storage/mysqldb 等 CloudBase 业务 API，请不要优先使用 callCloudApi，而应优先查看对应 OpenAPI / Swagger。现有 OpenAPI / Swagger 能力不是通用的管控面 Action 集合；管控面 API 请优先参考 CloudBase API 概览 https://cloud.tencent.com/document/product/876/34809 与云开发依赖资源接口指引 https://cloud.tencent.com/document/product/876/34808。对于 tcb service，常用 Action 分类如下：

**环境管理**: `CreateEnv`、`ModifyEnv`、`DescribeEnvs`、`DestroyEnv`
**用户管理**: `CreateUser`、`ModifyUser`、`DescribeUserList`、`DeleteUsers`
**认证配置**: `EditAuthConfig`、`DescribeAuthDomains`
**云函数**: `DescribeFunctions`、`CreateFunction`、`UpdateFunctionCode`、`DeleteFunction`
**数据库**: `CreateMySQLInstance`、`DescribeMySQLInstances`、`DestroyMySQLInstance`

销毁环境时，常见做法是至少带上 `EnvId` 和 `BypassCheck: true`，如果环境已经处于隔离期再按文档补 `IsForce: true`。

#### 参数

<ParameterTable
  parameters={[
    {
      name: "service",
      type: "string",
      required: true,
      description: `选择要访问的服务。可选：tcb、scf、sts、cam、lowcode、cdn、vpc。对于 tcb / scf / lowcode 等 CloudBase 管控面 Action，请优先查官方文档，不要直接猜测 Action。 可填写的值: "tcb", "scf", "sts", "cam", "lowcode", "cdn", "vpc"`,
    },
    {
      name: "action",
      type: "string",
      required: true,
      description: `具体 Action 名称，需符合对应服务的官方 API 定义。若不确定正确 Action，请先查官方文档；不要用近义词或历史命名进行猜测。tcb 常用 Action：环境管理 CreateEnv/ModifyEnv/DescribeEnvs/DestroyEnv、用户管理 CreateUser/ModifyUser/DescribeUserList/DeleteUsers、认证配置 EditAuthConfig、云函数 DescribeFunctions/CreateFunction、数据库 CreateMySQLInstance 等。`,
    },
    {
      name: "params",
      type: "object",
      description: `Action 对应的参数对象，键名需与官方 API 定义一致。某些 Action 需要携带 EnvId 等信息；如不确定参数结构，请先查官方文档。tcb 示例：\`{ "service": "tcb", "action": "DestroyEnv", "params": { "EnvId": "env-xxx", "BypassCheck": true } }\`，如果环境已经处于隔离期，可再补 \`IsForce: true\`；更新环境别名则可用 \`{ "service": "tcb", "action": "ModifyEnv", "params": { "EnvId": "env-xxx", "Alias": "demo" } }\`。若你的场景是通过 HTTP 协议直接集成 auth/functions/cloudrun/storage/mysqldb 等 CloudBase 业务 API，请优先使用 OpenAPI / Swagger 或 searchKnowledgeBase(mode="openapi")，而不是优先使用 callCloudApi。`,
    }
  ]}
/>

---
