[API 中心](/document/api)

## GET Object

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

GET Object 接口请求可以将 COS 存储桶中的对象（Object）下载至本地。该 API 的请求者需要对目标对象有读取权限，或者目标对象向所有人开放了读取权限（公有读）。

## 授权说明

授权策略中 action 设置为 cos:GetObject 。查看所有 [action](https://cloud.tencent.com/document/product/598/69901 "https://cloud.tencent.com/document/product/598/69901") 。

#### 版本控制

当启用版本控制时，该 GET 操作可以使用 versionId 请求参数指定要返回的版本 ID，此时将返回对象的指定版本。若指定版本为删除标记，则返回 HTTP 响应码404（Not Found），否则将返回指定对象的最新版本。

#### 归档类型

如果该 GET 请求操作的对象为 **归档存储和深度归档存储类型** ，且没有使用 [POST Object restore](https://cloud.tencent.com/document/product/436/12633 "https://cloud.tencent.com/document/product/436/12633") 进行恢复（或恢复后的副本已被过期删除），那么该请求将返回 HTTP 响应码403（Forbidden），同时在响应体中包含错误信息，其中错误码（Code）为 InvalidObjectState，表示对象的当前状态无法被 GET 请求操作，需要先经过恢复。

## 请求

#### 请求示例

```shell
GET /<ObjectKey> HTTP/1.1Host: <BucketName-APPID>.cos.<Region>.myqcloud.comDate: GMT DateAuthorization: Auth String
```

**说明**

Host: <BucketName-APPID>.cos.<Region>.myqcloud.com，其中 <BucketName-APPID> 为带 APPID 后缀的存储桶名字，例如 examplebucket-1250000000，可参阅 [存储桶概览 > 基本信息](https://cloud.tencent.com/document/product/436/48921#.E5.9F.BA.E6.9C.AC.E4.BF.A1.E6.81.AF "https://cloud.tencent.com/document/product/436/48921#.E5.9F.BA.E6.9C.AC.E4.BF.A1.E6.81.AF") 和 [存储桶概述 > 存储桶命名规范](https://cloud.tencent.com/document/product/436/13312#.E5.AD.98.E5.82.A8.E6.A1.B6.E5.91.BD.E5.90.8D.E8.A7.84.E8.8C.83 "https://cloud.tencent.com/document/product/436/13312#.E5.AD.98.E5.82.A8.E6.A1.B6.E5.91.BD.E5.90.8D.E8.A7.84.E8.8C.83") 文档；<Region> 为 COS 的可用地域，可参阅 [地域和访问域名](http://cloud.tencent.com/document/product/436/6224 "http://cloud.tencent.com/document/product/436/6224") 文档。

Authorization: Auth String（详情请参见 [请求签名](https://cloud.tencent.com/document/product/436/7778 "https://cloud.tencent.com/document/product/436/7778") 文档）。

#### 请求参数

<table><colgroup><col width="24%"> <col width="57%"> <col width="7%"> <col width="10%"></colgroup><tbody><tr><td><p><span><span><span>名称</span></span></span></p></td><td><p><span><span><span>描述</span></span></span></p></td><td><p><span><span><span>类型</span></span></span></p></td><td><p><span><span><span>是否必选</span></span></span></p></td></tr><tr><td><p><span><span><span>response-cache-control</span></span></span></p></td><td><p><span><span><span>设置响应中的 Cache-Control 头部的值</span></span></span></p></td><td><p><span><span><span>string</span></span></span></p></td><td><p><span><span><span>否</span></span></span></p></td></tr><tr><td><p><span><span><span>response-content-disposition</span></span></span></p></td><td><p><span><span><span>设置响应中的 Content-Disposition 头部的值</span></span></span></p></td><td><p><span><span><span>string</span></span></span></p></td><td><p><span><span><span>否</span></span></span></p></td></tr><tr><td><p><span><span><span>response-content-encoding</span></span></span></p></td><td><p><span><span><span>设置响应中的 Content-Encoding 头部的值</span></span></span></p></td><td><p><span><span><span>string</span></span></span></p></td><td><p><span><span><span>否</span></span></span></p></td></tr><tr><td><p><span><span><span>response-content-language</span></span></span></p></td><td><p><span><span><span>设置响应中的 Content-Language 头部的值</span></span></span></p></td><td><p><span><span><span>string</span></span></span></p></td><td><p><span><span><span>否</span></span></span></p></td></tr><tr><td><p><span><span><span>response-content-type</span></span></span></p></td><td><p><span><span><span>设置响应中的 Content-Type 头部的值</span></span></span></p></td><td><p><span><span><span>string</span></span></span></p></td><td><p><span><span><span>否</span></span></span></p></td></tr><tr><td><p><span><span><span>response-expires</span></span></span></p></td><td><p><span><span><span>设置响应中的 Expires 头部的值</span></span></span></p></td><td><p><span><span><span>string</span></span></span></p></td><td><p><span><span><span>否</span></span></span></p></td></tr><tr><td><p><span><span><span>versionId</span></span></span></p></td><td><p><span><span><span>当启用版本控制时，指定要下载的版本 ID，如不指定则下载对象的最新版本</span></span></span></p></td><td><p><span><span><span>string</span></span></span></p></td><td><p><span><span><span>否</span></span></span></p></td></tr></tbody></table>

#### 请求头

此接口除使用公共请求头部外，还支持以下请求头部，了解公共请求头部详情请参见 [公共请求头部](https://cloud.tencent.com/document/product/436/7728 "https://cloud.tencent.com/document/product/436/7728") 文档。

<table><colgroup><col width="16%"> <col width="65%"> <col width="8%"> <col width="9%"></colgroup><tbody><tr><td><p><span><span><span>名称</span></span></span></p></td><td><p><span><span><span>描述</span></span></span></p></td><td><p><span><span><span>类型</span></span></span></p></td><td><p><span><span><span>是否必选</span></span></span></p></td></tr><tr><td><p><span><span><span>Range</span></span></span></p></td><td><p><span><span><span>RFC 2616 中定义的字节范围，范围值必须使用 bytes=first-last 格式且仅支持单一范围，不支持多重范围。first 和 last 都是基于0开始的偏移量。示例如下：</span></span></span></p><p><span><span><span><code><span>Range: bytes=0-9</span></code></span></span> <span><span><span>表示下载对象的开头10个字节的数据。</span></span></span></span></p><p><span><span><span><code><span>Range: bytes=5-9</span></code></span></span> <span><span><span>表示下载对象的第6到第10个字节的数据。此时返回 HTTP 状态码206（Partial Content）及 Content-Range 响应头部。</span></span></span></span></p><p><span><span><span><code><span>Range: bytes=-10</span></code></span></span> <span><span><span>表示下载对象的最后10个字节的数据。</span></span></span></span></p><p><span><span><span><code><span>Range: bytes=10-</span></code></span></span> <span><span><span>表示下载对象的第10到最后字节的数据。</span></span></span></span></p><p><span><span><span><code><span>Range: bytes=0-</span></code></span></span> <span><span><span>表示下载对象的第一个字节到最后一个字节，即完整的文件内容。</span></span></span></span></p><p><span><span><span>仅下载部分字节数据的场景将返回 HTTP 状态码206（Partial Content）及 Content-Range 响应头部。</span></span></span></p><p><span><span><span>如果 first 和 last 的值都超过对象的大小，则返回 HTTP 状态码416（Requested Range Not Satisfiable）错误。</span></span></span></p><p><span><span><span>如果不指定，则表示下载整个对象</span></span></span></p></td><td><p><span><span><span>string</span></span></span></p></td><td><p><span><span><span>否</span></span></span></p></td></tr><tr><td><p><span><span><span>If-Modified-Since</span></span></span></p></td><td><p><span><span><span>当对象在指定时间后被修改，则返回对象，否则返回 HTTP 状态码为304（Not Modified）</span></span></span></p></td><td><p><span><span><span>string</span></span></span></p></td><td><p><span><span><span>否</span></span></span></p></td></tr><tr><td><p><span><span><span>If-Unmodified-Since</span></span></span></p></td><td><p><span><span><span>当对象在指定时间后未被修改，则返回对象，否则返回 HTTP 状态码为412（Precondition Failed）</span></span></span></p></td><td><p><span><span><span>string</span></span></span></p></td><td><p><span><span><span>否</span></span></span></p></td></tr><tr><td><p><span><span><span>If-Match</span></span></span></p></td><td><p><span><span><span>当对象的 ETag 与指定的值一致，则返回对象，否则返回 HTTP 状态码为412（Precondition Failed）</span></span></span></p></td><td><p><span><span><span>string</span></span></span></p></td><td><p><span><span><span>否</span></span></span></p></td></tr><tr><td><p><span><span><span>If-None-Match</span></span></span></p></td><td><p><span><span><span>当对象的 ETag 与指定的值不一致，则返回对象，否则返回 HTTP 状态码为304（Not Modified）</span></span></span></p></td><td><p><span><span><span>string</span></span></span></p></td><td><p><span><span><span>否</span></span></span></p></td></tr><tr><td><p><span><span><span>x-cos-traffic-limit</span></span></span></p></td><td><p><span><span><span>针对本次下载进行流量控制的限速值，必须为数字，单位默认为 bit/s。限速值设置范围为819200 - 838860800，即800Kb/s - 800Mb/s，如果超出该范围将返回400错误</span></span></span></p></td><td><p><span><span><span>integer</span></span></span></p></td><td><p><span><span><span>否</span></span></span></p></td></tr></tbody></table>

**服务端加密相关头部**

如果指定的对象使用了服务端加密且加密方式为 SSE-C 时，则需要指定服务端加密的相关头部来解密对象，请参见 [服务端加密专用头部](https://cloud.tencent.com/document/product/436/7728#.E6.9C.8D.E5.8A.A1.E7.AB.AF.E5.8A.A0.E5.AF.86.E4.B8.93.E7.94.A8.E5.A4.B4.E9.83.A8 "https://cloud.tencent.com/document/product/436/7728#.E6.9C.8D.E5.8A.A1.E7.AB.AF.E5.8A.A0.E5.AF.86.E4.B8.93.E7.94.A8.E5.A4.B4.E9.83.A8") 。

#### 请求体

此接口无请求体。

## 响应

#### 响应头

此接口除返回公共响应头部外，还返回以下响应头部，了解公共响应头部详情请参见 [公共响应头部](https://cloud.tencent.com/document/product/436/7729 "https://cloud.tencent.com/document/product/436/7729") 文档。

<table><colgroup><col width="16%"> <col width="73%"> <col width="9%"></colgroup><tbody><tr><td><p><span><span><span>名称</span></span></span></p></td><td><p><span><span><span>描述</span></span></span></p></td><td><p><span><span><span>类型</span></span></span></p></td></tr><tr><td><p><span><span><span>Cache-Control</span></span></span></p></td><td><p><span><span><span>RFC 2616 中定义的缓存指令，仅当对象元数据包含此项或通过请求参数指定了此项时才会返回该头部</span></span></span></p></td><td><p><span><span><span>string</span></span></span></p></td></tr><tr><td><p><span><span><span>Content-Disposition</span></span></span></p></td><td><p><span><span><span>RFC 2616 中定义的文件名称，仅当对象元数据包含此项或通过请求参数指定了此项时才会返回该头部</span></span></span></p></td><td><p><span><span><span>string</span></span></span></p></td></tr><tr><td><p><span><span><span>Content-Encoding</span></span></span></p></td><td><p><span><span><span>RFC 2616 中定义的编码格式，仅当对象元数据包含此项或通过请求参数指定了此项时才会返回该头部</span></span></span></p></td><td><p><span><span><span>string</span></span></span></p></td></tr><tr><td><p><span><span><span>Content-Range</span></span></span></p></td><td><p><span><span><span>RFC 2616 中定义的返回内容的字节范围，仅当请求中指定了 Range 请求头部时才会返回该头部</span></span></span></p></td><td><p><span><span><span>string</span></span></span></p></td></tr><tr><td><p><span><span><span>Expires</span></span></span></p></td><td><p><span><span><span>RFC 2616 中定义的缓存失效时间，仅当对象元数据包含此项或通过请求参数指定了此项时才会返回该头部</span></span></span></p></td><td><p><span><span><span>string</span></span></span></p></td></tr><tr><td><p><span><span><span>x-cos-meta-</span></span></span> <span><span><span>*</span></span></span></p></td><td><p><span><span><span>包括用户自定义元数据头部后缀和用户自定义元数据信息</span></span></span></p></td><td><p><span><span><span>string</span></span></span></p></td></tr><tr><td><p><span><span><span>x-cos-storage-class</span></span></span></p></td><td><p><span><span><span>对象存储类型，枚举值请参见 </span></span></span><a href="https://cloud.tencent.com/document/product/436/33417" title="https://cloud.tencent.com/document/product/436/33417"><span><span><span><span>存储类型</span></span></span></span></a> <span><span><span>文档，例如 MAZ_STANDARD、MAZ_STANDARD_IA、INTELLIGENT_TIERING、MAZ_INTELLIGENT_TIERING、STANDARD_IA、ARCHIVE、DEEP_ARCHIVE。仅当对象不是标准存储（STANDARD）时才会返回该头部</span></span></span></p></td><td><p><span><span><span>enum</span></span></span></p></td></tr><tr><td><p><span><span><span>x-cos-storage-tier</span></span></span></p></td><td><p><span><span><span>当对象的存储类型为智能分层存储时，该头部表示对象所处的存储层，有效值：FREQUENT、INFREQUENT。</span></span></span></p></td><td><p><span><span><span>enum</span></span></span></p></td></tr></tbody></table>

**版本控制相关头部**

启用版本控制的存储桶内的对象将返回下列响应头部：

<table><tbody><tr><td><p><span><span><span>名称</span></span></span></p></td><td><p><span><span><span>描述</span></span></span></p></td><td><p><span><span><span>类型</span></span></span></p></td></tr><tr><td><p><span><span><span>x-cos-version-id</span></span></span></p></td><td><p><span><span><span>对象的版本 ID</span></span></span></p></td><td><p><span><span><span>string</span></span></span></p></td></tr></tbody></table>

**服务端加密相关头部**

如果指定的对象使用了服务端加密，则此接口将返回服务端加密专用头部，请参见 [服务端加密专用头部](https://cloud.tencent.com/document/product/436/7729#.E6.9C.8D.E5.8A.A1.E7.AB.AF.E5.8A.A0.E5.AF.86.E4.B8.93.E7.94.A8.E5.A4.B4.E9.83.A8 "https://cloud.tencent.com/document/product/436/7729#.E6.9C.8D.E5.8A.A1.E7.AB.AF.E5.8A.A0.E5.AF.86.E4.B8.93.E7.94.A8.E5.A4.B4.E9.83.A8") 。

#### 响应体

此接口请求的响应体为对象（文件）内容。

#### 错误码

此接口遵循统一的错误响应和错误码，详情请参见 [错误码](https://cloud.tencent.com/document/product/436/7730 "https://cloud.tencent.com/document/product/436/7730") 文档。

## 实际案例

#### 案例一：简单案例（未启用版本控制）

#### 请求

#### 响应

```shell
HTTP/1.1 200 OKContent-Type: image/jpegContent-Length: 16Connection: closeAccept-Ranges: bytesDate: Fri, 10 Apr 2020 09:35:16 GMTETag: "ee8de918d05640145b18f70f4c3aa602"Last-Modified: Fri, 10 Apr 2020 09:35:05 GMTServer: tencent-cosx-cos-hash-crc64ecma: 16749565679157681890x-cos-request-id: NWU5MDNkZDRfZDgyNzVkNjRfN2Q5M18xOWVi****﻿
﻿
﻿
[Object Content]
```

#### 案例二：通过请求参数指定响应头部

#### 请求

#### 响应

```shell
HTTP/1.1 200 OKContent-Type: application/octet-streamContent-Length: 16Connection: closeAccept-Ranges: bytesCache-Control: max-age=86400Content-Disposition: attachment; filename=example.jpgDate: Fri, 10 Apr 2020 09:35:17 GMTETag: "ee8de918d05640145b18f70f4c3aa602"Last-Modified: Fri, 10 Apr 2020 09:35:05 GMTServer: tencent-cosx-cos-hash-crc64ecma: 16749565679157681890x-cos-request-id: NWU5MDNkZDVfNjZjODJhMDlfMTY2MDdfMThm****﻿
﻿
﻿
[Object Content]
```

#### 案例三：通过请求头指定查询条件并返回 HTTP 状态码为304（Not Modified）

#### 请求

#### 响应

```shell
HTTP/1.1 304 Not ModifiedContent-Type: image/jpegContent-Length: 0Connection: closeDate: Wed, 29 Jul 2020 06:51:49 GMTETag: "ee8de918d05640145b18f70f4c3aa602"Server: tencent-cosx-cos-hash-crc64ecma: 16749565679157681890x-cos-request-id: NWYyMTFjODVfOGZiNzJhMDlfNDcxZjZfZDY2****
```

#### 案例四：通过请求头指定查询条件并返回 HTTP 状态码为412（Precondition Failed）

#### 请求

#### 响应

```shell
HTTP/1.1 412 Precondition FailedContent-Type: application/xmlContent-Length: 480Connection: closeDate: Wed, 29 Jul 2020 06:51:50 GMTServer: tencent-cosx-cos-request-id: NWYyMTFjODZfOGRjOTJhMDlfMmIyMWVfOTJl****﻿
﻿
﻿
<?xml version='1.0' encoding='utf-8' ?><Error>            <Code>PreconditionFailed</Code>            <Message>Precondition not match.</Message>            <Resource>examplebucket-1250000000.cos.ap-beijing.myqcloud.com/exampleobject</Resource>            <RequestId>NWYyMTFjODZfOGRjOTJhMDlfMmIyMWVfOTJl****</RequestId>            <TraceId>OGVmYzZiMmQzYjA2OWNhODk0NTRkMTBiOWVmMDAxODc0OWRkZjk0ZDM1NmI1M2E2MTRlY2MzZDhmNmI5MWI1OTdjMDczODYwZjM5YTU3ZmZmOWI5MmY4NjkxY2I3MGNiNjkyOWZiNzUxZjg5MGY2OWU4NmI0YWMwNTlhNTExYWU=</TraceId></Error>
```

#### 案例五：使用服务端加密 SSE-COS

#### 请求

#### 响应

```shell
HTTP/1.1 200 OKContent-Type: image/jpegContent-Length: 16Connection: closeAccept-Ranges: bytesDate: Fri, 10 Apr 2020 09:36:00 GMTETag: "ee8de918d05640145b18f70f4c3aa602"Last-Modified: Fri, 10 Apr 2020 09:35:49 GMTServer: tencent-cosx-cos-hash-crc64ecma: 16749565679157681890x-cos-request-id: NWU5MDNlMDBfMzdiMDJhMDlfYTgyNl8xNjA2****x-cos-server-side-encryption: AES256﻿
﻿
﻿
[Object Content]
```

#### 案例六：使用服务端加密 SSE-KMS

#### 请求

#### 响应

```shell
HTTP/1.1 200 OKContent-Type: image/jpegContent-Length: 16Connection: closeAccept-Ranges: bytesDate: Fri, 10 Apr 2020 09:36:11 GMTETag: "840af7c921f4b3230049af8663145bd0"Last-Modified: Fri, 10 Apr 2020 09:36:01 GMTServer: tencent-cosx-cos-hash-crc64ecma: 16749565679157681890x-cos-request-id: NWU5MDNlMGJfZGEyNzVkNjRfZDgxY18xYTBj****x-cos-server-side-encryption: cos/kmsx-cos-server-side-encryption-cos-kms-key-id: 48ba38aa-26c5-11ea-855c-52540085****﻿
﻿
﻿
[Object Content]
```

#### 案例七：使用服务端加密 SSE-C

#### 请求

#### 响应

```shell
HTTP/1.1 200 OKContent-Type: image/jpegContent-Length: 16Connection: closeAccept-Ranges: bytesDate: Fri, 10 Apr 2020 09:36:23 GMTETag: "582d9105f71525f3c161984bc005efb5"Last-Modified: Fri, 10 Apr 2020 09:36:12 GMTServer: tencent-cosx-cos-hash-crc64ecma: 16749565679157681890x-cos-request-id: NWU5MDNlMTdfNzBiODJhMDlfZTVmMV8xNDAy****x-cos-server-side-encryption-customer-algorithm: AES256x-cos-server-side-encryption-customer-key-MD5: U5L61r7jcwdNvT7frmUG8g==﻿
﻿
﻿
[Object Content]
```

#### 案例八：下载对象最新版本（启用版本控制）

#### 请求

#### 响应

```shell
HTTP/1.1 200 OKContent-Type: image/jpegContent-Length: 26Connection: closeAccept-Ranges: bytesDate: Fri, 10 Apr 2020 12:30:02 GMTETag: "22e024392de860289f0baa7d6cf8a549"Last-Modified: Fri, 10 Apr 2020 12:29:52 GMTServer: tencent-cosx-cos-hash-crc64ecma: 11596229263574363878x-cos-request-id: NWU5MDY2Y2FfMzFiYjBiMDlfMjE2NzVfMTgz****x-cos-version-id: MTg0NDUxNTc1NTE5MTc1NjM4MDA﻿
﻿
﻿
[Object Content Version 2]
```

#### 案例九：下载对象指定版本（启用版本控制）

#### 请求

#### 响应

```shell
HTTP/1.1 200 OKContent-Type: image/jpegContent-Length: 16Connection: closeAccept-Ranges: bytesDate: Fri, 10 Apr 2020 09:36:45 GMTETag: "ee8de918d05640145b18f70f4c3aa602"Last-Modified: Fri, 10 Apr 2020 09:36:35 GMTServer: tencent-cosx-cos-hash-crc64ecma: 16749565679157681890x-cos-request-id: NWU5MDNlMmRfNzBiODJhMDlfZTYwZl8xM2Fh****x-cos-version-id: MTg0NDUxNTc1NjIzMTQ1MDAwODg﻿
﻿
﻿
[Object Content]
```

#### 案例十：指定 Range 请求头部下载部分内容

#### 请求

#### 响应

```shell
HTTP/1.1 206 Partial ContentContent-Type: image/jpegContent-Length: 7Connection: closeAccept-Ranges: bytesContent-Range: bytes 8-14/16Date: Fri, 10 Apr 2020 12:32:37 GMTETag: "ee8de918d05640145b18f70f4c3aa602"Last-Modified: Fri, 10 Apr 2020 12:32:25 GMTServer: tencent-cosx-cos-hash-crc64ecma: 16749565679157681890x-cos-request-id: NWU5MDY3NjVfY2VjODJhMDlfOWVlZl8xNmMy****﻿
﻿
﻿
Content
```

#### 案例十一：下载未经恢复的归档（ARCHIVE）存储类型的对象

#### 请求

#### 响应

```shell
HTTP/1.1 403 ForbiddenContent-Type: application/xmlContent-Length: 513Connection: closeDate: Thu, 26 Dec 2019 11:57:24 GMTServer: tencent-cosx-cos-request-id: NWUwNGEwMjRfZDcyNzVkNjRfNjZlM183Zjcx****x-cos-storage-class: ARCHIVE﻿
﻿
﻿
<?xml version='1.0' encoding='utf-8' ?><Error>            <Code>InvalidObjectState</Code>            <Message>The operation is not valid for the object storage class.</Message>            <Resource>/exampleobject</Resource>            <RequestId>NWUwNGEwMjRfZDcyNzVkNjRfNjZlM183Zjcx****</RequestId>            <TraceId>OGVmYzZiMmQzYjA2OWNhODk0NTRkMTBiOWVmMDAxODc0OWRkZjk0ZDM1NmI1M2E2MTRlY2MzZDhmNmI5MWI1OTBjNjIyOGVlZmJlNDg4NDQ1MzAzMjA2ZDg4OGQ3MDhlMjIzYjI1ZWUwODY5YjdlMTBjY2EwNTgyZWMyMjc0Mjc=</TraceId></Error>
```