[API 中心](/document/api)

## 执行MySQL语句

最近更新时间：2026-03-13 02:04:35

-   微信扫一扫 
-   QQ
-   新浪微博
-   复制链接
    
    链接复制成功
    

_我的收藏_

## 1\. 接口描述

接口请求域名： tcb.tencentcloudapi.com 。

执行MySQL语句

该接口用来执行 MySql 语句，比如创建表格、插入数据、修改数据、删除字段、添加索引等可以通过sql 语句实现的都可以使用该接口

调用该接口前需要先查询Mysql是否开通，可通过 [DescribeCreateMySQLResult](https://cloud.tencent.com/document/api/876/128185) 查询，只有开通成功才能操作

默认接口请求频率限制：20次/秒。

推荐使用 API Explorer

[点击调试](https://console.cloud.tencent.com/api/explorer?Product=tcb&Version=2018-06-08&Action=RunSql)

API Explorer 提供了在线调用、签名验证、SDK 代码生成和快速检索接口等能力。您可查看每次调用的请求内容和返回结果以及自动生成 SDK 调用示例。

## 2\. 输入参数

以下请求参数列表仅列出了接口请求参数和部分公共参数，完整公共参数列表见 [公共请求参数](/document/api/876/34812) 。

| 参数名称 | 必选 | 类型 | 描述 |
| --- | --- | --- | --- |
| Action | 是 | String | [公共参数](/document/api/876/34812) ，本接口取值：RunSql。 |
| Version | 是 | String | [公共参数](/document/api/876/34812) ，本接口取值：2018-06-08。 |
| Region | 否 | String | [公共参数](/document/api/876/34812) ，本接口不需要传递此参数。 |
| Sql | 是 | String | 要执行的SQL语句  
示例值：CREATE TABLE users (id BIGINT PRIMARY KEY AUTO\_INCREMENT) |
| EnvId | 是 | String | 云开发环境ID  
示例值：lowcode-2gx6pjs59ddd3cea |
| DbInstance | 否 | [DbInstance](/document/api/876/34822#DbInstance) | 数据库连接器实例信息 |
| ReadOnly | 否 | Boolean | 是否只读；当 `true` 时仅允许以 `SELECT/WITH/SHOW/DESCRIBE/DESC/EXPLAIN` 开头的 SQL  
示例值：false |

## 3\. 输出参数

| 参数名称 | 类型 | 描述 |
| --- | --- | --- |
| Items | Array of String | 查询结果行，每个元素为 JSON 字符串  
示例值：\["{"Collation":null,"Comment":"主键ID","Default":null,"Extra":"auto\_increment","Field":"id","Key":"PRI","Null":"NO","Privileges":"select,insert,update,references","Type":"bigint(20)"}"\] |
| Infos | Array of String | 列元数据信息，每个元素为 JSON 字符串，字段包含 `name/databaseType/nullable/length/precision/scale`  
示例值：\["{"databaseType":"VARCHAR","length":0,"name":"Field","nullable":false,"precision":0,"scale":0}"\] |
| RowsAffected | Integer | 受影响的行数（INSERT/UPDATE/DELETE 等语句）  
示例值：0 |
| RequestId | String | 唯一请求 ID，由服务端生成，每次请求都会返回（若请求因其他原因未能抵达服务端，则该次请求不会获得 RequestId）。定位问题时需要提供该次请求的 RequestId。 |

## 4\. 示例

### 示例1 创建数据表

#### 输入示例

```
POST / HTTP/1.1
Host: tcb.tencentcloudapi.com
Content-Type: application/json
X-TC-Action: RunSql
<公共请求参数>

{
    "EnvId": "lowcode-2gqvfid5936609f4",
    "Sql": "\n    CREATE TABLE `demo_users` (\n        `id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',\n        `username` VARCHAR(64) NOT NULL COMMENT '用户名',\n        `email` VARCHAR(128) NULL COMMENT '邮箱',\n        `status` TINYINT NOT NULL DEFAULT 1 COMMENT '状态：1-正常，0-禁用',\n        `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',\n        `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',\n        PRIMARY KEY (`id`),\n        UNIQUE KEY `uk_username` (`username`)\n    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户表'\n    ",
    "DbInstance": {
        "EnvId": "lowcode-2gqvfid5936609f4",
        "InstanceId": "",
        "Schema": "lowcode-2gqvfid5936609f4"
    }
}
```

#### 输出示例

```json
{
    "Response": {
        "RequestId": "71aab888-21a1-4871-99d7-de6d418b4558",
        "Infos": [],
        "Items": [],
        "RowsAffected": 0
    }
}
```

### 示例2 添加索引

#### 输入示例

```
POST / HTTP/1.1
Host: tcb.tencentcloudapi.com
Content-Type: application/json
X-TC-Action: RunSql
<公共请求参数>

{
    "EnvId": "lowcode-2gqvfid5936609f4",
    "Sql": "ALTER TABLE `demo_users` ADD INDEX `idx_email` (`email`)",
    "DbInstance": {
        "EnvId": "lowcode-2gqvfid5936609f4",
        "InstanceId": "",
        "Schema": "lowcode-2gqvfid5936609f4"
    }
}
```

#### 输出示例

```json
{
    "Response": {
        "RequestId": "aacad0bc-4107-4ddf-bd08-b401a925bb78",
        "RowsAffected": 0,
        "Infos": [],
        "Items": []
    }
}
```

### 示例3 查询表结构

#### 输入示例

```
POST / HTTP/1.1
Host: tcb.tencentcloudapi.com
Content-Type: application/json
X-TC-Action: RunSql
<公共请求参数>

{
    "EnvId": "lowcode-2gqvfid5936609f4",
    "Sql": "SHOW FULL COLUMNS FROM `lowcode-2gqvfid5936609f4`.`demo_users`",
    "DbInstance": {
        "EnvId": "lowcode-2gqvfid5936609f4",
        "InstanceId": "",
        "Schema": "lowcode-2gqvfid5936609f4"
    }
}
```

#### 输出示例

```json
{
    "Response": {
        "RequestId": "b84801f8-439d-4fa6-885c-3011ab9cc3a0",
        "Infos": [
            "{\"databaseType\":\"VARCHAR\",\"length\":0,\"name\":\"Field\",\"nullable\":false,\"precision\":0,\"scale\":0}",
            "{\"databaseType\":\"TEXT\",\"length\":0,\"name\":\"Type\",\"nullable\":false,\"precision\":0,\"scale\":0}",
            "{\"databaseType\":\"VARCHAR\",\"length\":0,\"name\":\"Collation\",\"nullable\":true,\"precision\":0,\"scale\":0}",
            "{\"databaseType\":\"VARCHAR\",\"length\":0,\"name\":\"Null\",\"nullable\":false,\"precision\":0,\"scale\":0}",
            "{\"databaseType\":\"VARCHAR\",\"length\":0,\"name\":\"Key\",\"nullable\":false,\"precision\":0,\"scale\":0}",
            "{\"databaseType\":\"TEXT\",\"length\":0,\"name\":\"Default\",\"nullable\":true,\"precision\":0,\"scale\":0}",
            "{\"databaseType\":\"VARCHAR\",\"length\":0,\"name\":\"Extra\",\"nullable\":false,\"precision\":0,\"scale\":0}",
            "{\"databaseType\":\"VARCHAR\",\"length\":0,\"name\":\"Privileges\",\"nullable\":false,\"precision\":0,\"scale\":0}",
            "{\"databaseType\":\"VARCHAR\",\"length\":0,\"name\":\"Comment\",\"nullable\":false,\"precision\":0,\"scale\":0}"
        ],
        "Items": [
            "{\"Collation\":null,\"Comment\":\"主键ID\",\"Default\":null,\"Extra\":\"auto_increment\",\"Field\":\"id\",\"Key\":\"PRI\",\"Null\":\"NO\",\"Privileges\":\"select,insert,update,references\",\"Type\":\"bigint(20)\"}",
            "{\"Collation\":\"utf8mb4_general_ci\",\"Comment\":\"用户名\",\"Default\":null,\"Extra\":\"\",\"Field\":\"username\",\"Key\":\"UNI\",\"Null\":\"NO\",\"Privileges\":\"select,insert,update,references\",\"Type\":\"varchar(64)\"}",
            "{\"Collation\":\"utf8mb4_general_ci\",\"Comment\":\"邮箱\",\"Default\":null,\"Extra\":\"\",\"Field\":\"email\",\"Key\":\"\",\"Null\":\"YES\",\"Privileges\":\"select,insert,update,references\",\"Type\":\"varchar(128)\"}",
            "{\"Collation\":null,\"Comment\":\"状态：1-正常，0-禁用\",\"Default\":\"1\",\"Extra\":\"\",\"Field\":\"status\",\"Key\":\"\",\"Null\":\"NO\",\"Privileges\":\"select,insert,update,references\",\"Type\":\"tinyint(4)\"}",
            "{\"Collation\":null,\"Comment\":\"创建时间\",\"Default\":\"CURRENT_TIMESTAMP\",\"Extra\":\"\",\"Field\":\"created_at\",\"Key\":\"\",\"Null\":\"NO\",\"Privileges\":\"select,insert,update,references\",\"Type\":\"timestamp\"}",
            "{\"Collation\":null,\"Comment\":\"更新时间\",\"Default\":\"CURRENT_TIMESTAMP\",\"Extra\":\"on update CURRENT_TIMESTAMP\",\"Field\":\"updated_at\",\"Key\":\"\",\"Null\":\"NO\",\"Privileges\":\"select,insert,update,references\",\"Type\":\"timestamp\"}"
        ],
        "RowsAffected": 0
    }
}
```

### 示例4 查询所有数据表名

#### 输入示例

```
POST / HTTP/1.1
Host: tcb.tencentcloudapi.com
Content-Type: application/json
X-TC-Action: RunSql
<公共请求参数>

{
    "EnvId": "lowcode-2gqvfid5936609f4",
    "Sql": "\n    SELECT TABLE_NAME, TABLE_COMMENT\n    FROM INFORMATION_SCHEMA.TABLES\n    WHERE TABLE_SCHEMA = 'demo_schema' AND TABLE_TYPE = 'BASE TABLE'\n    ",
    "DbInstance": {
        "EnvId": "lowcode-2gqvfid5936609f4",
        "InstanceId": "demo_conn",
        "Schema": "demo_schema"
    }
}
```

#### 输出示例

```json
{
    "Response": {
        "RequestId": "d2f65ab5-90b8-4302-94f7-fed040f11a61",
        "Infos": [
            "{\"databaseType\":\"VARCHAR\",\"length\":0,\"name\":\"TABLE_NAME\",\"nullable\":true,\"precision\":0,\"scale\":0}",
            "{\"databaseType\":\"VARCHAR\",\"length\":0,\"name\":\"TABLE_COMMENT\",\"nullable\":true,\"precision\":0,\"scale\":0}"
        ],
        "Items": [
            "{\"TABLE_COMMENT\":\"用户表\",\"TABLE_NAME\":\"demo_users\"}"
        ],
        "RowsAffected": 0
    }
}
```

### 示例5 删除数据表

#### 输入示例

```
POST / HTTP/1.1
Host: tcb.tencentcloudapi.com
Content-Type: application/json
X-TC-Action: RunSql
<公共请求参数>

{
    "EnvId": "lowcode-2gqvfid5936609f4",
    "Sql": "DROP TABLE IF EXISTS `demo_users`",
    "DbInstance": {
        "EnvId": "lowcode-2gqvfid5936609f4",
        "InstanceId": "",
        "Schema": "lowcode-2gqvfid5936609f4"
    }
}
```

#### 输出示例

```json
{
    "Response": {
        "RequestId": "51272b35-b345-4164-b7ed-13c2d0e203c6",
        "Infos": [],
        "Items": [],
        "RowsAffected": 0
    }
}
```

## 5\. 开发者资源

### 腾讯云 API 平台

[腾讯云 API 平台](https://cloud.tencent.com/api) 是综合 API 文档、错误码、API Explorer 及 SDK 等资源的统一查询平台，方便您从同一入口查询及使用腾讯云提供的所有 API 服务。

### API Inspector

用户可通过 [API Inspector](https://cloud.tencent.com/document/product/1278/49361) 查看控制台每一步操作关联的 API 调用情况，并自动生成各语言版本的 API 代码，也可前往 [API Explorer](https://cloud.tencent.com/document/product/1278/46697) 进行在线调试。

### SDK

云 API 3.0 提供了配套的开发工具集（SDK），支持多种编程语言，能更方便的调用 API。

-   Tencent Cloud SDK 3.0 for Python: [CNB](https://cnb.cool/tencent/cloud/api/sdk/tencentcloud-sdk-python/-/blob/master/tencentcloud/tcb/v20180608/tcb_client.py), [GitHub](https://github.com/TencentCloud/tencentcloud-sdk-python/blob/master/tencentcloud/tcb/v20180608/tcb_client.py), [Gitee](https://gitee.com/TencentCloud/tencentcloud-sdk-python/blob/master/tencentcloud/tcb/v20180608/tcb_client.py)
-   Tencent Cloud SDK 3.0 for Java: [CNB](https://cnb.cool/tencent/cloud/api/sdk/tencentcloud-sdk-java/-/blob/master/src/main/java/com/tencentcloudapi/tcb/v20180608/TcbClient.java), [GitHub](https://github.com/TencentCloud/tencentcloud-sdk-java/blob/master/src/main/java/com/tencentcloudapi/tcb/v20180608/TcbClient.java), [Gitee](https://gitee.com/TencentCloud/tencentcloud-sdk-java/blob/master/src/main/java/com/tencentcloudapi/tcb/v20180608/TcbClient.java)
-   Tencent Cloud SDK 3.0 for PHP: [CNB](https://cnb.cool/tencent/cloud/api/sdk/tencentcloud-sdk-php/-/blob/master/src/TencentCloud/Tcb/V20180608/TcbClient.php), [GitHub](https://github.com/TencentCloud/tencentcloud-sdk-php/blob/master/src/TencentCloud/Tcb/V20180608/TcbClient.php), [Gitee](https://gitee.com/TencentCloud/tencentcloud-sdk-php/blob/master/src/TencentCloud/Tcb/V20180608/TcbClient.php)
-   Tencent Cloud SDK 3.0 for Go: [CNB](https://cnb.cool/tencent/cloud/api/sdk/tencentcloud-sdk-go/-/blob/master/tencentcloud/tcb/v20180608/client.go), [GitHub](https://github.com/TencentCloud/tencentcloud-sdk-go/blob/master/tencentcloud/tcb/v20180608/client.go), [Gitee](https://gitee.com/TencentCloud/tencentcloud-sdk-go/blob/master/tencentcloud/tcb/v20180608/client.go)
-   Tencent Cloud SDK 3.0 for Node.js: [CNB](https://cnb.cool/tencent/cloud/api/sdk/tencentcloud-sdk-nodejs/-/blob/master/src/services/tcb/v20180608/tcb_client.ts), [GitHub](https://github.com/TencentCloud/tencentcloud-sdk-nodejs/blob/master/src/services/tcb/v20180608/tcb_client.ts), [Gitee](https://gitee.com/TencentCloud/tencentcloud-sdk-nodejs/blob/master/src/services/tcb/v20180608/tcb_client.ts)
-   Tencent Cloud SDK 3.0 for.NET: [CNB](https://cnb.cool/tencent/cloud/api/sdk/tencentcloud-sdk-dotnet/-/blob/master/TencentCloud/Tcb/V20180608/TcbClient.cs), [GitHub](https://github.com/TencentCloud/tencentcloud-sdk-dotnet/blob/master/TencentCloud/Tcb/V20180608/TcbClient.cs), [Gitee](https://gitee.com/TencentCloud/tencentcloud-sdk-dotnet/blob/master/TencentCloud/Tcb/V20180608/TcbClient.cs)
-   Tencent Cloud SDK 3.0 for C++: [CNB](https://cnb.cool/tencent/cloud/api/sdk/tencentcloud-sdk-cpp/-/blob/master/tcb/src/v20180608/TcbClient.cpp), [GitHub](https://github.com/TencentCloud/tencentcloud-sdk-cpp/blob/master/tcb/src/v20180608/TcbClient.cpp), [Gitee](https://gitee.com/TencentCloud/tencentcloud-sdk-cpp/blob/master/tcb/src/v20180608/TcbClient.cpp)
-   Tencent Cloud SDK 3.0 for Ruby: [CNB](https://cnb.cool/tencent/cloud/api/sdk/tencentcloud-sdk-ruby/-/blob/master/tencentcloud-sdk-tcb/lib/v20180608/client.rb), [GitHub](https://github.com/TencentCloud/tencentcloud-sdk-ruby/blob/master/tencentcloud-sdk-tcb/lib/v20180608/client.rb), [Gitee](https://gitee.com/TencentCloud/tencentcloud-sdk-ruby/blob/master/tencentcloud-sdk-tcb/lib/v20180608/client.rb)

### 命令行工具

-   [Tencent Cloud CLI 3.0](https://cloud.tencent.com/document/product/440/6176)

## 6\. 错误码

以下仅列出了接口业务逻辑相关的错误码，其他错误码详见 [公共错误码](/document/api/876/34823#.E5.85.AC.E5.85.B1.E9.94.99.E8.AF.AF.E7.A0.81) 。

| 错误码 | 描述 |
| --- | --- |
| FailedOperation.DatabaseConnectError | 数据库建立链接失败。 |
| FailedOperation.DatabaseExecSqlError | 执行SQL出错。 |
| FailedOperation.DatabaseSchemaError | 数据库元信息异常。 |
| FailedOperation.EmptyDatabaseEndpoint | 数据库链接点为空。 |
| FailedOperation.TdsqlPaused | Instance is resuming, please try connecting again. |
| InternalError.SYS\_ERR | 系统内部异常。 |
| InvalidParameter.INVALID\_PARAM | 请求参数错误。 |
| ResourceNotFound.InstanceNotFound | 数据库实例不存在。 |
| ResourceNotFound.TableNotFound | 表不存在。 |
| UnsupportedOperation.TooManyTables | 表数量超过限制。 |

目录