[API 中心](/document/api)

## 查询云托管服务版本的详情

最近更新时间：2026-03-26 02:55:02

-   微信扫一扫 
-   QQ
-   新浪微博
-   复制链接
    
    链接复制成功
    

_我的收藏_

## 1\. 接口描述

接口请求域名： tcb.tencentcloudapi.com 。

查询服务版本的详情，CPU和MEM 请使用CPUSize和MemSize

默认接口请求频率限制：1000次/秒。

推荐使用 API Explorer

[点击调试](https://console.cloud.tencent.com/api/explorer?Product=tcb&Version=2018-06-08&Action=DescribeCloudBaseRunServerVersion)

API Explorer 提供了在线调用、签名验证、SDK 代码生成和快速检索接口等能力。您可查看每次调用的请求内容和返回结果以及自动生成 SDK 调用示例。

## 2\. 输入参数

以下请求参数列表仅列出了接口请求参数和部分公共参数，完整公共参数列表见 [公共请求参数](/document/api/876/34812) 。

| 参数名称 | 必选 | 类型 | 描述 |
| --- | --- | --- | --- |
| Action | 是 | String | [公共参数](/document/api/876/34812) ，本接口取值：DescribeCloudBaseRunServerVersion。 |
| Version | 是 | String | [公共参数](/document/api/876/34812) ，本接口取值：2018-06-08。 |
| Region | 否 | String | [公共参数](/document/api/876/34812) ，本接口不需要传递此参数。 |
| EnvId | 是 | String | 环境ID  
示例值：env-98772234 |
| ServerName | 是 | String | 服务名称  
示例值：sv |
| VersionName | 是 | String | 版本名称  
示例值：sv-001 |

## 3\. 输出参数

| 参数名称 | 类型 | 描述 |
| --- | --- | --- |
| VersionName | String | 版本名称  
示例值：sv-001 |
| Remark | String | 备注  
示例值：remark |
| DockerfilePath | String | Dockerfile的路径  
示例值：Dockerfile |
| BuildDir | String | DockerBuild的目录  
示例值：. |
| Cpu | Float | 请使用CPUSize  
示例值：1.0 |
| Mem | Float | 请使用MemSize  
示例值：2.0 |
| MinNum | Integer | 副本最小值  
示例值：1 |
| MaxNum | Integer | 副本最大值  
示例值：50 |
| PolicyType | String | 策略类型  
示例值：Dockerfile |
| PolicyThreshold | Float | 策略阈值  
示例值：60.0 |
| EnvParams | String | 环境变量  
示例值：key=value |
| CreatedTime | String | 创建时间  
示例值：2024-12-01 12:00:00 |
| UpdatedTime | String | 更新时间  
示例值：2024-12-01 12:00:00 |
| VersionIP | String | 版本的IP  
示例值：127.0.0.1 |
| VersionPort | Integer | 版本的端口号  
示例值：80 |
| Status | String | 版本状态  
示例值：normal |
| PackageName | String | 代码包的名字  
示例值：package |
| PackageVersion | String | 代码版本的名字  
示例值：134sd |
| UploadType | String | 枚举（package/repository/image)  
示例值：package |
| RepoType | String | Repo的类型(gitlab/github/coding)  
示例值：gitlab |
| Repo | String | 地址  
示例值：adress |
| Branch | String | 分支  
示例值：master |
| ServerName | String | 服务名字  
示例值：version |
| IsPublic | Boolean | 是否对于外网开放  
示例值：false |
| VpcId | String | vpc id  
示例值：vpc-sdfsdf |
| SubnetIds | Array of String | 子网实例id  
注意：此字段可能返回 null，表示取不到有效值。  
示例值：\["subnet-sdfsdf"\] |
| CustomLogs | String | 日志采集路径  
示例值：stdout |
| ContainerPort | Integer | 监听端口  
示例值：80 |
| InitialDelaySeconds | Integer | 延迟多长时间开始健康检查（单位s）  
示例值：80 |
| ImageUrl | String | 镜像地址  
示例值：url |
| CpuSize | Float | CPU 大小  
示例值：2.0 |
| MemSize | Float | MEM 大小  
示例值：4.0 |
| HasDockerfile | Integer | 是否有Dockerfile：0-default has, 1-has, 2-has not  
示例值：0 |
| BaseImage | String | 基础镜像  
示例值：JDK7 |
| EntryPoint | String | 容器启动入口命令  
示例值：java -jar app.jar |
| RepoLanguage | String | 仓库语言  
示例值：Java |
| PolicyDetail | Array of [HpaPolicy](/document/api/876/34822#HpaPolicy) | 自动扩缩容策略组  
注意：此字段可能返回 null，表示取不到有效值。 |
| TkeClusterInfo | [TkeClusterInfo](/document/api/876/34822#TkeClusterInfo) | Tke集群信息  
注意：此字段可能返回 null，表示取不到有效值。  
示例值：cluster-sddff |
| TkeWorkloadType | String | 版本工作负载类型；deployment/deamonset  
示例值：deployment |
| RequestId | String | 唯一请求 ID，由服务端生成，每次请求都会返回（若请求因其他原因未能抵达服务端，则该次请求不会获得 RequestId）。定位问题时需要提供该次请求的 RequestId。 |

## 4\. 示例

### 示例1 示例

查询版本信息

#### 输入示例

```
POST / HTTP/1.1
Host: tcb.tencentcloudapi.com
Content-Type: application/json
X-TC-Action: DescribeCloudBaseRunServerVersion
<公共请求参数>

{
    "EnvId": "env-sdfd",
    "ServerName": "server",
    "VersionName": "ver"
}
```

#### 输出示例

```json
{
    "Response": {
        "VersionName": "",
        "Remark": "",
        "DockerfilePath": "",
        "BuildDir": "",
        "Cpu": 0,
        "Mem": 0,
        "MinNum": 0,
        "MaxNum": 0,
        "PolicyType": "",
        "PolicyThreshold": 0,
        "EnvParams": "",
        "CreatedTime": "",
        "UpdatedTime": "",
        "VersionIP": "",
        "VersionPort": 0,
        "Status": "",
        "PackageName": "",
        "PackageVersion": "",
        "UploadType": "",
        "RepoType": "",
        "Repo": "",
        "Branch": "",
        "ServerName": "",
        "IsPublic": true,
        "VpcId": "",
        "SubnetIds": [
            ""
        ],
        "CustomLogs": "",
        "ContainerPort": 0,
        "InitialDelaySeconds": 0,
        "ImageUrl": "",
        "CpuSize": 0,
        "MemSize": 0,
        "HasDockerfile": 0,
        "BaseImage": "",
        "EntryPoint": "",
        "RepoLanguage": "",
        "PolicyDetail": [
            {
                "PolicyType": "",
                "PolicyThreshold": 0
            }
        ],
        "TkeClusterInfo": {
            "ClusterId": "",
            "VpcId": "",
            "VersionClbSubnetId": ""
        },
        "TkeWorkloadType": "",
        "RequestId": ""
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
| InvalidParameter.ServiceNotExist | 服务不存在。 |
| LimitExceeded.ErrNamespaceMaxLimit | 命名空间超过配额。 |
| LimitExceeded.ErrRepoMaxLimit | 镜像容器超过配额。 |
| ResourceNotFound | 资源不存在。 |
| ResourceNotFound.ServerNotFound | 请求的云托管服务未找到 |
| ResourceNotFound.VersionNotFound | 请求参数中的云托管版本未找到 |
| ResourceUnavailable.ResourceBanned | 资源被封禁 |
| ResourceUnavailable.ResourceFrozen | 资源已冻结 |
| ResourceUnavailable.ResourceIsolated | 资源已隔离 |

目录