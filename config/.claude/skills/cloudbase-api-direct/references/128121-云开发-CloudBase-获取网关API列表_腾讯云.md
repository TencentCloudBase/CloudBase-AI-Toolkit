[API 中心](/document/api)

## 获取网关API列表

最近更新时间：2026-03-02 12:47:43

-   微信扫一扫 
-   QQ
-   新浪微博
-   复制链接
    
    链接复制成功
    

_我的收藏_

## 1\. 接口描述

接口请求域名： tcb.tencentcloudapi.com 。

获取网关API列表

默认接口请求频率限制：100次/秒。

推荐使用 API Explorer

[点击调试](https://console.cloud.tencent.com/api/explorer?Product=tcb&Version=2018-06-08&Action=DescribeCloudBaseGWAPI)

API Explorer 提供了在线调用、签名验证、SDK 代码生成和快速检索接口等能力。您可查看每次调用的请求内容和返回结果以及自动生成 SDK 调用示例。

## 2\. 输入参数

以下请求参数列表仅列出了接口请求参数和部分公共参数，完整公共参数列表见 [公共请求参数](/document/api/876/34812) 。

| 参数名称 | 必选 | 类型 | 描述 |
| --- | --- | --- | --- |
| Action | 是 | String | [公共参数](/document/api/876/34812) ，本接口取值：DescribeCloudBaseGWAPI。 |
| Version | 是 | String | [公共参数](/document/api/876/34812) ，本接口取值：2018-06-08。 |
| Region | 否 | String | [公共参数](/document/api/876/34812) ，本接口不需要传递此参数。 |
| ServiceId | 否 | String | 服务ID  
示例值：envid |
| Domain | 否 | String | API域名  
示例值：www.aaa.cn |
| Path | 否 | String | API Path  
示例值：/ |
| APIId | 否 | String | API ID  
示例值：randstring |
| Type | 否 | Integer | API类型，1为云函数，2为容器  
示例值：1 |
| Name | 否 | String | API名，Type为1时为云函数名，Type为2时为容器服务名  
示例值：apiname |
| Offset | 否 | Integer | 查询的分页参数，用于设置查询的偏移位置，0表示从头开始  
示例值：0 |
| Limit | 否 | Integer | 查询的分页参数，用于表示每次查询的最大返回数据量  
示例值：100 |
| EnableRegion | 否 | Boolean | 是否启用多地域  
示例值：true |
| EnableUnion | 否 | Boolean | 是否使用统一域名  
示例值：true |

## 3\. 输出参数

| 参数名称 | 类型 | 描述 |
| --- | --- | --- |
| APISet | Array of [CloudBaseGWAPI](/document/api/876/34822#CloudBaseGWAPI) | API列表  
注意：此字段可能返回 null，表示取不到有效值。 |
| EnableService | Boolean | 是否开启http调用  
示例值：true |
| Total | Integer | 查询结果的数据总量  
注意：此字段可能返回 null，表示取不到有效值。  
示例值：100 |
| Offset | Integer | 查询的分页参数  
注意：此字段可能返回 null，表示取不到有效值。  
示例值：0 |
| Limit | Integer | 查询的分页参数  
注意：此字段可能返回 null，表示取不到有效值。  
示例值：100 |
| RequestId | String | 唯一请求 ID，由服务端生成，每次请求都会返回（若请求因其他原因未能抵达服务端，则该次请求不会获得 RequestId）。定位问题时需要提供该次请求的 RequestId。 |

## 4\. 示例

### 示例1 DescribeCloudBaseGWAPI示例

#### 输入示例

```
https://tcb.tencentcloudapi.com/?Action=DescribeCloudBaseGWAPI
&ServiceId="roy-test-666"
&<公共请求参数>
```

#### 输出示例

```json
{
    "Response": {
        "APISet": [
            {
                "ServiceId": "roy-test-666",
                "IsShortPath": false,
                "APIId": "3171368e-e641-4788-bd0e-e856aa713995",
                "Path": "/lowcode-datasource",
                "Type": 1,
                "Name": "lowcode-datasource",
                "CreateTime": 1741184090,
                "EnvId": "roy-test-666",
                "EnableAuth": false,
                "Custom": "",
                "AccessType": 13,
                "Domain": "*",
                "UnionStatus": 1,
                "ConflictFlag": false,
                "DomainStatus": 0,
                "PathTransmission": 2,
                "EnableCheckAcrossDomain": 1,
                "StaticFileDirectory": ""
            }
        ],
        "EnableService": true,
        "Limit": 100,
        "Offset": 0,
        "RequestId": "c16af20e-8b15-421a-8c4a-c9269e3eb38a",
        "Total": 1
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
| InternalError.SystemFail | 系统失败。 |
| InvalidParameter | 参数错误。 |
| InvalidParameter.APINoExist | API不存在。 |
| InvalidParameter.APITypeNotSupport | API类型不支持。 |
| InvalidParameter.ExclusiveCert | 独占证书。 |
| InvalidParameter.ServiceEvil | 没有操作权限。 |

目录