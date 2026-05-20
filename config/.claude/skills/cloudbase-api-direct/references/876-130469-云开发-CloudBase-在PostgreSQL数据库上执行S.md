[API 中心](/document/api)

## 在PostgreSQL数据库上执行SQL查询

最近更新时间：2026-05-20 03:00:31

-   微信扫一扫 
-   QQ
-   新浪微博
-   复制链接
    
    链接复制成功
    

_我的收藏_

## 1\. 接口描述

接口请求域名： tcb.tencentcloudapi.com 。

在Postgres数据库上执行SQL

默认接口请求频率限制：20次/秒。

推荐使用 API Explorer

[点击调试](https://console.cloud.tencent.com/api/explorer?Product=tcb&Version=2018-06-08&Action=ExecutePGSql)

API Explorer 提供了在线调用、签名验证、SDK 代码生成和快速检索接口等能力。您可查看每次调用的请求内容和返回结果以及自动生成 SDK 调用示例。

## 2\. 输入参数

以下请求参数列表仅列出了接口请求参数和部分公共参数，完整公共参数列表见 [公共请求参数](/document/api/876/34812) 。

| 参数名称 | 必选 | 类型 | 描述 |
| --- | --- | --- | --- |
| Action | 是 | String | [公共参数](/document/api/876/34812) ，本接口取值：ExecutePGSql。 |
| Version | 是 | String | [公共参数](/document/api/876/34812) ，本接口取值：2018-06-08。 |
| Region | 否 | String | [公共参数](/document/api/876/34812) ，本接口不需要传递此参数。 |
| EnvId | 是 | String | 
云开发环境ID

  
示例值：pg-mikejliu-0g9cqmar358527a9 |
| Sql | 是 | String | 

要执行的SQL语句

  
示例值：select column\_name FROM information\_schema.columns WHERE table\_schema = 'public' AND table\_name = 'test\_products' |
| Role | 否 | String | 

指定 role 执行 SQL

  
示例值：cloudbase\_ **\*\*\*\*** |

## 3\. 输出参数

| 参数名称 | 类型 | 描述 |
| --- | --- | --- |
| AffectedRows | Integer | 
影响行数

  
示例值：0 |
| Columns | Array of String | 

字段名列表

  
注意：此字段可能返回 null，表示取不到有效值。  
示例值：\["column\_name"\] |
| Rows | Array of String | 

数据行。每一行数据都是一个JSON串，将JSON进行反序列化将得到了每列的值。值可能是 null 或者 字符串，如果是 null 说明该列的值为 <null>，如果是字符串则为该列的值的字符串表示形式。

  
注意：此字段可能返回 null，表示取不到有效值。  
示例值：\["\["id"\]"\] |
| ExecutionTimeMs | Integer | 

SQL执行耗时

单位：毫秒

  
示例值：58 |
| RequestId | String | 唯一请求 ID，由服务端生成，每次请求都会返回（若请求因其他原因未能抵达服务端，则该次请求不会获得 RequestId）。定位问题时需要提供该次请求的 RequestId。 |

## 4\. 示例

### 示例1 创建表

#### 输入示例

```
POST / HTTP/1.1
Host: tcb.tencentcloudapi.com
Content-Type: application/json
X-TC-Action: ExecutePGSql
<公共请求参数>

{
    "EnvId": "pg-mikejliu-0g9cqmar358527a9",
    "Sql": "CREATE TABLE test_products (\n    id SERIAL PRIMARY KEY,                        -- 产品唯一标识\n    sku VARCHAR(20) UNIQUE NOT NULL,             -- 库存单位编码，唯一且必填\n    name TEXT NOT NULL,                          -- 产品名称\n    category VARCHAR(50),                        -- 分类\n    price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,  -- 单价\n    stock_quantity INTEGER DEFAULT 0,            -- 库存数量\n    tags JSONB,                                  -- 标签（使用 JSONB 存储扩展属性）\n    last_updated TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW() -- 最后更新时间\n);",
    "Role": "cloudbase_********"
}
```

#### 输出示例

```json
{
    "Response": {
        "AffectedRows": 0,
        "Columns": null,
        "ExecutionTimeMs": 34,
        "Rows": null,
        "RequestId": "5cf1d355-cdb7-4879-bd22-4e89ddc10095"
    }
}
```

### 示例2 查询表字段

#### 输入示例

```
POST / HTTP/1.1
Host: tcb.tencentcloudapi.com
Content-Type: application/json
X-TC-Action: ExecutePGSql
<公共请求参数>

{
    "EnvId": "pg-mikejliu-0g9cqmar358527a9",
    "Sql": "select column_name FROM information_schema.columns WHERE table_schema = 'public'   AND table_name = 'test_products'"
}
```

#### 输出示例

```json
{
    "Response": {
        "AffectedRows": 0,
        "Columns": [
            "column_name"
        ],
        "ExecutionTimeMs": 58,
        "Rows": [
            "[\"id\"]"
        ],
        "RequestId": "21b3df84-7ea3-4487-9583-e4de88b4ab89"
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
| FailedOperation.InstanceStatusConflict | Instance status does not match the required status for this operation. |
| FailedOperation.PGConnectError | Failed to connect to PostgreSQL instance. |
| FailedOperation.PGExecuteSqlError | Execute SQL error. |
| InternalError.SYS\_ERR | 系统内部异常。 |
| InvalidParameter.INVALID\_PARAM | 请求参数错误。 |
| ResourceNotFound.RoleNotFound | Database role not found. |