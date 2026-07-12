[API 中心](/document/api)

## PUT Object - Copy

最近更新时间：2026-05-29 09:44:33

-   微信扫一扫 
-   QQ
-   新浪微博
-   复制链接
    
    链接复制成功
    

_我的收藏_

## 功能描述

PUT Object - Copy 接口请求创建一个已存在 COS 的对象的副本，即将一个对象从源路径（对象键）复制到目标路径（对象键）。建议对象大小为1M到5G，超过5G的对象请使用分块上传 [Upload Part - Copy](https://cloud.tencent.com/document/product/436/8287) 。

在复制过程中，可以指定元数据的处理方式。默认情况下元数据将被复制到目标对象中，用户也可以选择不复制源对象的元数据信息，而在此接口请求中指定新的元数据信息。但是，除非在此接口请求中显式指定存储类型、访问控制列表（ACL）和服务端加密（SSE），否则无论何种处理方式，目标对象均保持为标准存储，继承（default）目标存储桶的 ACL 且不会使用 SSE。

用户可以通过此接口实现对象移动、重命名、修改对象元数据和创建副本。

该 API 的请求者需要对被复制对象有读取权限，或者被复制对象向所有人开放了读取权限（公有读），且需要对目标存储桶有写入权限。

## 授权说明

源存储桶的授权策略中 action 设置为 `cos:GetObject` 。目标存储桶的授权策略中 action 设置为 `cos:PutObject` 。查看所有 [action](https://cloud.tencent.com/document/product/598/69901) 。

### 版本控制

如果源对象所在存储桶启用了版本控制，则默认复制源对象的最新版本，可以在请求头部 x-cos-copy-source 中指定 versionId 参数来复制指定版本。

如果对目标存储桶启用版本控制，对象存储将自动为目标对象生成唯一的版本 ID。

## 请求

### 请求示例

```
PUT /<ObjectKey> HTTP/1.1Host: <BucketName-APPID>.cos.<Region>.myqcloud.comDate: GMT Datex-cos-copy-source: <SourceBucketName-SourceAPPID>.cos.<SourceRegion>.myqcloud.com/<SourceObjectKey>Content-Length: 0Authorization: Auth String
```

**说明：**

Host: <BucketName-APPID>.cos.<Region>.myqcloud.com，其中 <BucketName-APPID> 为带 APPID 后缀的存储桶名字，例如 examplebucket-1250000000，可参阅 [存储桶概览 > 基本信息](https://cloud.tencent.com/document/product/436/48921#.E5.9F.BA.E6.9C.AC.E4.BF.A1.E6.81.AF) 和 [存储桶概述 > 存储桶命名规范](https://cloud.tencent.com/document/product/436/13312#.E5.AD.98.E5.82.A8.E6.A1.B6.E5.91.BD.E5.90.8D.E8.A7.84.E8.8C.83) 文档；<Region> 为 COS 的可用地域，可参阅 [地域和访问域名](http://cloud.tencent.com/document/product/436/6224) 文档。

Authorization: Auth String（详情请参见 [请求签名](https://cloud.tencent.com/document/product/436/7778) 文档）。

### 请求参数

此接口无请求参数。

### 请求头

此接口除使用公共请求头部外，还支持以下请求头部，了解公共请求头部详情请参见 [公共请求头部](https://cloud.tencent.com/document/product/436/7728) 文档。

<table><colgroup><col width="18%"> <col width="61%"> <col width="10%"> <col width="11%"></colgroup><tbody><tr><td><p><span><span><span>名称</span></span></span></p></td><td><p><span><span><span>描述</span></span></span></p></td><td><p><span><span><span>类型</span></span></span></p></td><td><p><span><span><span>是否必选</span></span></span></p></td></tr><tr><td><p><span><span><span>x-cos-copy-source</span></span></span></p></td><td><p><span><span><span>源对象的 URL，其中对象键需经过 URL encode，可以通过 versionId 参数指定源对象的版本，例如：</span></span></span></p><p><span><span><code><span>sourcebucket-1250000001.cos.ap-shanghai.myqcloud.com/example-%E8%85%BE%E8%AE%AF%E4%BA%91.jpg</span></code></span></span></p><p><span><span><span>或 </span></span></span><span><span><code><span>sourcebucket-1250000001.cos.ap-shanghai.myqcloud.com/example-%E8%85%BE%E8%AE%AF%E4%BA%91.jpg?versionId=MTg0NDUxNzYzMDc0NDMzNDExOTc</span></code></span></span></p></td><td><p><span><span><span>string</span></span></span></p></td><td><p><span><span><span>是</span></span></span></p></td></tr><tr><td><p><span><span><span>x-cos-metadata-directive</span></span></span></p></td><td><p><span><span><span>是否复制源对象的元数据信息，枚举值：Copy，Replaced，默认为 Copy。</span></span></span></p><p><span><span><span><span>如果标记为 Copy，则复制源对象的元数据信息</span></span></span></span></p><p><span><span><span><span>如果标记为 Replaced，则按本次请求的请求头中的元数据信息作为目标对象的元数据信息</span></span></span></span></p><p><span><span><span>当目标对象和源对象为同一对象时，即用户试图修改元数据时，则标记必须为 Replaced</span></span></span></p></td><td><p><span><span><span>Enum</span></span></span></p></td><td><p><span><span><span>否</span></span></span></p></td></tr><tr><td><p><span><span><span>x-cos-copy-source-If-Modified-Since</span></span></span></p></td><td><p><span><span><span>当源对象在指定时间后被修改，则执行复制操作，否则返回 HTTP 状态码为412（Precondition Failed）。时间格式为 RFC1123 GMT。合法值示例：</span></span></span> <span><span><code><span>Tue, 08 Jun 2021 06:19:53 GMT</span></code></span></span></p></td><td><p><span><span><span>string</span></span></span></p></td><td><p><span><span><span>否</span></span></span></p></td></tr><tr><td><p><span><span><span>x-cos-copy-source-If-Unmodified-Since</span></span></span></p></td><td><p><span><span><span>当源对象在指定时间后未被修改，则执行复制操作，否则返回 HTTP 状态码为412（Precondition Failed）。时间格式为 RFC1123 GMT。合法值示例：</span></span></span> <span><span><code><span>Tue, 08 Jun 2021 06:19:53 GMT</span></code></span></span></p></td><td><p><span><span><span>string</span></span></span></p></td><td><p><span><span><span>否</span></span></span></p></td></tr><tr><td><p><span><span><span>x-cos-copy-source-If-Match</span></span></span></p></td><td><p><span><span><span>当源对象的 ETag 与指定的值一致，则执行复制操作，否则返回 HTTP 状态码为412（Precondition Failed）</span></span></span></p></td><td><p><span><span><span>string</span></span></span></p></td><td><p><span><span><span>否</span></span></span></p></td></tr><tr><td><p><span><span><span>x-cos-copy-source-If-None-Match</span></span></span></p></td><td><p><span><span><span>当源对象的 ETag 与指定的值不一致，则执行复制操作，否则返回 HTTP 状态码为412（Precondition Failed）</span></span></span></p></td><td><p><span><span><span>string</span></span></span></p></td><td><p><span><span><span>否</span></span></span></p></td></tr><tr><td><p><span><span><span>x-cos-storage-class</span></span></span></p></td><td><p><span><span><span>目标对象的存储类型。枚举值请参见 </span></span></span><a href="https://cloud.tencent.com/document/product/436/33417"><span><span><span><span>存储类型</span></span></span></span></a> <span><span><span>文档，例如 INTELLIGENT_TIERING，MAZ_INTELLIGENT_TIERING，STANDARD_IA，ARCHIVE，DEEP_ARCHIVE。默认值：STANDARD</span></span></span></p></td><td><p><span><span><span>Enum</span></span></span></p></td><td><p><span><span><span>否</span></span></span></p></td></tr><tr><td><p><span><span><span>x-cos-tagging</span></span></span></p></td><td><p><span><span><span>目标对象的标签集合，最多可设置10个标签（例如，Key1=Value1&amp;Key2=Value2）。 标签集合中的 Key 和 Value 必须先进行 URL 编码</span></span></span></p></td><td><p><span><span><span>string</span></span></span></p></td><td><p><span><span><span>否</span></span></span></p></td></tr><tr><td><p><span><span><span>x-cos-tagging-directive</span></span></span></p></td><td><p><span><span><span>是否复制源对象的标签信息，枚举值：Copy，Replaced，默认为 Copy</span></span></span></p><p><span><span><span><span>如果标记为 Copy，则复制源对象的标签信息</span></span></span></span></p><p><span><span><span><span>如果标记为 Replaced，则按本次请求的请求头中的标签信息作为目标对象的标签信息</span></span></span></span></p><p><span><span><span>当目标对象和源对象为同一对象时，即用户试图修改对象标签时，则标记必须为 Replaced</span></span></span></p></td><td><p><span><span><span>Enum</span></span></span></p></td><td><p><span><span><span>否</span></span></span></p></td></tr><tr><td><p><span><span><span>x-cos-forbid-overwrite</span></span></span></p></td><td><p><span><span><b><span>针对未开启版本控制的存储桶</span></b></span></span> <span><span><span>，上传文件时，用于指定上传操作时是否禁止覆盖同名对象：</span></span></span></p><p><span><span><span><span>不携带 x-cos-forbid-overwrite 头部或指定为 false 时，默认覆盖同名 Object；</span></span></span></span></p><p><span><span><span><span>指定 x-cos-forbid-overwrite 为 true 时，表示禁止覆盖同名 Object。</span></span></span></span></p></td><td><p><span><span><span>string</span></span></span></p></td><td><p><span><span><span>否</span></span></span></p></td></tr></tbody></table>

##### 目标对象元数据相关头部

在复制对象时可以通过指定下列请求头部来设置目标对象的元数据信息，此时请求头部 x-cos-metadata-directive 需指定为 Replaced，否则目标对象将使用源对象的元数据信息且不能指定下列任何头部。

<table><colgroup><col width="15%"> <col width="62%"> <col width="12%"> <col width="11%"></colgroup><tbody><tr><td><p><span><span><span>名称</span></span></span></p></td><td><p><span><span><span>描述</span></span></span></p></td><td><p><span><span><span>类型</span></span></span></p></td><td><p><span><span><span>是否必选</span></span></span></p></td></tr><tr><td><p><span><span><span>Cache-Control</span></span></span></p></td><td><p><span><span><span>RFC 2616中定义的缓存指令，将作为目标对象元数据保存</span></span></span></p></td><td><p><span><span><span>string</span></span></span></p></td><td><p><span><span><span>否</span></span></span></p></td></tr><tr><td><p><span><span><span>Content-Disposition</span></span></span></p></td><td><p><span><span><span>RFC 2616中定义的文件名称，将作为目标对象元数据保存</span></span></span></p></td><td><p><span><span><span>string</span></span></span></p></td><td><p><span><span><span>否</span></span></span></p></td></tr><tr><td><p><span><span><span>Content-Encoding</span></span></span></p></td><td><p><span><span><span>RFC 2616中定义的编码格式，将作为目标对象元数据保存</span></span></span></p></td><td><p><span><span><span>string</span></span></span></p></td><td><p><span><span><span>否</span></span></span></p></td></tr><tr><td><p><span><span><span>Content-Type</span></span></span></p></td><td><p><span><span><span>RFC 2616中定义的 HTTP 请求内容类型（MIME），此头部用于描述目标对象的内容类型，将作为目标对象元数据保存</span></span></span></p><p><span><span><span>例如 </span></span></span><span><span><code><span>text/html</span></code></span></span> <span><span><span>或 </span></span></span><span><span><code><span>image/jpeg</span></code></span></span></p></td><td><p><span><span><span>string</span></span></span></p></td><td><p><span><span><span>否</span></span></span></p></td></tr><tr><td><p><span><span><span>Expires</span></span></span></p></td><td><p><span><span><span>RFC 2616中定义的缓存失效时间，将作为目标对象元数据保存</span></span></span></p></td><td><p><span><span><span>string</span></span></span></p></td><td><p><span><span><span>否</span></span></span></p></td></tr><tr><td><p><span><span><span>x-cos-meta-</span></span></span> <span><span><span>*</span></span></span></p></td><td><p><span><span><span>包括用户自定义元数据头部后缀和用户自定义元数据信息，将作为目标对象元数据保存，大小限制为2KB</span></span></span></p><p><span><span><b><span>注意：用户自定义元数据信息支持下划线（_），但用户自定义元数据头部后缀不支持下划线，仅支持减号（-）</span></b></span></span></p></td><td><p><span><span><span>string</span></span></span></p></td><td><p><span><span><span>否</span></span></span></p></td></tr></tbody></table>

##### 目标对象访问控制列表（ACL）相关头部

在复制对象时可以通过指定下列请求头部来设置目标对象的访问权限：

<table><colgroup><col width="18%"> <col width="61%"> <col width="9%"> <col width="12%"></colgroup><tbody><tr><td><p><span><span><span>名称</span></span></span></p></td><td><p><span><span><span>描述</span></span></span></p></td><td><p><span><span><span>类型</span></span></span></p></td><td><p><span><span><span>是否必选</span></span></span></p></td></tr><tr><td><p><span><span><span>x-cos-acl</span></span></span></p></td><td><p><span><span><span>定义目标对象的访问控制列表（ACL）属性。枚举值请参见 </span></span></span><a href="https://cloud.tencent.com/document/product/436/30752#.E9.A2.84.E8.AE.BE.E7.9A.84-acl"><span><span><span><span>ACL 概述</span></span></span></span></a> <span><span><span>文档中对象的预设 ACL 部分，例如 default，private，public-read 等，默认为 default</span></span></span></p><p><span><span><b><span>注意：如果您不需要进行对象 ACL 控制，请设置为 default 或者此项不进行设置，默认继承存储桶权限</span></b></span></span></p></td><td><p><span><span><span>Enum</span></span></span></p></td><td><p><span><span><span>否</span></span></span></p></td></tr><tr><td><p><span><span><span>x-cos-grant-read</span></span></span></p></td><td><p><span><span><span>赋予被授权者读取目标对象的权限，格式为 id="[OwnerUin]"，例如 id="100000000001"，可使用半角逗号（,）分隔多组被授权者，例如</span></span></span> <span><span><code><span>id="100000000001",id="100000000002"</span></code></span></span></p></td><td><p><span><span><span>string</span></span></span></p></td><td><p><span><span><span>否</span></span></span></p></td></tr><tr><td><p><span><span><span>x-cos-grant-read-acp</span></span></span></p></td><td><p><span><span><span>赋予被授权者读取目标对象的访问控制列表（ACL）的权限，格式为 id="[OwnerUin]"，例如 id="100000000001"，可使用半角逗号（,）分隔多组被授权者，例如</span></span></span> <span><span><code><span>id="100000000001",id="100000000002"</span></code></span></span></p></td><td><p><span><span><span>string</span></span></span></p></td><td><p><span><span><span>否</span></span></span></p></td></tr><tr><td><p><span><span><span>x-cos-grant-write-acp</span></span></span></p></td><td><p><span><span><span>赋予被授权者写入目标对象的访问控制列表（ACL）的权限，格式为 id="[OwnerUin]"，例如 id="100000000001"，可使用半角逗号（,）分隔多组被授权者，例如</span></span></span> <span><span><code><span>id="100000000001",id="100000000002"</span></code></span></span></p></td><td><p><span><span><span>string</span></span></span></p></td><td><p><span><span><span>否</span></span></span></p></td></tr><tr><td><p><span><span><span>x-cos-grant-full-control</span></span></span></p></td><td><p><span><span><span>赋予被授权者操作目标对象的所有权限，格式为 id="[OwnerUin]"，例如 id="100000000001"，可使用半角逗号（,）分隔多组被授权者，例如</span></span></span> <span><span><code><span>id="100000000001",id="100000000002"</span></code></span></span></p></td><td><p><span><span><span>string</span></span></span></p></td><td><p><span><span><span>否</span></span></span></p></td></tr></tbody></table>

##### 源对象服务端加密（SSE）相关头部

如果源对象使用了服务端加密且加密方式为 SSE-C 时，则需要指定下列请求头部来解密源对象：

<table><colgroup><col width="28%"> <col width="40%"> <col width="10%"> <col width="22%"></colgroup><tbody><tr><td><p><span><span><span>名称</span></span></span></p></td><td><p><span><span><span>描述</span></span></span></p></td><td><p><span><span><span>类型</span></span></span></p></td><td><p><span><span><span>是否必选</span></span></span></p></td></tr><tr><td><p><span><span><span>x-cos-copy-source-server-side-encryption-customer-algorithm</span></span></span></p></td><td><p><span><span><span>服务端加密算法，目前仅支持 AES256</span></span></span></p></td><td><p><span><span><span>string</span></span></span></p></td><td><p><span><span><span>源对象使用 SSE-C 时，此头部是必选项</span></span></span></p></td></tr><tr><td><p><span><span><span>x-cos-copy-source-server-side-encryption-customer-key</span></span></span></p></td><td><p><span><span><span>服务端加密密钥的 Base64编码，例如</span></span></span></p><p><span><span><code><span>MDEyMzQ1Njc4OUFCQ</span></code></span></span></p><p><span><span><code><span>0RFRjAxMjM0NTY3ODlBQkNERUY=</span></code></span></span></p></td><td><p><span><span><span>string</span></span></span></p></td><td><p><span><span><span>源对象使用 SSE-C 时，此头部是必选项</span></span></span></p></td></tr><tr><td><p><span><span><span>x-cos-copy-source-server-side-encryption-customer-key-MD5</span></span></span></p></td><td><p><span><span><span>服务端加密密钥的 MD5哈希值，使用 Base64 编码</span></span></span></p><p><span><span><span>例如 </span></span></span><span><span><code><span>U5L61r7jcwdNvT7frmUG8g==</span></code></span></span></p></td><td><p><span><span><span>string</span></span></span></p></td><td><p><span><span><span>源对象使用 SSE-C 时，此头部是必选项</span></span></span></p></td></tr></tbody></table>

##### 目标对象服务端加密（SSE）相关头部

在复制对象时可以使用服务端加密，请参见 [服务端加密专用头部](https://cloud.tencent.com/document/product/436/7728#.E6.9C.8D.E5.8A.A1.E7.AB.AF.E5.8A.A0.E5.AF.86.E4.B8.93.E7.94.A8.E5.A4.B4.E9.83.A8) 。

### 请求体

此接口无请求体。

## 响应

### 响应头

此接口除返回公共响应头部外，还返回以下响应头部，了解公共响应头部详情请参见 [公共响应头部](https://cloud.tencent.com/document/product/436/7729) 文档。

##### 版本控制相关头部

当指定了源对象的版本 ID 时，将返回下列响应头部：

<table><colgroup><col width="33.33%"> <col width="33.33%"> <col width="33.34%"></colgroup><tbody><tr><td><p><span><span><span>名称</span></span></span></p></td><td><p><span><span><span>描述</span></span></span></p></td><td><p><span><span><span>类型</span></span></span></p></td></tr><tr><td><p><span><span><span>x-cos-copy-source-version-id</span></span></span></p></td><td><p><span><span><span>源对象的版本 ID</span></span></span></p></td><td><p><span><span><span>string</span></span></span></p></td></tr></tbody></table>

##### 服务端加密（SSE）相关头部

如果在复制对象时使用了服务端加密，则此接口将返回服务端加密专用头部，请参见 [服务端加密专用头部](https://cloud.tencent.com/document/product/436/7729#.E6.9C.8D.E5.8A.A1.E7.AB.AF.E5.8A.A0.E5.AF.86.E4.B8.93.E7.94.A8.E5.A4.B4.E9.83.A8) 。

### 响应体

查询成功，返回 **application/xml** 数据，包含对象复制结果信息。

```xml
<?xml version="1.0" encoding="UTF-8"?><CopyObjectResult>            <ETag>string</ETag>            <CRC64>number</CRC64>            <LastModified>date</LastModified>            <VersionId>string</VersionId></CopyObjectResult>
```

具体的节点描述如下：

<table><colgroup><col width="24%"> <col width="12%"> <col width="51%"> <col width="13%"></colgroup><tbody><tr><td><p><span><span><span>节点名称（关键字）</span></span></span></p></td><td><p><span><span><span>父节点</span></span></span></p></td><td><p><span><span><span>描述</span></span></span></p></td><td><p><span><span><span>类型</span></span></span></p></td></tr><tr><td><p><span><span><span>CopyObjectResult</span></span></span></p></td><td><p><span><span><span>无</span></span></span></p></td><td><p><span><span><span>保存 PUT Object - Copy 结果的所有信息</span></span></span></p></td><td><p><span><span><span>Container</span></span></span></p></td></tr></tbody></table>

**Container 节点 CopyObjectResult 的内容：**

<table><colgroup><col width="19%"> <col width="19%"> <col width="52%"> <col width="10%"></colgroup><tbody><tr><td><p><span><span><span>节点名称（关键字）</span></span></span></p></td><td><p><span><span><span>父节点</span></span></span></p></td><td><p><span><span><span>描述</span></span></span></p></td><td><p><span><span><span>类型</span></span></span></p></td></tr><tr><td><p><span><span><span>ETag</span></span></span></p></td><td><p><span><span><span>CopyObjectResult</span></span></span></p></td><td><p><span><span><span>对象的实体标签（Entity Tag），是对象被创建时标识对象内容的信息标签，可用于检查对象的内容是否发生变化</span></span></span></p><p><span><span><span>例如 </span></span></span><span><span><code><span>8e0b617ca298a564c3331da28dcb50df</span></code></span></span> <span><span><span>，此头部并不一定返回对象的 MD5 值，而是根据对象上传和加密方式而有所不同</span></span></span></p></td><td><p><span><span><span>string</span></span></span></p></td></tr><tr><td><p><span><span><span>CRC64</span></span></span></p></td><td><p><span><span><span>CopyObjectResult</span></span></span></p></td><td><p><span><span><span>对象的 CRC64值，详情请参见 </span></span></span><a href="https://cloud.tencent.com/document/product/436/40334"><span><span><span><span>CRC64校验</span></span></span></span></a> <span><span><span>文档</span></span></span></p></td><td><p><span><span><span>number</span></span></span></p></td></tr><tr><td><p><span><span><span>LastModified</span></span></span></p></td><td><p><span><span><span>CopyObjectResult</span></span></span></p></td><td><p><span><span><span>对象最后修改时间，为 ISO8601格式，例如 </span></span></span><span><span><code><span>2019-05-24T10:56:40Z</span></code></span></span></p></td><td><p><span><span><span>date</span></span></span></p></td></tr><tr><td><p><span><span><span>VersionId</span></span></span></p></td><td><p><span><span><span>CopyObjectResult</span></span></span></p></td><td><p><span><span><span>对象的版本 ID，仅当目标存储桶启用了版本控制时才返回该元素</span></span></span></p></td><td><p><span><span><span>string</span></span></span></p></td></tr></tbody></table>

#### 错误码

此接口遵循统一的错误响应和错误码，详情请参见 [错误码](https://cloud.tencent.com/document/product/436/7730) 文档。

## 实际案例

此接口响应默认为 Transfer-Encoding: chunked 编码方式，为了方便阅读，本文档实际案例均采用无 Transfer-Encoding 的方式展示，在使用过程中，不同语言和库可以自动处理这种编码形式，请开发者注意识别和处理，更多信息请查阅语言和库的相关文档。

### 案例一：简单案例

#### 请求

#### 响应

```xml
HTTP/1.1 200 OKContent-Type: application/xmlContent-Length: 219Connection: closeDate: Fri, 10 Apr 2020 18:20:30 GMTServer: tencent-cosx-cos-request-id: NWU5MGI4ZWVfNzljMDBiMDlfMWM3MjlfMWQ1****﻿
﻿
﻿
<?xml version="1.0" encoding="UTF-8"?><CopyObjectResult>            <ETag>"ee8de918d05640145b18f70f4c3aa602"</ETag>            <CRC64>16749565679157681890</CRC64>            <LastModified>2020-04-10T18:20:30Z</LastModified></CopyObjectResult>
```

### 案例二：复制时替换元数据

#### 请求

#### 响应

```xml
HTTP/1.1 200 OKContent-Type: application/xmlContent-Length: 219Connection: closeDate: Fri, 10 Apr 2020 18:20:41 GMTServer: tencent-cosx-cos-request-id: NWU5MGI4ZjlfYTZjMDBiMDlfN2Y1YV8xYjI4****﻿
﻿
﻿
<?xml version="1.0" encoding="UTF-8"?><CopyObjectResult>            <ETag>"ee8de918d05640145b18f70f4c3aa602"</ETag>            <CRC64>16749565679157681890</CRC64>            <LastModified>2020-04-10T18:20:41Z</LastModified></CopyObjectResult>
```

### 案例三：修改对象元数据

#### 请求

#### 响应

```xml
HTTP/1.1 200 OKContent-Type: application/xmlContent-Length: 219Connection: closeDate: Fri, 10 Apr 2020 18:20:52 GMTServer: tencent-cosx-cos-request-id: NWU5MGI5MDRfNmRjMDJhMDlfZGNmYl8yMDVh****﻿
﻿
﻿
<?xml version="1.0" encoding="UTF-8"?><CopyObjectResult>            <ETag>"ee8de918d05640145b18f70f4c3aa602"</ETag>            <CRC64>16749565679157681890</CRC64>            <LastModified>2020-04-10T18:20:52Z</LastModified></CopyObjectResult>
```

### 案例四：修改对象存储类型

本案例演示将对象从标准存储转换为归档存储，该使用方法也适合标准存储与低频存储之间的互相转换，如果希望将归档存储或深度归档存储的对象转换为其他存储类型，需要首先使用 [POST Object restore](https://cloud.tencent.com/document/product/436/12633) 将归档存储或深度归档存储的对象回热，才能使用该接口请求转换存储类型。

#### 请求

#### 响应

```xml
HTTP/1.1 200 OKContent-Type: application/xmlContent-Length: 219Connection: closeDate: Fri, 10 Apr 2020 18:21:02 GMTServer: tencent-cosx-cos-request-id: NWU5MGI5MGVfN2RiNDBiMDlfMTk1MjhfMWZm****﻿
﻿
﻿
<?xml version="1.0" encoding="UTF-8"?><CopyObjectResult>            <ETag>"ee8de918d05640145b18f70f4c3aa602"</ETag>            <CRC64>16749565679157681890</CRC64>            <LastModified>2020-04-10T18:21:55Z</LastModified></CopyObjectResult>
```

### 案例五：将未加密的对象复制为使用 SSE-COS 加密的目标对象

#### 请求

#### 响应

```xml
HTTP/1.1 200 OKContent-Type: application/xmlContent-Length: 219Connection: closeDate: Fri, 10 Apr 2020 18:21:13 GMTServer: tencent-cosx-cos-request-id: NWU5MGI5MTlfYmIwMmEwOV9hMmUxXzFkMDQ2****x-cos-server-side-encryption: AES256﻿
﻿
﻿
<?xml version="1.0" encoding="UTF-8"?><CopyObjectResult>            <ETag>"ee8de918d05640145b18f70f4c3aa602"</ETag>            <CRC64>16749565679157681890</CRC64>            <LastModified>2020-04-10T18:21:13Z</LastModified></CopyObjectResult>
```

### 案例六：将未加密的对象复制为使用 SSE-KMS 加密的目标对象

#### 请求

#### 响应

```xml
HTTP/1.1 200 OKContent-Type: application/xmlContent-Length: 219Connection: closeDate: Fri, 10 Apr 2020 18:21:23 GMTServer: tencent-cosx-cos-request-id: NWU5MGI5MjNfMTliOTJhMDlfMjRiYThfMTdk****x-cos-server-side-encryption: cos/kmsx-cos-server-side-encryption-cos-kms-key-id: 48ba38aa-26c5-11ea-855c-52540085****﻿
﻿
﻿
<?xml version="1.0" encoding="UTF-8"?><CopyObjectResult>            <ETag>"f69901ec9755a5defc29057e9ec69126"</ETag>            <CRC64>16749565679157681890</CRC64>            <LastModified>2020-04-10T18:22:16Z</LastModified></CopyObjectResult>
```

### 案例七：复制 SSE-C 加密的对象并更换密钥

#### 请求

#### 响应

```xml
HTTP/1.1 200 OKContent-Type: application/xmlContent-Length: 219Connection: closeDate: Fri, 10 Apr 2020 18:21:44 GMTServer: tencent-cosx-cos-request-id: NWU5MGI5MzhfZmFjODJhMDlfMTdlYzZfYmU1****x-cos-server-side-encryption-customer-algorithm: AES256x-cos-server-side-encryption-customer-key-MD5: hRasmdxgYDKV3nvbahU1MA==﻿
﻿
﻿
<?xml version="1.0" encoding="UTF-8"?><CopyObjectResult>            <ETag>"bf314b89d34119395d5610982d6581b1"</ETag>            <CRC64>16749565679157681890</CRC64>            <LastModified>2020-04-10T18:22:31Z</LastModified></CopyObjectResult>
```

### 案例八：将 SSE-C 加密的对象修改为不加密

#### 请求

#### 响应

```xml
HTTP/1.1 200 OKContent-Type: application/xmlContent-Length: 219Connection: closeDate: Fri, 10 Apr 2020 18:22:05 GMTServer: tencent-cosx-cos-request-id: NWU5MGI5NGRfOWFjOTJhMDlfMjg2NDdfMTA0****﻿
﻿
﻿
<?xml version="1.0" encoding="UTF-8"?><CopyObjectResult>            <ETag>"ee8de918d05640145b18f70f4c3aa602"</ETag>            <CRC64>16749565679157681890</CRC64>            <LastModified>2020-04-10T18:22:58Z</LastModified></CopyObjectResult>
```

### 案例九：指定源对象的版本

#### 请求

#### 响应

```xml
HTTP/1.1 200 OKContent-Type: application/xmlContent-Length: 219Connection: closeDate: Sat, 11 Apr 2020 17:51:35 GMTServer: tencent-cosx-cos-copy-source-version-id: MTg0NDUxNTc0NDYyMjQ2MzUzMjQx-cos-request-id: NWU5MjAzYTdfMWZjMDJhMDlfNTE4N18zNGU2****﻿
﻿
﻿
<?xml version="1.0" encoding="UTF-8"?><CopyObjectResult>            <ETag>"ee8de918d05640145b18f70f4c3aa602"</ETag>            <CRC64>16749565679157681890</CRC64>            <LastModified>2020-04-11T17:51:35Z</LastModified></CopyObjectResult>
```

### 案例十：复制对象到启用版本控制的存储桶

#### 请求

#### 响应

```xml
HTTP/1.1 200 OKContent-Type: application/xmlContent-Length: 272Connection: closeDate: Sat, 11 Apr 2020 17:51:56 GMTServer: tencent-cosx-cos-request-id: NWU5MjAzYmNfNjRiMDJhMDlfOTE3N18yYWI4****﻿
﻿
﻿
<?xml version="1.0" encoding="UTF-8"?><CopyObjectResult>            <ETag>"22e024392de860289f0baa7d6cf8a549"</ETag>            <CRC64>11596229263574363878</CRC64>            <LastModified>2020-04-11T17:51:56Z</LastModified>            <VersionId>MTg0NDUxNTc0NDYxOTI4MzU0MDI</VersionId></CopyObjectResult>
```