[API 中心](/document/api)

## DELETE Object

最近更新时间：2024-11-15 21:48:54

-   微信扫一扫 
-   QQ
-   新浪微博
-   复制链接
    
    链接复制成功
    

_我的收藏_

## 本页目录：

-   [功能描述](#.E5.8A.9F.E8.83.BD.E6.8F.8F.E8.BF.B0 "功能描述")
-   [授权说明](#.E6.8E.88.E6.9D.83.E8.AF.B4.E6.98.8E "授权说明")
-   [请求](#.E8.AF.B7.E6.B1.82 "请求")
-   [响应](#.E5.93.8D.E5.BA.94 "响应")
-   [实际案例](#.E5.AE.9E.E9.99.85.E6.A1.88.E4.BE.8B "实际案例")

## 功能描述

DELETE Object 接口请求可以删除一个指定的对象（Object）。该 API 的请求者需要对存储桶有写入权限。

## 授权说明

授权策略中 action 设置为 cos:DeleteObject 。查看所有 [action](https://cloud.tencent.com/document/product/598/69901 "https://cloud.tencent.com/document/product/598/69901") 。

#### 版本控制

如需删除对象的指定版本（包括删除标记，下同），请使用 versionId 请求参数指定对应的版本 ID （包括删除标记的版本 ID，下同），此时响应将返回 x-cos-version-id 响应头部，代表该请求操作删除的版本 ID。

如未指定 versionId 请求参数：

当版本控制为启用时，该 DELETE 操作将创建一个删除标记作为指定对象的最新版本，此时响应将返回 x-cos-version-id 响应头部，代表该请求操作创建的删除标记的版本 ID。

当版本控制为暂停时，该 DELETE 操作将创建一个版本 ID 为 null 的删除标记作为指定对象的最新版本，同时删除任何已存在的版本 ID 为 null 的其他版本（如有）。

当该 DELETE 操作创建或删除标记，那么将返回 x-cos-delete-marker: true 响应头部，代表该 DELETE 操作创建或删除了指定对象的删除标记。

有关版本控制的启用或暂停状态说明，请参见 [版本控制概述](https://cloud.tencent.com/document/product/436/19883 "https://cloud.tencent.com/document/product/436/19883") 。

## 请求

#### 请求示例

```shell
DELETE /<ObjectKey> HTTP/1.1Host: <BucketName-APPID>.cos.<Region>.myqcloud.comDate: GMT DateAuthorization: Auth String
```

**说明**

Host: <BucketName-APPID>.cos.<Region>.myqcloud.com，其中 <BucketName-APPID> 为带 APPID 后缀的存储桶名字，例如 examplebucket-1250000000，可参阅 [存储桶概览 > 基本信息](https://cloud.tencent.com/document/product/436/48921#.E5.9F.BA.E6.9C.AC.E4.BF.A1.E6.81.AF "https://cloud.tencent.com/document/product/436/48921#.E5.9F.BA.E6.9C.AC.E4.BF.A1.E6.81.AF") 和 [存储桶概述 > 存储桶命名规范](https://cloud.tencent.com/document/product/436/13312#.E5.AD.98.E5.82.A8.E6.A1.B6.E5.91.BD.E5.90.8D.E8.A7.84.E8.8C.83 "https://cloud.tencent.com/document/product/436/13312#.E5.AD.98.E5.82.A8.E6.A1.B6.E5.91.BD.E5.90.8D.E8.A7.84.E8.8C.83") 文档；<Region> 为 COS 的可用地域，可参阅 [地域和访问域名](http://cloud.tencent.com/document/product/436/6224 "http://cloud.tencent.com/document/product/436/6224") 文档。

Authorization: Auth String（详情请参见 [请求签名](https://cloud.tencent.com/document/product/436/7778 "https://cloud.tencent.com/document/product/436/7778") 文档）。

#### 请求参数

<table><tbody><tr><td><p><span><span><span>名称</span></span></span></p></td><td><p><span><span><span>描述</span></span></span></p></td><td><p><span><span><span>类型</span></span></span></p></td><td><p><span><span><span>是否必选</span></span></span></p></td></tr><tr><td><p><span><span><span>versionId</span></span></span></p></td><td><p><span><span><span>指定要删除的版本 ID</span></span></span></p></td><td><p><span><span><span>string</span></span></span></p></td><td><p><span><span><span>否</span></span></span></p></td></tr></tbody></table>

#### 请求头

此接口仅使用公共请求头部，详情请参见 [公共请求头部](https://cloud.tencent.com/document/product/436/7728 "https://cloud.tencent.com/document/product/436/7728") 文档。

#### 请求体

该请求的请求体为空。

## 响应

#### 响应头

此接口除返回公共响应头部外，还返回以下响应头部，了解公共响应头部详情请参见 [公共响应头部](https://cloud.tencent.com/document/product/436/7729 "https://cloud.tencent.com/document/product/436/7729") 文档。

**版本控制相关头部**

删除启用版本控制的存储桶内的对象或对象的指定版本将返回下列响应头部：

<table><colgroup><col width="18%"> <col width="71%"> <col width="10%"></colgroup><tbody><tr><td><p><span><span><span>名称</span></span></span></p></td><td><p><span><span><span>描述</span></span></span></p></td><td><p><span><span><span>类型</span></span></span></p></td></tr><tr><td><p><span><span><span>x-cos-version-id</span></span></span></p></td><td><p><span><span><span>对象的版本 ID 或删除标记的版本 ID</span></span></span></p></td><td><p><span><span><span>string</span></span></span></p></td></tr><tr><td><p><span><span><span>x-cos-delete-marker</span></span></span></p></td><td><p><span><span><span><span>当使用 versionId 请求参数指定删除标记的版本 ID 时，将返回此响应头部且值为 true，代表删除的版本 ID 对应的是一个删除标记</span></span></span></span></p><p><span><span><span><span>当未使用 versionId 请求参数，且指定对象所在的存储桶启用了版本控制时，将返回此响应头部且值为 true，代表该删除请求创建了一个删除标记作为对象的最新版本</span></span></span></span></p></td><td><p><span><span><span>boolean</span></span></span></p></td></tr></tbody></table>

#### 响应体

此响应体为空。

#### 错误码

此接口遵循统一的错误响应和错误码，详情请参见 [错误码](https://cloud.tencent.com/document/product/436/7730 "https://cloud.tencent.com/document/product/436/7730") 文档。

## 实际案例

#### 案例一：未启用版本控制

#### 请求

#### 响应

```shell
HTTP/1.1 204 No ContentContent-Length: 0Connection: closeDate: Wed, 14 Aug 2019 11:59:40 GMTServer: tencent-cosx-cos-request-id: NWQ1M2Y3YWNfMzdiMDJhMDlfODA1Yl8xZThj****
```

#### 案例二：启用版本控制（创建删除标记）

#### 请求

#### 响应

```shell
HTTP/1.1 204 No ContentContent-Length: 0Connection: closeDate: Wed, 14 Aug 2019 12:00:21 GMTServer: tencent-cosx-cos-delete-marker: truex-cos-request-id: NWQ1M2Y3ZDVfN2RiNDBiMDlfMmMwNmVfMTc4****x-cos-version-id: MTg0NDUxNzgyODk2ODc1NjY0NzQ
```

#### 案例三：永久删除指定版本

#### 请求

#### 响应

```shell
HTTP/1.1 204 No ContentContent-Length: 0Connection: closeDate: Wed, 14 Aug 2019 12:00:32 GMTServer: tencent-cosx-cos-request-id: NWQ1M2Y3ZTBfODhjMjJhMDlfMWNkOF8xZDZi****x-cos-version-id: MTg0NDUxNzgyODk3MDgyMzI4NDY
```

#### 案例四：永久删除指定删除标记

#### 请求

#### 响应

```shell
HTTP/1.1 204 No ContentContent-Length: 0Connection: closeDate: Wed, 14 Aug 2019 12:00:42 GMTServer: tencent-cosx-cos-delete-marker: truex-cos-request-id: NWQ1M2Y3ZWFfNzljMDBiMDlfMjkyMDJfMWRjNjVm****x-cos-version-id: MTg0NDUxNzgyODk2ODc1NjY0NzQ
```