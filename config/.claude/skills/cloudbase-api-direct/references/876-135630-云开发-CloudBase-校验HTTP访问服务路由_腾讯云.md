[API 中心](/document/api)

## 校验HTTP访问服务路由

最近更新时间：2026-08-06 02:01:09

-   微信扫一扫 
-   QQ
-   新浪微博
-   复制链接
    
    链接复制成功
    

_我的收藏_

## 1\. 接口描述

接口请求域名： tcb.tencentcloudapi.com 。

覆盖的校验项包括：

1.  Ownership：域名所有权（TXT/CNAME 记录）；
2.  Cert：证书与域名匹配（CertId 为空时跳过）；
3.  Quota：环境下域名/路径数量配额；
4.  RouteConflict：同域名下路由路径冲突；
5.  DomainConflict：域名被其他环境占用；
6.  InternalAccount：内部域名且非内部账号；
7.  Blacklist：域名黑名单；
8.  CDNResource：AccessType=CDN 时 CDN 资源存在性 / 状态（含 ICP 未备案提示）；
9.  EO：AccessType=EO 时 EdgeOne 侧域名冲突 / 备案 / 归属权预检。

使用方式：

-   调用本接口前置校验，若 Passed=true 表示所有启用检查项均通过，可继续调用 CreateHTTPServiceRoute 正式创建；
-   若 Passed=false，前端应根据各 CheckItem 的 Code 精确渲染对应的错误提示与用户操作指引（如 DNS 归属权配置、ICP 备案指引等），用户修正参数后可重复调用本接口，直到通过后再进行创建。

注意：本接口为只读 dry-run 操作，不落库、不创建任何资源，仅返回各项检查的详细结果。本接口通过不代表 CreateHTTPServiceRoute 必然成功（例如证书运行时状态、并发抢占等仍需创建时最终判定），但本接口不通过则 CreateHTTPServiceRoute 必然不通过。

默认接口请求频率限制：20次/秒。

推荐使用 API Explorer

[点击调试](https://console.cloud.tencent.com/api/explorer?Product=tcb&Version=2018-06-08&Action=VerifyHTTPServiceRoute)

API Explorer 提供了在线调用、签名验证、SDK 代码生成和快速检索接口等能力。您可查看每次调用的请求内容和返回结果以及自动生成 SDK 调用示例。

## 2\. 输入参数

以下请求参数列表仅列出了接口请求参数和部分公共参数，完整公共参数列表见 [公共请求参数](/document/api/876/34812) 。

| 参数名称 | 必选 | 类型 | 描述 |
| --- | --- | --- | --- |
| Action | 是 | String | [公共参数](/document/api/876/34812) ，本接口取值：VerifyHTTPServiceRoute。 |
| Version | 是 | String | [公共参数](/document/api/876/34812) ，本接口取值：2018-06-08。 |
| Region | 否 | String | [公共参数](/document/api/876/34812) ，本接口不需要传递此参数。 |
| EnvId | 是 | String | 
环境ID

  
示例值： ********\********* -7ezncwdd421446 |
| Domain | 是 | [HTTPServiceDomainParam](/document/api/876/34822#HTTPServiceDomainParam) | 

域名路由信息

 |

## 3\. 输出参数

| 参数名称 | 类型 | 描述 |
| --- | --- | --- |
| Passed | Boolean | 
前置校验总开关。所有启用的检查项均为 PASS 或 SKIPPED 时为 true，任一检查项为 FAIL 时为 false。当为 false 时，前端应根据各 CheckItem 的 Code 精确渲染错误提示和操作指引；当为 true 时可继续调用 CreateHTTPServiceRoute 完成创建。 示例值：false

  
示例值：false |
| Ownership | [VerifyHTTPServiceRouteCheckItem](/document/api/876/34822#VerifyHTTPServiceRouteCheckItem) | 

域名归属权校验结果

 |
| Cert | [VerifyHTTPServiceRouteCheckItem](/document/api/876/34822#VerifyHTTPServiceRouteCheckItem) | 

证书校验结果；CertId 为空时 Status=SKIPPED

 |
| Quota | [VerifyHTTPServiceRouteCheckItem](/document/api/876/34822#VerifyHTTPServiceRouteCheckItem) | 

域名/路径数量配额校验结果

 |
| RouteConflict | [VerifyHTTPServiceRouteCheckItem](/document/api/876/34822#VerifyHTTPServiceRouteCheckItem) | 

同域名下路由路径冲突校验结果

 |
| DomainConflict | [VerifyHTTPServiceRouteCheckItem](/document/api/876/34822#VerifyHTTPServiceRouteCheckItem) | 

域名被其他环境占用校验结果

 |
| InternalAccount | [VerifyHTTPServiceRouteCheckItem](/document/api/876/34822#VerifyHTTPServiceRouteCheckItem) | 

内部域名且非内部账号校验结果

 |
| Blacklist | [VerifyHTTPServiceRouteCheckItem](/document/api/876/34822#VerifyHTTPServiceRouteCheckItem) | 

域名黑名单校验结果

 |
| CDNResource | [VerifyHTTPServiceRouteCheckItem](/document/api/876/34822#VerifyHTTPServiceRouteCheckItem) | 

AccessType=CDN 时 CDN 资源存在性 / 状态校验结果（含 ICP 未备案的提示）

 |
| EO | [VerifyHTTPServiceRouteCheckItem](/document/api/876/34822#VerifyHTTPServiceRouteCheckItem) | 

AccessType=EO 时的 EdgeOne 预检结果（域名冲突/备案/归属权）

 |
| RequestId | String | 唯一请求 ID，由服务端生成，每次请求都会返回（若请求因其他原因未能抵达服务端，则该次请求不会获得 RequestId）。定位问题时需要提供该次请求的 RequestId。 |

## 4\. 示例

### 示例1 校验路由

#### 输入示例

```
POST / HTTP/1.1
Host: tcb.tencentcloudapi.com
Content-Type: application/json
X-TC-Action: VerifyHTTPServiceRoute
<公共请求参数>

{
    "EnvId": "*****************-7ezncwdd421446",
    "Domain": {
        "Domain": "********************.cn",
        "AccessType": "EO",
        "Protocol": "HTTP_AND_HTTPS",
        "Enable": true,
        "Routes": [
            {
                "Path": "/autotest/api",
                "UpstreamResourceType": "CBR",
                "UpstreamResourceName": "autotest-service",
                "EnableSafeDomain": true,
                "EnableAuth": false,
                "EnablePathTransmission": false,
                "QPSPolicy": {
                    "QPSTotal": 500,
                    "QPSPerClient": {
                        "LimitBy": "ClientIP",
                        "LimitValue": 50
                    }
                },
                "Enable": true,
                "Extension": {
                    "HeadersHandler": {
                        "RequestHeadersToAdd": [
                            {
                                "Key": "X-Route-Header",
                                "Value": "route-value",
                                "Action": "OVERWRITE_IF_EXISTS_OR_ADD"
                            }
                        ],
                        "ResponseHeadersToAdd": [
                            {
                                "Key": "X-Route-Response",
                                "Value": "route-resp-value",
                                "Action": "OVERWRITE_IF_EXISTS_OR_ADD"
                            }
                        ]
                    }
                }
            }
        ],
        "Extension": {}
    }
}
```

#### 输出示例

```json
{
    "Response": {
        "Blacklist": {
            "Message": "not in blacklist",
            "Status": "PASS"
        },
        "CDNResource": {
            "Message": "access type is not CDN, cdn resource check skipped",
            "Status": "SKIPPED"
        },
        "Cert": {
            "Message": "CertId is empty, cert verify skipped",
            "Status": "SKIPPED"
        },
        "DomainConflict": {
            "Message": "no domain conflict",
            "Status": "PASS"
        },
        "EO": {
            "Message": "域名尚未备案",
            "Status": "FAIL"
        },
        "InternalAccount": {
            "Message": "not an internal domain, skipped",
            "Status": "SKIPPED"
        },
        "Ownership": {
            "Message": "domain ownership verification failed for ab7.woyaodaguaishou1.cn",
            "OwnershipVerification": {
                "DnsVerification": [
                    {
                        "RecordType": "TXT",
                        "RecordValue": "*****************-7ezncwdd421446",
                        "Subdomain": "_cloudbase-challenge.********************.cn"
                    }
                ],
                "Domain": "********************.cn"
            },
            "Status": "FAIL"
        },
        "Passed": false,
        "Quota": {
            "Message": "quota check passed",
            "Status": "PASS"
        },
        "RouteConflict": {
            "Message": "no route conflict",
            "Status": "PASS"
        },
        "RequestId": "b4912cfe-d26d-4cc0-bb55-eb47cee7fdcb"
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
| InvalidParameter | 参数格式或类型错误，如 Uin、EnvId、Domain 缺失或非法。 |