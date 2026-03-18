[API 中心](/document/api)

## 搜索CLS日志

最近更新时间：2026-03-18 02:55:09

-   微信扫一扫 
-   QQ
-   新浪微博
-   复制链接
    
    链接复制成功
    

_我的收藏_

## 1\. 接口描述

接口请求域名： tcb.tencentcloudapi.com 。

搜索用户调用日志

默认接口请求频率限制：20次/秒。

推荐使用 API Explorer

[点击调试](https://console.cloud.tencent.com/api/explorer?Product=tcb&Version=2018-06-08&Action=SearchClsLog)

API Explorer 提供了在线调用、签名验证、SDK 代码生成和快速检索接口等能力。您可查看每次调用的请求内容和返回结果以及自动生成 SDK 调用示例。

## 2\. 输入参数

以下请求参数列表仅列出了接口请求参数和部分公共参数，完整公共参数列表见 [公共请求参数](/document/api/876/34812) 。

| 参数名称 | 必选 | 类型 | 描述 |
| --- | --- | --- | --- |
| Action | 是 | String | [公共参数](/document/api/876/34812) ，本接口取值：SearchClsLog。 |
| Version | 是 | String | [公共参数](/document/api/876/34812) ，本接口取值：2018-06-08。 |
| Region | 否 | String | [公共参数](/document/api/876/34812) ，本接口不需要传递此参数。 |
| EnvId | 是 | String | 环境唯一ID  
示例值：aitest-9g96e4tn46773d08 |
| StartTime | 是 | String | 查询起始时间条件  
示例值：2026-02-04 10:34:44 |
| EndTime | 是 | String | 查询结束时间条件  
示例值：2026-02-04 11:34:44 |
| QueryString | 是 | String | 查询语句， 例如查询云函数：(src:app OR src:system) AND log:"START RequestId _"， 聚合云函数请求状态：_ | select request\_id, max(status\_code) as status where ((request\_id='44738f94-16dd-11f1-\*\*\*\*' AND retry\_num=0) AND retry\_num=0)) AND status\_code!=202 group by request\_id, retry\_num 查询云数据库\[文档型\]：module:database， 查询云数据库\[文档型\]事件：module:database AND eventType:(MongoSlowQuery)，MongoSlowQuery为文档型数据库慢查询事件 查询云数据库\[SQL型\]：module:rdb， 查询云数据库\[SQL型\]事件：module:rdb AND eventType:(MysqlFreeze OR MysqlRecover OR MysqlSlowQuery)，MysqlFreeze为mysql数据库冻结事件、MysqlRecover为mysql数据库恢复事件、MysqlSlowQuery为mysql数据库慢查询事件 查询审批流：module:workflow， 查询模型：module:model， 查询用户权限：module:auth， 查询大模型：module:llm AND logType:llm-tracelog 查询网关服务调用：logType:accesslog 查询应用发布/删除事件：module:app AND eventType:(AppProdPub OR AppProdDel)，AppProdPub为应用发布事件，AppProdDel为应用删除事件 以上仅为示例语句，实际使用时请根据具体日志内容进行调整，查询语句需严格遵循CLS（Cloud Log Service）语法规范 详细的语法规则请参考官方档：https://cloud.tencent.com/document/product/614/47044  
示例值：module:database |
| Limit | 是 | Integer | 单次要返回的日志条数，单次返回的最大条数为100  
示例值：10 |
| Context | 否 | String | 加载更多使用，透传上次返回的 context 值，获取后续的日志内容，通过游标最多可获取10000条，请尽可能缩小时间范围  
示例值：ctxxu4igkldjkjiut4jkgdjsk |
| Sort | 否 | String | 按时间排序 asc（升序）或者 desc（降序），默认为 desc  
示例值：asc |
| UseLucene | 否 | Boolean | 是否使用Lucene语法，默认为false  
示例值：false |

## 3\. 输出参数

| 参数名称 | 类型 | 描述 |
| --- | --- | --- |
| LogResults | [LogResObject](/document/api/876/34822#LogResObject) | 日志内容结果 |
| RequestId | String | 唯一请求 ID，由服务端生成，每次请求都会返回（若请求因其他原因未能抵达服务端，则该次请求不会获得 RequestId）。定位问题时需要提供该次请求的 RequestId。 |

## 4\. 示例

### 示例1 搜索云函数日志

搜索云函数日志

#### 输入示例

```
POST / HTTP/1.1
Host: tcb.tencentcloudapi.com
Content-Type: application/json
X-TC-Action: SearchClsLog
<公共请求参数>

{
    "Context": "",
    "EndTime": "2026-01-28 23:52:17",
    "EnvId": "tcb-xxxx21d05d",
    "Limit": 1,
    "QueryString": "(src:app OR src:system) AND log:\"START RequestId*\"",
    "StartTime": "2026-01-28 06:47:17",
    "Sort": "desc",
    "UseLucene": true
}
```

#### 输出示例

```json
{
    "Response": {
        "LogResults": {
            "AnalysisRecords": [],
            "Context": "Y29udGV4dC04ZjdiNGM5Ni01YzY0LTRjxxxxxxxxJjNTBkNTI0ZWIxNzY5NzU2NjgyNDA0",
            "ListOver": false,
            "Results": [
                {
                    "Content": "{\"memory\":\"512\",\"status_code\":\"202\",\"log\":\"START RequestId: 895f3b00-a4b2-4bab-\",\"stamp\":\"MINI_QCBASE\",\"ret_msg\":\"\",\"tcb_log\":\"\",\"function_invoke_time\":\"1769615520200\",\"duration\":\"0\",\"event_type\":\"1\",\"alias\":\"\",\"function_id\":\"lam-5c5gwci3\",\"log_size\":\"53\",\"wan_traffic\":\"0\",\"cluster_name\":\"ap-shanghai-tcb-cube-1\",\"caller_ip\":\"\",\"report_ip\":\"\",\"src\":\"system\",\"bill_duration\":\"0\",\"request_source\":\"TRIGGER_TIMER\",\"retry_num\":\"0\",\"start_time\":\"1769615520193\",\"caller\":\"Worker\",\"mem_duration\":\"0\",\"@timestamp\":\"1769615520200960\",\"mem_usage\":\"0\",\"function_invoke_end_time\":\"0\",\"user_id\":\"1252168680\",\"function_name\":\"near-quertz-area\",\"qualifier\":\"$LATEST\",\"namespace\":\"xxxx-4cs57821d05d\",\"status_msg\":\"\",\"request_id\":\"895f3b00xxxx-4bab-a\",\"ret_code\":\"2\",\"container_id\":\"21f173acc8264785xxxxx8e6485645\"}",
                    "FileName": "",
                    "Source": "",
                    "Timestamp": "2026-01-28 23:52:00.200",
                    "TopicId": "a160184c-xxxx",
                    "TopicName": "tcb-topic-xxxx"
                }
            ]
        },
        "RequestId": "4f4396f8-cccd-4c6cxxxx-865f7c45e"
    }
}
```

### 示例2 搜索模型日志

搜索模型日志

#### 输入示例

```
POST / HTTP/1.1
Host: tcb.tencentcloudapi.com
Content-Type: application/json
X-TC-Action: SearchClsLog
<公共请求参数>

{
    "Context": "",
    "EndTime": "2026-01-30 23:52:17",
    "EnvId": "tcb-xxxx21d05d",
    "Limit": 1,
    "QueryString": "module:model",
    "StartTime": "2026-01-29 06:47:17",
    "Sort": "desc",
    "UseLucene": true
}
```

#### 输出示例

```json
{
    "Response": {
        "LogResults": {
            "AnalysisRecords": [],
            "Context": "",
            "ListOver": true,
            "Results": [
                {
                    "Content": "{\"msg\":\"数据模型业务日志。\\n操作类型：wedaCre。\\n环境类型：正式环境。\\n请求耗时：102。\",\"eventId\":\"<nil>\",\"level\":\"info\",\"indexAdvise\":\"<nil>\",\"module\":\"model\",\"query\":\"{\\\"data\\\":{\\\"statistics_date\\\":1769616000000,\\\"recharge_newuser_amount\\\":0,\\\"recharge_newuser_count\\\":0,\\\"recharge_count\\\":0,\\\"recharge_amount\\\":0,\\\"recharge_user_count\\\":0,\\\"increase_user_count\\\":0}}\",\"errorMessage\":\"<nil>\",\"errorCode\":\"<nil>\",\"resourceName\":\"playlet_index_9odvef9\",\"envId\":\"lowcode-4gs26nnz095fxxx\",\"envType\":\"prod\",\"requestId\":\"99501bc2-fd11f0-bc30-xxxx\",\"action\":\"wedaCreateV2\",\"dataHubName\":\"default\",\"startTime\":\"2026-01-29T16:00:17.690Z\",\"timeCost\":\"102ms\",\"timestamp\":\"1769702417690\"}",
                    "FileName": "",
                    "Source": "",
                    "Timestamp": "2026-01-30 00:00:17.690",
                    "TopicId": "0123a7d7-8386-403cxxxx-0a9966640c22",
                    "TopicName": "tcb-topic-xxxx-4gs26nnz095f6f4d"
                }
            ]
        },
        "RequestId": "2989d059-2271-xxxxd18-58e24897ef1f"
    },
    "reqId": "f17029de-791d-4f9d-xxxx-dc758b16e8e7"
}
```

### 示例3 聚合分析日志结果

#### 输入示例

```
POST / HTTP/1.1
Host: tcb.tencentcloudapi.com
Content-Type: application/json
X-TC-Action: SearchClsLog
<公共请求参数>

{
    "Context": "",
    "EnvId": "aitest-9g96e4tn46773d08",
    "StartTime": "2026-01-29 06:47:17",
    "EndTime": "2026-01-30 23:52:17",
    "QueryString": "* | select request_id, max(status_code) as status  where (request_id='35b9abe7-xxxx-11f1-9ce5-52540059feef' AND retry_num=0)) AND status_code!=202 group by request_id, retry_num",
    "Sort": "desc",
    "UseLucene": true,
    "Limit": 100
}
```

#### 输出示例

```json
{
    "Response": {
        "LogResults": {
            "AnalysisRecords": [
                "{\"request_id\":\"35b9abe7-xxxx-11f1-9ce5-52540059feef\",\"status\":200}",
                "{\"request_id\":\"640c1490-xxxx-11f1-823c-525400a9be57\",\"status\":200}"
            ],
            "Context": "",
            "ListOver": true,
            "Results": []
        },
        "RequestId": "27108be7-20ac-xxxx927a-4c5aaa2c4969"
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
| AuthFailure | CAM签名/鉴权错误。 |
| AuthFailure.UnauthorizedOperation | 您没有查看该资源的权限。 |
| FailedOperation.InvalidContext | 无效上下文 |
| FailedOperation.NetworkError | 网络异常 |
| FailedOperation.QueryError | 查询异常 |
| FailedOperation.SyntaxError | 查询语句解析错误 |
| FailedOperation.TopicIsolated | Topic隔离 |
| InternalError | 内部错误。 |
| InvalidParameter | 参数错误。 |
| ResourceNotFound.TopicNotExist | 主题不存在 |

目录