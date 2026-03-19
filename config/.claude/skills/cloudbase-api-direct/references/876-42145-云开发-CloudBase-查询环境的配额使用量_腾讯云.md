[API 中心](/document/api)

## 查询环境的配额使用量

最近更新时间：2026-03-19 02:07:10

-   微信扫一扫 
-   QQ
-   新浪微博
-   复制链接
    
    链接复制成功
    

_我的收藏_

## 1\. 接口描述

接口请求域名： tcb.tencentcloudapi.com 。

查询指定指标的配额使用量

默认接口请求频率限制：2000次/秒。

推荐使用 API Explorer

[点击调试](https://console.cloud.tencent.com/api/explorer?Product=tcb&Version=2018-06-08&Action=DescribeQuotaData)

API Explorer 提供了在线调用、签名验证、SDK 代码生成和快速检索接口等能力。您可查看每次调用的请求内容和返回结果以及自动生成 SDK 调用示例。

## 2\. 输入参数

以下请求参数列表仅列出了接口请求参数和部分公共参数，完整公共参数列表见 [公共请求参数](/document/api/876/34812) 。

| 参数名称 | 必选 | 类型 | 描述 |
| --- | --- | --- | --- |
| Action | 是 | String | [公共参数](/document/api/876/34812) ，本接口取值：DescribeQuotaData。 |
| Version | 是 | String | [公共参数](/document/api/876/34812) ，本接口取值：2018-06-08。 |
| Region | 否 | String | [公共参数](/document/api/876/34812) ，本接口不需要传递此参数。 |
| EnvId | 是 | String | 环境ID  
示例值：test-23 |
| MetricName | 是 | String | -   指标名:
-   StorageSizepkg: 当月存储空间容量, 单位MB
-   StorageReadpkg: 当月存储读请求次数
-   StorageWritepkg: 当月存储写请求次数
-   StorageCdnOriginFluxpkg: 当月CDN回源流量, 单位字节
-   StorageCdnOriginFluxpkgDay: 当日CDN回源流量, 单位字节
-   StorageReadpkgDay: 当日存储读请求次数
-   StorageWritepkgDay: 当日写请求次数
-   CDNFluxpkg: 当月CDN流量, 单位为字节
-   CDNFluxpkgDay: 当日CDN流量, 单位为字节
-   FunctionInvocationpkg: 当月云函数调用次数
-   FunctionGBspkg: 当月云函数资源使用量, 单位Mb _Ms_
-   _FunctionFluxpkg: 当月云函数流量, 单位千字节(KB)_
-   _FunctionInvocationpkgDay: 当日云函数调用次数_
-   _FunctionGBspkgDay: 当日云函数资源使用量, 单位Mb_ Ms
-   FunctionFluxpkgDay: 当日云函数流量, 单位千字节(KB)
-   DbSizepkg: 当月数据库容量大小, 单位MB
-   DbReadpkg: 当日数据库读请求数
-   DbWritepkg: 当日数据库写请求数
-   StaticFsFluxPkgDay: 当日静态托管流量
-   StaticFsFluxPkg: 当月静态托管流量
-   StaticFsSizePkg: 当月静态托管容量
-   TkeCpuUsedPkg: 当月容器托管CPU使用量，单位核 _秒_
-   _TkeCpuUsedPkgDay: 当天容器托管CPU使用量，单位核_ 秒
-   TkeMemUsedPkg: 当月容器托管内存使用量，单位MB _秒_
-   _TkeMemUsedPkgDay: 当天容器托管内存使用量，单位MB_ 秒
-   CodingBuildTimePkgDay: 当天容器托管构建时间使用量，单位毫秒
-   TkeHttpServiceNatPkgDay: 当天容器托管流量使用量，单位B
-   CynosdbCcupkg: 当月微信云托管MySQL CCU使用量，单位个 （需要除以1000）
-   CynosdbStoragepkg: 当月微信云托管MySQL 存储使用量，单位MB （需要除以1000）
-   CynosdbCcupkgDay: 当天微信云托管MySQL 存储使用量，单位个 （需要除以1000）
-   CynosdbStoragepkgDay: 当天微信云托管MySQL 存储使用量，单位MB （需要除以1000）
  
示例值：DbWritepkg |
| ResourceID | 否 | String | 资源ID, 目前仅对云函数、容器托管相关的指标有意义。云函数(FunctionInvocationpkg, FunctionGBspkg, FunctionFluxpkg)、容器托管（服务名称）。如果想查询某个云函数的指标则在ResourceId中传入函数名; 如果只想查询整个namespace的指标, 则留空或不传。  
示例值："test-env" |

## 3\. 输出参数

| 参数名称 | 类型 | 描述 |
| --- | --- | --- |
| MetricName | String | 指标名  
示例值：DbWritepkg |
| Value | Integer | 指标的值  
示例值：0 |
| SubValue | String | 指标的附加值信息  
示例值：100 |
| RequestId | String | 唯一请求 ID，由服务端生成，每次请求都会返回（若请求因其他原因未能抵达服务端，则该次请求不会获得 RequestId）。定位问题时需要提供该次请求的 RequestId。 |

## 4\. 示例

### 示例1 查询指定指标的配额使用量

#### 输入示例

```
https://tcb.tencentcloudapi.com/?Action=DescribeQuotaData
&EnvId=test-23
&MetricName=DbWritepkg
&<公共请求参数>
```

#### 输出示例

```json
{
    "Response": {
        "MetricName": "DbWritepkg",
        "RequestId": "548c46c8-a177-4e39-820a-b544b3fd48c6",
        "Value": 0,
        "SubValue": "100"
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
| FailedOperation | 操作失败。 |
| InternalError | 内部错误。 |
| InvalidParameter | 参数错误。 |
| MissingParameter | 缺少参数错误。 |
| MissingParameter.Param | 缺少必要参数。 |
| ResourceNotFound | 资源不存在。 |
| ResourceUnavailable | 资源不可用。 |

目录