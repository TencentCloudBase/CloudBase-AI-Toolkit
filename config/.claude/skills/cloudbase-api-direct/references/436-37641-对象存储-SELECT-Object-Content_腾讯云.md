[API 中心](/document/api)

## SELECT Object Content

最近更新时间：2025-07-07 10:10:32

-   微信扫一扫 
-   QQ
-   新浪微博
-   复制链接
    
    链接复制成功
    

_我的收藏_

## 本页目录：

-   [概述](#.E6.A6.82.E8.BF.B0 "概述")
-   [请求](#.E8.AF.B7.E6.B1.82 "请求")
-   [响应](#.E5.93.8D.E5.BA.94 "响应")
-   [示例](#.E7.A4.BA.E4.BE.8B "示例")
-   [注意事项](#.E6.B3.A8.E6.84.8F.E4.BA.8B.E9.A1.B9 "注意事项")

## 概述

COS Select 接口可以使用结构化查询语句（Structured Query Language，SQL）从指定对象（CSV、JSON 或者 Parquet 格式）中检索内容。在检索过程中，您需要指定对象内容的分隔符，并使用合适的 SQL 函数进行检索，COS Select 将返回相匹配的检索结果，您可以指定检索结果的保存格式。

如您需要了解 COS Select 的更多介绍，请参见 COS [Select 概述](https://cloud.tencent.com/document/product/436/37635 "https://cloud.tencent.com/document/product/436/37635") 。有关 COS Select 的 SQL 表达式的介绍，您可以在开发者指南中参见 [Select 命令](https://cloud.tencent.com/document/product/436/37636 "https://cloud.tencent.com/document/product/436/37636") 进一步了解。

#### 权限限制

使用 COS Select，您必须具有 `cos:GetObject` 的授权。

如果您是主账号，则默认拥有该权限。

如果您是子账号，请联系您的主账号获取该操作的权限。有关权限设置，请参见 [授权子账号访问 COS](https://cloud.tencent.com/document/product/436/11714 "https://cloud.tencent.com/document/product/436/11714") 文档。

#### 对象数据格式

COS Select 支持检索以下格式的对象数据：

CSV 格式：对象以 CSV 格式存储，并以固定的分隔符划分。

JSON 格式：对象以 JSON 格式存储，可以是 JSON 文件或者 JSON 列表。

Parquet 格式：对象以 Parquet 格式存储，可以包含嵌套结构。

## 请求

#### 请求示例

```
POST /<ObjectKey>?select&select-type=2 HTTP/1.1Host: <BucketName-APPID>.cos.<Region>.myqcloud.comDate: dateAuthorization: Auth String﻿
Request body
```

**说明：**

Host: <BucketName-APPID>.cos.<Region>.myqcloud.com，其中 <BucketName-APPID> 为带 APPID 后缀的存储桶名字，例如 examplebucket-1250000000，详情请参见 [存储桶概览 > 基本信息](https://cloud.tencent.com/document/product/436/48921#.E5.9F.BA.E6.9C.AC.E4.BF.A1.E6.81.AF "https://cloud.tencent.com/document/product/436/48921#.E5.9F.BA.E6.9C.AC.E4.BF.A1.E6.81.AF") 和 [存储桶概述 > 存储桶命名规范](https://cloud.tencent.com/document/product/436/13312#.E5.AD.98.E5.82.A8.E6.A1.B6.E5.91.BD.E5.90.8D.E8.A7.84.E8.8C.83 "https://cloud.tencent.com/document/product/436/13312#.E5.AD.98.E5.82.A8.E6.A1.B6.E5.91.BD.E5.90.8D.E8.A7.84.E8.8C.83") 文档；<Region> 为 COS 的可用地域，详情请参见 [地域和访问域名](http://cloud.tencent.com/document/product/436/6224 "http://cloud.tencent.com/document/product/436/6224") 文档。

Authorization: Auth String （详情请参见 [请求签名](https://cloud.tencent.com/document/product/436/7778 "https://cloud.tencent.com/document/product/436/7778") 文档）。

请求参数中 select 和 select-type=2参数均为必填参数，其中 select 代表发起 select 请求，select-type=2代表这一接口的版本信息。

#### 请求头

此接口仅使用公共请求头部，详情请参见 [公共请求头部](https://cloud.tencent.com/document/product/436/7728 "https://cloud.tencent.com/document/product/436/7728") 文档。

#### 请求体

以下请求展示了用户发起一个 COS Select 请求，检索 CSV 格式对象的所有内容，并将结果保存为 CSV 格式对象。

以下请求展示了用户发起一个 COS Select 请求，检索 JSON 格式对象的所有内容，并将结果保存为 JSON 格式对象。

```xml
<?xml version="1.0" encoding="UTF-8"?><SelectRequest>    <Expression>Select * from COSObject</Expression>    <ExpressionType>SQL</ExpressionType>    <InputSerialization>        <CompressionType>GZIP</CompressionType>        <JSON>            <Type>DOCUMENT</Type>        </JSON>    </InputSerialization>    <OutputSerialization>        <JSON>            <RecordDelimiter>\\n</RecordDelimiter>        </JSON>                                      </OutputSerialization>    <RequestProgress>        <Enabled>FALSE</Enabled>    </RequestProgress>                                  </SelectRequest>
```

以下请求展示了用户发起一个 COS Select 请求，检索 Parquet 格式对象的所有内容，并将结果保存为 JSON 格式对象。

```xml
<?xml version="1.0" encoding="UTF-8"?><SelectRequest>    <Expression>Select * from COSObject</Expression>    <ExpressionType>SQL</ExpressionType>    <InputSerialization>        <CompressionType>GZIP</CompressionType>        <Parquet>        </Parquet>    </InputSerialization>    <OutputSerialization>        <JSON>            <RecordDelimiter>\\n</RecordDelimiter>        </JSON>                                      </OutputSerialization>    <RequestProgress>        <Enabled>FALSE</Enabled>    </RequestProgress>                                  </SelectRequest>
```

**说明：**

InputSerialization 元素描述了待检索的对象格式，为必填参数，该参数可以指定为 CSV 、JSON 或 Parquet 格式。

OutputSerialization 元素描述了检索结果的保存格式，该参数仅可指定为 CSV 或者 JSON 格式。

待检索的对象格式无需和检索结果的保存格式互相匹配，您可以检索一个 JSON 格式的对象，并将检索结果保存为 CSV 格式。

下表展示了请求体中的各项元素组成：

<table><colgroup><col width="17%"> <col width="14%"> <col width="48%"> <col width="11%"> <col width="10%"></colgroup><tbody><tr><td><p><span><span><span>名称</span></span></span></p></td><td><p><span><span><span>父节点</span></span></span></p></td><td><p><span><span><span>描述</span></span></span></p></td><td><p><span><span><span>类型</span></span></span></p></td><td><p><span><span><span>是否必选</span></span></span></p></td></tr><tr><td><p><span><span><span>Expression</span></span></span></p></td><td><p><span><span><span>SelectRequest</span></span></span></p></td><td><p><span><span><span>SQL 表达式，代表您需要发起的检索操作。例如</span></span></span> <span><span><code><span>SELECT s._1 FROM COSObject s</span></code></span></span> <span><span><span>。这个表达式可以从 CSV 格式的对象中检索第一列内容。有关 SQL 表达式的详细介绍，请参见 </span></span></span><a href="https://cloud.tencent.com/document/product/436/37636" title="https://cloud.tencent.com/document/product/436/37636"><span><span><span><span>Select 命令</span></span></span></span></a> <span><span><span>。</span></span></span></p></td><td><p><span><span><span>String</span></span></span></p></td><td><p><span><span><span>是</span></span></span></p></td></tr><tr><td><p><span><span><span>ExpressionType</span></span></span></p></td><td><p><span><span><span>SelectRequest</span></span></span></p></td><td><p><span><span><span>表达式类型，该项为扩展项，目前只支持 SQL 表达式，仅支持 SQL 参数。</span></span></span></p></td><td><p><span><span><span>String</span></span></span></p></td><td><p><span><span><span>是</span></span></span></p></td></tr><tr><td><p><span><span><span>InputSerialization</span></span></span></p></td><td><p><span><span><span>SelectRequest</span></span></span></p></td><td><p><span><span><span>描述待检索对象的格式。</span></span></span></p></td><td><p><span><span><span>Container</span></span></span></p></td><td><p><span><span><span>是</span></span></span></p></td></tr><tr><td><p><span><span><span>OutputSerialization</span></span></span></p></td><td><p><span><span><span>SelectRequest</span></span></span></p></td><td><p><span><span><span>描述检索结果的输出格式。</span></span></span></p></td><td><p><span><span><span>Container</span></span></span></p></td><td><p><span><span><span>是</span></span></span></p></td></tr><tr><td><p><span><span><span>RequestProgress</span></span></span></p></td><td><p><span><span><span>SelectRequest</span></span></span></p></td><td><p><span><span><span>是否需要返回查询进度 QueryProgress 信息，如果选中 COS Select 将周期性返回查询进度。</span></span></span></p></td><td><p><span><span><span>Container</span></span></span></p></td><td><p><span><span><span>否</span></span></span></p></td></tr></tbody></table>

**InputSerialization container element**

<table><colgroup><col width="18%"> <col width="16%"> <col width="49%"> <col width="10%"> <col width="7%"></colgroup><tbody><tr><td><p><span><span><span>名称</span></span></span></p></td><td><p><span><span><span>父节点</span></span></span></p></td><td><p><span><span><span>描述</span></span></span></p></td><td><p><span><span><span>类型</span></span></span></p></td><td><p><span><span><span>是否必选</span></span></span></p></td></tr><tr><td><p><span><span><span>CompressionType</span></span></span></p></td><td><p><span><span><span>InputSerialization</span></span></span></p></td><td><p><span><span><span>描述待检索对象的压缩格式： 如果对象未被压缩过，则该项为 NONE。如果对象被压缩过，COS Select 目前支持的两种压缩格式为 GZIP 和 BZIP2，可选项为 NONE、GZIP、BZIP2，默认值为 NONE。</span></span></span></p></td><td><p><span><span><span>String</span></span></span></p></td><td><p><span><span><span>否</span></span></span></p></td></tr><tr><td><p><span><span><span>CSV/JSON/PARQUET</span></span></span></p></td><td><p><span><span><span>InputSerialization</span></span></span></p></td><td><p><span><span><span>描述在相应的对象格式下所需的文件参数。例如 CSV 格式需要指定分隔符。</span></span></span></p></td><td><p><span><span><span>Container</span></span></span></p></td><td><p><span><span><span>是</span></span></span></p></td></tr></tbody></table>

**CSV container element (InputSerialization 子元素)**

<table><colgroup><col width="22%"> <col width="8%"> <col width="52%"> <col width="11%"> <col width="7%"></colgroup><tbody><tr><td><p><span><span><span>名称</span></span></span></p></td><td><p><span><span><span>父节点</span></span></span></p></td><td><p><span><span><span>描述</span></span></span></p></td><td><p><span><span><span>类型</span></span></span></p></td><td><p><span><span><span>是否必选</span></span></span></p></td></tr><tr><td><p><span><span><span>RecordDelimiter</span></span></span></p></td><td><p><span><span><span>CSV</span></span></span></p></td><td><p><span><span><span>将 CSV 对象中记录分隔为不同行的字符，默认您通过</span></span></span> <span><span><code><span>\\n</span></code></span></span> <span><span><span>进行分隔。您可以指定任意8进制字符，如逗号、分号、Tab 等。该参数最多支持2个字节，即您可以输入</span></span></span> <span><span><code><span>\\r\\n</span></code></span></span> <span><span><span>这类格式的分隔符。默认值为</span></span></span> <span><span><code><span>\\n </span></code></span></span><span><span><span>。</span></span></span></p></td><td><p><span><span><span>String</span></span></span></p></td><td><p><span><span><span>否</span></span></span></p></td></tr><tr><td><p><span><span><span>FieldDelimiter</span></span></span></p></td><td><p><span><span><span>CSV</span></span></span></p></td><td><p><span><span><span>指定分隔 CSV 对象中每一行的字符，默认您通过,进行分隔。您可以指定任意8进制字符，该参数最多支持1个字节。默认值为</span></span></span><span><span><code><span>, </span></code></span></span><span><span><span>。</span></span></span></p></td><td><p><span><span><span>String</span></span></span></p></td><td><p><span><span><span>否</span></span></span></p></td></tr><tr><td><p><span><span><span>QuoteCharacter</span></span></span></p></td><td><p><span><span><span>CSV</span></span></span></p></td><td><p><span><span><span>如果您待检索的 CSV 对象中存在包含分隔符的字符串，您可以使用 QuoteCharacter 进行转义，避免该字符串被切割成几个部分。如 CSV 对象中存在</span></span></span> <span><span><code><span>"a, b" </span></code></span></span><span><span><span>这个字符串，双引号"可以避免这一字符串被分隔成 </span></span></span><span><span><code><span>a</span></code></span></span> <span><span><span>和 </span></span></span><span><span><code><span>b</span></code></span></span> <span><span><span>两个字符。默认值为</span></span></span> <span><span><code><span>"</span></code></span></span> <span><span><span>。</span></span></span></p></td><td><p><span><span><span>String</span></span></span></p></td><td><p><span><span><span>否</span></span></span></p></td></tr><tr><td><p><span><span><span>QuoteEscapeCharacter</span></span></span></p></td><td><p><span><span><span>CSV</span></span></span></p></td><td><p><span><span><span>如果您待检索的字符串中已经存在</span></span></span> <span><span><code><span>"</span></code></span></span> <span><span><span>，那您需要使用</span></span></span> <span><span><code><span>"</span></code></span></span> <span><span><span>进行转义以保证字符串可以正常转义。如您的字符串 </span></span></span><span><span><code><span>""" a , b """</span></code></span></span> <span><span><span>将会被解析为</span></span></span> <span><span><code><span>" a , b "</span></code></span></span> <span><span><span>。默认值为</span></span></span> <span><span><code><span>" </span></code></span></span><span><span><span>。</span></span></span></p></td><td><p><span><span><span>String</span></span></span></p></td><td><p><span><span><span>否</span></span></span></p></td></tr><tr><td><p><span><span><span>AllowQuotedRecordDelimiter</span></span></span></p></td><td><p><span><span><span>CSV</span></span></span></p></td><td><p><span><span><span>指定待检索对象中是否存在与分隔符相同且需要用 </span></span></span><span><span><code><span>"</span></code></span></span> <span><span><span>转义的字符。设定为 TRUE 时，COS Select 将会在检索进行转义，这会导致检索性能下降；设定为 FALSE 时，则不会做转义处理。默认值为 FALSE。</span></span></span></p></td><td><p><span><span><span>Boolean</span></span></span></p></td><td><p><span><span><span>否</span></span></span></p></td></tr><tr><td><p><span><span><span>FileHeaderInfo</span></span></span></p></td><td><p><span><span><span>CSV</span></span></span></p></td><td><p><span><span><span>待检索对象中是否存在列表头。该参数为存在 NONE、USE、IGNORE 三个选项。NONE 代表对象中没有列表头，USE 代表对象中存在列表头并且您可以使用表头进行检索（例如 </span></span></span><span><span><code><span>SELECT "name" FROM COSObject</span></code></span></span> <span><span><span>），IGNORE 代表对象中存在列表头且您不打算使用表头进行检索（但您仍然可以通过列索引进行检索，如 </span></span></span><span><span><code><span>SELECT s._1 FROM COSObject s</span></code></span></span> <span><span><span>）。合法值为 NONE、USE、IGNORE。</span></span></span></p></td><td><p><span><span><span>Enum</span></span></span></p></td><td><p><span><span><span>否</span></span></span></p></td></tr><tr><td><p><span><span><span>Comments</span></span></span></p></td><td><p><span><span><span>CSV</span></span></span></p></td><td><p><span><span><span>指定某行记录为注释行，该字符会被添加到该行记录的首字符。如果某一行记录被指定为注释，则 COS Select 将不对此行做任何分析。默认值为</span></span></span> <span><span><code><span>#</span></code></span></span> <span><span><span>。</span></span></span></p></td><td><p><span><span><span>String</span></span></span></p></td><td><p><span><span><span>否</span></span></span></p></td></tr></tbody></table>

**JSON container element (InputSerialization 子元素)**

<table><colgroup><col width="7%"> <col width="8%"> <col width="66%"> <col width="9%"> <col width="10%"></colgroup><tbody><tr><td><p><span><span><span>名称</span></span></span></p></td><td><p><span><span><span>父节点</span></span></span></p></td><td><p><span><span><span>描述</span></span></span></p></td><td><p><span><span><span>类型</span></span></span></p></td><td><p><span><span><span>是否必选</span></span></span></p></td></tr><tr><td><p><span><span><span>Type</span></span></span></p></td><td><p><span><span><span>JSON</span></span></span></p></td><td><p><span><span><span>JSON 文件的类型：</span></span></span></p><p><span><span><span><span>DOCUMENT 表示 JSON 文件仅包含一个独立的 JSON 对象，且该对象可以被切割成多行。</span></span></span></span></p><p><span><span><span><span>LINES 表示 JSON 对象中的每一行包含了一个独立的 JSON 对象。</span></span></span></span></p><p><span><span><span>合法值为 DOCUMENT 、LINES。</span></span></span></p></td><td><p><span><span><span>Enum</span></span></span></p></td><td><p><span><span><span>是</span></span></span></p></td></tr></tbody></table>

**OutputSerialization container element**

<table><colgroup><col width="12%"> <col width="16%"> <col width="37%"> <col width="10%"> <col width="25%"></colgroup><tbody><tr><td><p><span><span><span>名称</span></span></span></p></td><td><p><span><span><span>父节点</span></span></span></p></td><td><p><span><span><span>描述</span></span></span></p></td><td><p><span><span><span>类型</span></span></span></p></td><td><p><span><span><span>是否必选</span></span></span></p></td></tr><tr><td><p><span><span><span>CSV /JSON</span></span></span></p></td><td><p><span><span><span>OutputSerialization</span></span></span></p></td><td><p><span><span><span>指定检索结果的输出格式，可选项为 CSV 或者 JSON。</span></span></span></p></td><td><p><span><span><span>Container</span></span></span></p></td><td><p><span><span><span>是，必须是 CSV 或者 JSON 中的一个</span></span></span></p></td></tr></tbody></table>

**CSV container element (OutputSerialization 子元素)**

<table><colgroup><col width="20%"> <col width="8%"> <col width="54%"> <col width="11%"> <col width="7%"></colgroup><tbody><tr><td><p><span><span><span>名称</span></span></span></p></td><td><p><span><span><span>父节点</span></span></span></p></td><td><p><span><span><span>描述</span></span></span></p></td><td><p><span><span><span>类型</span></span></span></p></td><td><p><span><span><span>是否必选</span></span></span></p></td></tr><tr><td><p><span><span><span>QuoteFields</span></span></span></p></td><td><p><span><span><span>CSV</span></span></span></p></td><td><p><span><span><span><span>指定输出结果为文件时，是否需要使用</span></span></span> <span><span><code><span>"</span></code></span></span> <span><span><span>进行转义。合法值为 ALWAYS、ASNEEDED，默认值为 ASNEEDED。</span></span></span></span></p><p><span><span><span><span>ALWAYS 代表对所有本次输出的检索文件应用</span></span></span> <span><span><code><span>"</span></code></span></span> <span><span><span>，ASNEEDED 代表仅在需要时使用。</span></span></span></span></p></td><td><p><span><span><span>String</span></span></span></p></td><td><p><span><span><span>是</span></span></span></p></td></tr><tr><td><p><span><span><span>RecordDelimiter</span></span></span></p></td><td><p><span><span><span>CSV</span></span></span></p></td><td><p><span><span><span>将输出结果中的记录分隔为不同行的字符，默认通过</span></span></span> <span><span><code><span>\\n </span></code></span></span><span><span><span>进行分隔。您可以指定任意8进制字符，如逗号、分号、Tab 等。该参数最多支持2个字节，即您可以输入</span></span></span> <span><span><code><span>\\r\\n</span></code></span></span> <span><span><span>这类格式的分隔符。默认值为</span></span></span> <span><span><code><span>\\n </span></code></span></span><span><span><span>。</span></span></span></p></td><td><p><span><span><span>String</span></span></span></p></td><td><p><span><span><span>否</span></span></span></p></td></tr><tr><td><p><span><span><span>FieldDelimiter</span></span></span></p></td><td><p><span><span><span>CSV</span></span></span></p></td><td><p><span><span><span>将输出结果中的每一行进行分列的字符，默认通过</span></span></span><span><span><code><span>,</span></code></span></span><span><span><span>进行分隔。您可以指定任意8进制字符，该参数最多支持1个字节。默认值为</span></span></span><span><span><code><span>, </span></code></span></span><span><span><span>。</span></span></span></p></td><td><p><span><span><span>String</span></span></span></p></td><td><p><span><span><span>否</span></span></span></p></td></tr><tr><td><p><span><span><span>QuoteCharacter</span></span></span></p></td><td><p><span><span><span>CSV</span></span></span></p></td><td><p><span><span><span>如果输出结果中存在包含分隔符的字符串，可以使用 QuoteCharacter 进行转义，保证该字符串不会在后续分析中被切割。如输出结果中存在</span></span></span> <span><span><code><span>a,b</span></code></span></span> <span><span><span>这个字符串，双引号</span></span></span> <span><span><code><span>"</span></code></span></span> <span><span><span>可以避免这一字符串被分隔成</span></span></span> <span><span><code><span>a</span></code></span></span> <span><span><span>和</span></span></span> <span><span><code><span>b</span></code></span></span> <span><span><span>两个字符，COS Select 将会将其转为</span></span></span> <span><span><code><span>"a, b" </span></code></span></span><span><span><span>写入文件。默认值为</span></span></span> <span><span><code><span>" </span></code></span></span><span><span><span>。</span></span></span></p></td><td><p><span><span><span>String</span></span></span></p></td><td><p><span><span><span>否</span></span></span></p></td></tr><tr><td><p><span><span><span>QuoteEscapeCharacter</span></span></span></p></td><td><p><span><span><span>CSV</span></span></span></p></td><td><p><span><span><span>如果您即将输出的字符串中已经存在</span></span></span> <span><span><code><span>"</span></code></span></span> <span><span><span>，那您需要使用</span></span></span> <span><span><code><span>"</span></code></span></span> <span><span><span>进行转义以保证该字符串可以正常转义。如您的字符串</span></span></span> <span><span><code><span>" a , b"</span></code></span></span> <span><span><span>将会在写入文件时被转换为</span></span></span> <span><span><code><span>""" a , b """</span></code></span></span> <span><span><span>。默认值为</span></span></span> <span><span><code><span>" </span></code></span></span><span><span><span>。</span></span></span></p></td><td><p><span><span><span>String</span></span></span></p></td><td><p><span><span><span>否</span></span></span></p></td></tr></tbody></table>

**JSON container element (OutputSerialization 子元素)**

<table><colgroup><col width="14%"> <col width="10%"> <col width="54%"> <col width="10%"> <col width="12%"></colgroup><tbody><tr><td><p><span><span><span>名称</span></span></span></p></td><td><p><span><span><span>父节点</span></span></span></p></td><td><p><span><span><span>描述</span></span></span></p></td><td><p><span><span><span>类型</span></span></span></p></td><td><p><span><span><span>是否必选</span></span></span></p></td></tr><tr><td><p><span><span><span>RecordDelimiter</span></span></span></p></td><td><p><span><span><span>JSON</span></span></span></p></td><td><p><span><span><span>将输出结果中的记录分隔为不同行的字符，默认通过</span></span></span> <span><span><code><span>\\n </span></code></span></span><span><span><span>进行分隔。您可以指定任意8进制字符，如逗号、分号、Tab 等。该参数最多支持2个字节，即您可以输入</span></span></span> <span><span><code><span>\\r\\n</span></code></span></span> <span><span><span>这类格式的分隔符。默认值为</span></span></span> <span><span><code><span>\\n 。</span></code></span></span></p></td><td><p><span><span><span>String</span></span></span></p></td><td><p><span><span><span>否</span></span></span></p></td></tr></tbody></table>

**RequestProgress container element**

<table><colgroup><col width="10%"> <col width="16%"> <col width="52%"> <col width="10%"> <col width="12%"></colgroup><tbody><tr><td><p><span><span><span>名称</span></span></span></p></td><td><p><span><span><span>父节点</span></span></span></p></td><td><p><span><span><span>描述</span></span></span></p></td><td><p><span><span><span>类型</span></span></span></p></td><td><p><span><span><span>是否必选</span></span></span></p></td></tr><tr><td><p><span><span><span>Enabled</span></span></span></p></td><td><p><span><span><span>RequestProgress</span></span></span></p></td><td><p><span><span><span>指定是否需要 COS Select 定期返回查询进度。默认值为 FALSE。</span></span></span></p></td><td><p><span><span><span>Boolean</span></span></span></p></td><td><p><span><span><span>否</span></span></span></p></td></tr></tbody></table>

## 响应

执行成功的检索操作将返回 `200 OK` 状态码。

#### 响应头

此接口仅返回公共响应头部，详情请参见 [公共响应头部](https://cloud.tencent.com/document/product/436/7729 "https://cloud.tencent.com/document/product/436/7729") 文档。

#### 响应体

由于响应体的大小无法预知，COS 将用户请求响应体以序列化形式展示，即将响应体切分成多个分块返回，如下展示了返回响应体的概览：

```xml
<Message 1><Message 2><Message 3>......<Message n>
```

#### 预响应（prelude）和响应结果（data）

COS 将检索结果切成多个分块，每个分块即一个 Message。每一个 Message 由预响应（prelude）和响应结果（data）组成。

预响应包含两个部分：

所在分块 Message 的总长度。

所有头部的总长度。

响应结果包含两个部分：

响应报头（header）。

响应正文（payload）。

预响应和响应结果均以4字节的经过大端编码（big-endian）的 CRC 校验码结尾。COS Select 使用 CRC32计算 CRC 校验码，有关 CRC32的详细信息，请参见 [RFC 文档](https://www.ietf.org/rfc/rfc1952.txt "https://www.ietf.org/rfc/rfc1952.txt") 。除了响应结果之外，COS Select 总共额外花费了16字节用于传输预响应和校验码信息。

```shell
响应体总长度 =  预响应长度 + 预响应校验码长度 + 响应正文长度 + 响应报头长度  + 响应正文校验码长度
```

由于校验码（prelude CRC 和 Message CRC）和预响应 prelude 总长度固定为16字节，因此响应体总长还可以通过如下方式快速计算：

```shell
响应体总长度 =  响应正文长度 + 响应报头长度 + 16
```

以下详细介绍响应体各部分组成：

<table><colgroup><col width="21%"> <col width="79%"></colgroup><tbody><tr><td><p><span><span><span>组成</span></span></span></p></td><td><p><span><span><span>描述</span></span></span></p></td></tr><tr><td><p><span><span><span>预响应 prelude</span></span></span></p></td><td><p><span><span><span>分别记录了分块 Message 的总长度和所有报头的总长度，每个记录4字节，总长8字节：</span></span></span></p><p><span><span><span><code><span>total byte-length</span></code></span></span> <span><span><span>：所在分块 Message 的总长度，使用大端编码，包含该记录本身容量共4字节。</span></span></span></span></p><p><span><span><span><code><span>headers byte-length</span></code></span></span> <span><span><span>：所有报头的总长度，使用大端编码，不包含该记录所占空间共4字节。</span></span></span></span></p></td></tr><tr><td><p><span><span><span>预响应校验码 prelude CRC</span></span></span></p></td><td><p><span><span><span>预响应的 CRC 校验码，使用大端编码，总共4字节。预响应校验码可以帮助程序快速识别预响应信息是否正确，减少缓冲时的阻塞。</span></span></span></p></td></tr><tr><td><p><span><span><span>报头信息 header</span></span></span></p></td><td><p><span><span><span>分块 Message 记录的检索结果的元数据信息，诸如数据类型，正文格式。根据数据类型的差异，本部分的字节长度也有所差异。响应报头以 kv 键值对形式存储，使用 UTF-8编码。响应报头中所记录的元数据信息可以以任意顺序展示，但每一项元数据仅记录一次。根据数据类型的差异，以下响应报头均有可能在 COS Select 返回的结果中出现：</span></span></span></p></td></tr><tr><td><p><span><span><span>响应正文 Payload</span></span></span></p></td><td><p><span><span><span>记录检索结果，或者与请求相关的正式信息。</span></span></span></p></td></tr><tr><td><p><span><span><span>正文校验码 Message CRC</span></span></span></p></td><td><p><span><span><span>使用大端编码的 CRC 校验码，总长4字节。</span></span></span></p></td></tr></tbody></table>

<table><colgroup><col width="25%"> <col width="75%"></colgroup><tbody><tr><td><p><span><span><span>组成</span></span></span></p></td><td><p><span><span><span>描述</span></span></span></p></td></tr><tr><td></td><td></td></tr><tr><td><p><span><span><span>Header Name</span></span></span></p></td><td><p><span><span><span>报头类型，合法值包括 ":message-type"， ":event-type"， ":error-code"和":error-message"：</span></span></span></p><p><span><span><span><span>":message-type"代表该报头记录了响应类型。</span></span></span></span></p><p><span><span><span><span>":event-type"代表了该报头记录事件类型 。</span></span></span></span></p><p><span><span><span><span>":error-code"代表该报头记录报错类型。</span></span></span></span></p><p><span><span><span><span>":error-message"代表该报头记录错误码信息。</span></span></span></span></p></td></tr><tr><td></td><td></td></tr><tr><td><p><span><span><span>Value String Byte-Length</span></span></span></p></td><td></td></tr><tr><td></td><td></td></tr></tbody></table>

COS Select 的响应类型主要可以分为以下几种：

<table><colgroup><col width="22%"> <col width="78%"></colgroup><tbody><tr><td><p><span><span><span>响应类型</span></span></span></p></td><td><p><span><span><span>描述</span></span></span></p></td></tr><tr><td><p><span><span><span>Records message</span></span></span></p></td><td><p><span><span><span>检索信息，可以包含单条记录，部分记录或者多条记录，取决于检索结果的多少。一个响应体中可能包含多个 Records message。</span></span></span></p></td></tr><tr><td><p><span><span><span>Continuation message</span></span></span></p></td><td><p><span><span><span>连接信息，COS Select 周期性地发送这些信息以保持 TCP 连接，这些信息随机出现在响应体中。客户端最好能够自动识别这类信息，并对其做过滤处理以免弄脏检索结果。</span></span></span></p></td></tr><tr><td><p><span><span><span>Progress message</span></span></span></p></td><td><p><span><span><span>进度信息，COS Select 周期性地返回这些信息以反馈当前查询进度。</span></span></span></p></td></tr><tr><td><p><span><span><span>Stats message</span></span></span></p></td><td><p><span><span><span>统计信息，COS Select 在查询结束后返回本次查询的相关统计信息。</span></span></span></p></td></tr><tr><td><p><span><span><span>End message</span></span></span></p></td><td><p><span><span><span>结束信息，代表本次查询已经结束，没有后续响应数据。只有在接收到该类型的信息时才能认为查询结束。</span></span></span></p></td></tr><tr><td><p><span><span><span>RequestLevelError message</span></span></span></p></td><td><p><span><span><span>报错信息，COS Select 在查询出现错误时将会返回这一信息，包含请求的错误原因。如果 COS Select 返回了这一信息，则将不会再返回 End message 信息。</span></span></span></p></td></tr></tbody></table>

下面将进一步介绍这些响应类型的详情。

#### Records message

![Records message ](https://qcloudimg.tencent-cloud.cn/image/document/94314c12e0644e6fd12097a64cd546da.png)

Records message

正文格式 Records message 正文可能包含单条记录，部分记录或者多条记录，取决于检索结果的多少。

#### Continuation Message

![ Continuation Message ](https://qcloudimg.tencent-cloud.cn/image/document/6f4fb35676258205dad106c0d8173de4.png)

Continuation Message

正文格式 Continuation Message 中不包含正文内容。

#### Progress Message

![Progress Message](https://qcloudimg.tencent-cloud.cn/image/document/db94022d3876894975475304830f0f0e.png)

Progress Message

正文格式 Progress Message 的正文是一个包含了当前查询进度的 XML 文本，主要包含以下信息：

BytesScanned：如果文件是压缩文件，该数值代表文件解压前的字节大小。如果文件不是压缩文件，该数值即文件的字节大小。

BytesProcessed：如果文件是压缩文件，该数值代表文件解压后的字节大小。如果文件不是压缩文件，该数值即文件的字节大小。

BytesReturned：COS Select 目前返回的检索结果字节大小。

示例如下：

```xml
<?xml version="1.0" encoding="UTF-8"?><Progress>     <BytesScanned>512</BytesScanned>     <BytesProcessed>1024</BytesProcessed>     <BytesReturned>1024</BytesReturned></Progress>
```

#### Stats Message

![ Stats Message ](https://qcloudimg.tencent-cloud.cn/image/document/bcb369d3830cb9a2351bb8ad3e3776ca.png)

Stats Message

正文格式 Stats message 的正文是一个包含了本次查询统计的 XML 文本，主要包含以下信息：

BytesScanned：如果文件是压缩文件，该数值代表文件解压前的字节大小；如果文件不是压缩文件，该数值即文件的字节大小。

BytesProcessed：如果文件是压缩文件，该数值代表文件解压后的字节大小；如果文件不是压缩文件，该数值即文件的字节大小。

BytesReturned：COS Select 在本次查询中返回的检索结果字节大小。

示例如下：

```xml
<?xml version="1.0" encoding="UTF-8"?><Stats>     <BytesScanned>512</BytesScanned>     <BytesProcessed>1024</BytesProcessed>     <BytesReturned>1024</BytesReturned></Stats>
```

#### End Message

![ End messages ](https://qcloudimg.tencent-cloud.cn/image/document/a2fe5e7b9a579fda07615af629399fb1.png)

End messages

正文格式 End messages 中不包含正文内容。

#### Request Level Error Message

![ Request Level Error Message](https://qcloudimg.tencent-cloud.cn/image/document/7562b3d80f161cd5d3e1ad884dd0c0db.png)

Request Level Error Message

如果您需要了解 Request Level Error Message 中记录的错误码详情，可以查看 。

正文格式 Request Level Error Message 信息中不包含正文内容。

#### 特殊错误码

该请求常见的错误信息请参见 [错误码](https://cloud.tencent.com/document/product/436/7730 "https://cloud.tencent.com/document/product/436/7730") 文档，特殊错误码信息如下所示：

<table><colgroup><col width="22%"> <col width="38%"> <col width="26%"> <col width="14%"></colgroup><tbody><tr><td><p><span><span><span>错误码</span></span></span></p></td><td><p><span><span><span>错误信息</span></span></span></p></td><td><p><span><span><span>含义</span></span></span></p></td><td><p><span><span><span>HTTP 状态码</span></span></span></p></td></tr><tr><td><p><span><span><span>InvalidXML</span></span></span></p></td><td><p><span><span><span>The XML is invalid</span></span></span></p></td><td><p><span><span><span>XML 格式不合法</span></span></span></p></td><td><p><span><span><span>400 Bad Request</span></span></span></p></td></tr><tr><td><p><span><span><span>MissingRequiredParameter</span></span></span></p></td><td><p><span><span><span>The SelectRequest entity is missing a required parameter</span></span></span></p></td><td><p><span><span><span>检索请求缺少必填参数项</span></span></span></p></td><td><p><span><span><span>400 Bad Request</span></span></span></p></td></tr><tr><td><p><span><span><span>MissingExpectedExpression</span></span></span></p></td><td><p><span><span><span>The SQL expression is missing</span></span></span></p></td><td><p><span><span><span>缺少 SQL 表达式</span></span></span></p></td><td><p><span><span><span>400 Bad Request</span></span></span></p></td></tr><tr><td><p><span><span><span>MissingInputSerialization</span></span></span></p></td><td><p><span><span><span>The input serialization is missing</span></span></span></p></td><td><p><span><span><span>未指定输入 CSV 对象的数据序列化格式</span></span></span></p></td><td><p><span><span><span>400 Bad Request</span></span></span></p></td></tr><tr><td><p><span><span><span>InvalidCompressionFormat</span></span></span></p></td><td><p><span><span><span>The file is not in a supported compression format. Only GZIP and BZIP2 are supported</span></span></span></p></td><td><p><span><span><span>不合法的文件压缩格式，仅支持 GZIP 和 BZIP2 两种格式</span></span></span></p></td><td><p><span><span><span>400 Bad Request</span></span></span></p></td></tr><tr><td><p><span><span><span>MissingInputFormat</span></span></span></p></td><td><p><span><span><span>The input format is missing</span></span></span></p></td><td><p><span><span><span>缺少输入格式</span></span></span></p></td><td><p><span><span><span>400 Bad Request</span></span></span></p></td></tr><tr><td><p><span><span><span>InvalidFileHeaderInfo</span></span></span></p></td><td></td><td><p><span><span><span>输入的文件表头信息不合法。仅支持 NONE，USE 和 IGNORE</span></span></span></p></td><td><p><span><span><span>400 Bad Request</span></span></span></p></td></tr><tr><td><p><span><span><span>InvalidRequestParameter</span></span></span></p></td><td><p><span><span><span>The input RecordDelimiter of CSV is invalid</span></span></span></p></td><td><p><span><span><span>输入的 CSV 文件换行符不合法</span></span></span></p></td><td><p><span><span><span>400 Bad Request</span></span></span></p></td></tr><tr><td><p><span><span><span>InvalidRequestParameter</span></span></span></p></td><td><p><span><span><span>The input FieldDelimiter of CSV is invalid</span></span></span></p></td><td><p><span><span><span>输入的 CSV 文件列分隔符不合法</span></span></span></p></td><td><p><span><span><span>400 Bad Request</span></span></span></p></td></tr><tr><td><p><span><span><span>InvalidRequestParameter</span></span></span></p></td><td><p><span><span><span>The input QuoteCharacter of CSV is invalid</span></span></span></p></td><td><p><span><span><span>输入的 CSV 文件引用符不合法</span></span></span></p></td><td><p><span><span><span>400 Bad Request</span></span></span></p></td></tr><tr><td><p><span><span><span>InvalidRequestParameter</span></span></span></p></td><td><p><span><span><span>The input AllowQuoteRecordDelimiter of csv is invalid. Only TRUE and FALSE are supported</span></span></span></p></td><td><p><span><span><span>在输入 CSV 文件中启用转义符的配置不合法，仅支持 TRUE 和 FALSE</span></span></span></p></td><td><p><span><span><span>400 Bad Request</span></span></span></p></td></tr><tr><td><p><span><span><span>InvalidJsonType</span></span></span></p></td><td><p><span><span><span>The JsonType is invalid. Only DOCUMENT and LINES are supported</span></span></span></p></td><td><p><span><span><span>不合法的 JSON 类型，仅支持 DOCUMENT 和 LINES</span></span></span></p></td><td><p><span><span><span>400 Bad Request</span></span></span></p></td></tr><tr><td><p><span><span><span>MissingOutputSerialization</span></span></span></p></td><td><p><span><span><span>The output serialization is missing.</span></span></span></p></td><td><p><span><span><span>未指定输出 CSV 对象的数据序列格式</span></span></span></p></td><td><p><span><span><span>400 Bad Request</span></span></span></p></td></tr><tr><td><p><span><span><span>MissingOutputFormat</span></span></span></p></td><td><p><span><span><span>The output format is missing</span></span></span></p></td><td><p><span><span><span>缺少输出格式</span></span></span></p></td><td><p><span><span><span>400 Bad Request</span></span></span></p></td></tr><tr><td><p><span><span><span>InvalidQuoteFields</span></span></span></p></td><td><p><span><span><span>The QuoteFields is invalid. Only ALWAYS and ASNEEDED are supported</span></span></span></p></td><td><p><span><span><span>不合法的转义规则，仅支持 ALWAYS 和 ASNEEDED</span></span></span></p></td><td><p><span><span><span>400 Bad Request</span></span></span></p></td></tr><tr><td><p><span><span><span>InvalidRequestParameter</span></span></span></p></td><td><p><span><span><span>The output RecordDelimiter of CSV is invalid</span></span></span></p></td><td><p><span><span><span>输出的 CSV 文件换行符不合法</span></span></span></p></td><td><p><span><span><span>400 Bad Request</span></span></span></p></td></tr><tr><td><p><span><span><span>InvalidRequestParameter</span></span></span></p></td><td><p><span><span><span>The output FieldDelimiter of CSV is invalid</span></span></span></p></td><td><p><span><span><span>输出的 CSV 文件列分隔符不合法</span></span></span></p></td><td><p><span><span><span>400 Bad Request</span></span></span></p></td></tr><tr><td><p><span><span><span>InvalidRequestParameter</span></span></span></p></td><td><p><span><span><span>The output QuoteCharacter of CSV is invalid</span></span></span></p></td><td><p><span><span><span>输出的 CSV 文件转义符不合法</span></span></span></p></td><td><p><span><span><span>400 Bad Request</span></span></span></p></td></tr><tr><td><p><span><span><span>InvalidRequestParameter</span></span></span></p></td><td><p><span><span><span>The output QuoteEscapeCharacter of CSV is invalid</span></span></span></p></td><td><p><span><span><span>输出的 CSV 的双引号转义符不合法</span></span></span></p></td><td><p><span><span><span>400 Bad Request</span></span></span></p></td></tr><tr><td><p><span><span><span>InvalidRequestParameter</span></span></span></p></td><td><p><span><span><span>The output RecordDelimiter of JSON is invalid</span></span></span></p></td><td><p><span><span><span>输出的 JSON 文件换行符不合法</span></span></span></p></td><td><p><span><span><span>400 Bad Request</span></span></span></p></td></tr><tr><td><p><span><span><span>SQLParsingError</span></span></span></p></td><td><p><span><span><span>Encountered an error parsing the SQL expression</span></span></span></p></td><td><p><span><span><span>解析 SQL 表达式出现问题</span></span></span></p></td><td><p><span><span><span>400 Bad Request</span></span></span></p></td></tr><tr><td><p><span><span><span>SQLParsingError</span></span></span></p></td><td><p><span><span><span>Other expressions are not allowed in the SELECT list when '</span></span></span> <span><span><span>*</span></span></span> <span><span><span>' is used without dot notation.</span></span></span></p></td><td><p><span><span><span>SELECT list 不允许在未使用点符的时候使用</span></span></span> <span><span><code><span>'*'</span></code></span></span></p></td><td><p><span><span><span>400 Bad Request</span></span></span></p></td></tr><tr><td><p><span><span><span>SQLParsingError</span></span></span></p></td><td><p><span><span><span>The SQL expression contains an empty SELECT</span></span></span></p></td><td><p><span><span><span>SQL 表达式中包含了空的 SELECT 子句</span></span></span></p></td><td><p><span><span><span>400 Bad Request</span></span></span></p></td></tr><tr><td><p><span><span><span>SQLParsingError</span></span></span></p></td><td><p><span><span><span>GROUP is not supported in the SQL expression</span></span></span></p></td><td><p><span><span><span>SQL 表达式中不支持 GROUP 子句</span></span></span></p></td><td><p><span><span><span>400 Bad Request</span></span></span></p></td></tr><tr><td><p><span><span><span>SQLParsingError</span></span></span></p></td><td><p><span><span><span>UNION is not supported in the SQL expression</span></span></span></p></td><td><p><span><span><span>SQL 表达式中不支持 UNION 子句</span></span></span></p></td><td><p><span><span><span>400 Bad Request</span></span></span></p></td></tr><tr><td><p><span><span><span>SQLParsingError</span></span></span></p></td><td><p><span><span><span>FROM is missing in the SQL expression</span></span></span></p></td><td><p><span><span><span>SQL 表达式中缺少 FROM 子句</span></span></span></p></td><td><p><span><span><span>400 Bad Request</span></span></span></p></td></tr><tr><td><p><span><span><span>SQLParsingError</span></span></span></p></td><td><p><span><span><span>ORDER is not supported in the SQL expression</span></span></span></p></td><td><p><span><span><span>SQL 表达式中不支持 ORDER 子句</span></span></span></p></td><td><p><span><span><span>400 Bad Request</span></span></span></p></td></tr><tr><td><p><span><span><span>SQLParsingError</span></span></span></p></td><td><p><span><span><span>The column index is invalid in the SQL expression</span></span></span></p></td><td><p><span><span><span>SQL 表达式中指定的列索引不合法</span></span></span></p></td><td><p><span><span><span>400 Bad Request</span></span></span></p></td></tr><tr><td><p><span><span><span>SQLParsingError</span></span></span></p></td><td><p><span><span><span>The table alias is invalid in WHERE</span></span></span></p></td><td><p><span><span><span>WHERE 子句中的表别名不合法</span></span></span></p></td><td><p><span><span><span>400 Bad Request</span></span></span></p></td></tr><tr><td><p><span><span><span>Bzip2DecompressError</span></span></span></p></td><td><p><span><span><span>Encountered an error decompressing the bzip2 file</span></span></span></p></td><td><p><span><span><span>解压 BZIP2 格式的文件时出现问题</span></span></span></p></td><td><p><span><span><span>400 Bad Request</span></span></span></p></td></tr><tr><td><p><span><span><span>Bzip2DecompressError</span></span></span></p></td><td><p><span><span><span>BZIP2 is not applicable to the queried object</span></span></span></p></td><td><p><span><span><span>BZIP2 格式不适用于解压待查询对象</span></span></span></p></td><td><p><span><span><span>400 Bad Request</span></span></span></p></td></tr><tr><td><p><span><span><span>GzipDecompressError</span></span></span></p></td><td><p><span><span><span>Encountered an error decompressing the gzip file</span></span></span></p></td><td><p><span><span><span>解压 GZIP 格式的文件时出现问题</span></span></span></p></td><td><p><span><span><span>400 Bad Request</span></span></span></p></td></tr><tr><td><p><span><span><span>GzipDecompressError</span></span></span></p></td><td><p><span><span><span>GZIP is not applicable to the queried object</span></span></span></p></td><td><p><span><span><span>GZIP 格式不适用于解压待查询对象</span></span></span></p></td><td><p><span><span><span>400 Bad Request</span></span></span></p></td></tr><tr><td><p><span><span><span>Busy</span></span></span></p></td><td><p><span><span><span>The service is busy. Please retry later</span></span></span></p></td><td><p><span><span><span>后端服务阻塞，请稍后重试</span></span></span></p></td><td><p><span><span><span>400 Bad Request</span></span></span></p></td></tr><tr><td><p><span><span><span>Overload</span></span></span></p></td><td><p><span><span><span>The service is overload. Please retry later</span></span></span></p></td><td><p><span><span><span>后端服务过载，请稍后重试</span></span></span></p></td><td><p><span><span><span>400 Bad Request</span></span></span></p></td></tr><tr><td><p><span><span><span>AmbiguousFieldName</span></span></span></p></td><td><p><span><span><span>Field name matches to multiple fields in the file</span></span></span></p></td><td><p><span><span><span>指定的表头名称存在多个相同的值</span></span></span></p></td><td><p><span><span><span>400 Bad Request</span></span></span></p></td></tr><tr><td><p><span><span><span>ComparisonFailed</span></span></span></p></td><td><p><span><span><span>Attempt to compare failed</span></span></span></p></td><td><p><span><span><span>匹配失败，请重试</span></span></span></p></td><td><p><span><span><span>400 Bad Request</span></span></span></p></td></tr><tr><td><p><span><span><span>CastFailed</span></span></span></p></td><td><p><span><span><span>Attempt to convert from one data type to another using CAST failed in the SQL expression.</span></span></span></p></td><td><p><span><span><span>在 SQL 表达式中通过 CAST 函数转换数据类型时出现错误</span></span></span></p></td><td><p><span><span><span>400 Bad Request</span></span></span></p></td></tr><tr><td><p><span><span><span>OverMaxRecordSize</span></span></span></p></td><td><p><span><span><span>The length of a record in the input or result is greater than maxCharsPerRecord of 1 MB</span></span></span></p></td><td><p><span><span><span>输入或输出的文件中，单行记录大小超过1MB限制</span></span></span></p></td><td><p><span><span><span>400 Bad Request</span></span></span></p></td></tr><tr><td><p><span><span><span>LastRecordParseFail</span></span></span></p></td><td><p><span><span><span>Please check the last record in the input</span></span></span></p></td><td><p><span><span><span>请检查输入文件的最后一行记录</span></span></span></p></td><td><p><span><span><span>400 Bad Request</span></span></span></p></td></tr><tr><td><p><span><span><span>CSVParsingError</span></span></span></p></td><td><p><span><span><span>Encountered an error parsing the CSV file</span></span></span></p></td><td><p><span><span><span>解析 CSV 格式文件的时候出现问题</span></span></span></p></td><td><p><span><span><span>400 Bad Request</span></span></span></p></td></tr><tr><td><p><span><span><span>JSONParsingError</span></span></span></p></td><td><p><span><span><span>Encountered an error parsing the JSON file</span></span></span></p></td><td><p><span><span><span>解析 JSON 格式文件的时候出现问题</span></span></span></p></td><td><p><span><span><span>400 Bad Request</span></span></span></p></td></tr><tr><td><p><span><span><span>ErrorWritingRow</span></span></span></p></td><td><p><span><span><span>Encountered an error parsing the SELECT result. Please try again</span></span></span></p></td><td><p><span><span><span>无法格式化您的查询结果，请检查文件并重试</span></span></span></p></td><td><p><span><span><span>400 Bad Request</span></span></span></p></td></tr><tr><td><p><span><span><span>InvalidRequestParameter</span></span></span></p></td><td><p><span><span><span>The input Comment of CSV is invalid</span></span></span></p></td><td><p><span><span><span>不合法的 CSV 文件注释符</span></span></span></p></td><td><p><span><span><span>400 Bad Request</span></span></span></p></td></tr><tr><td><p><span><span><span>InvalidTextEncoding</span></span></span></p></td><td><p><span><span><span>UTF-8 encoding is required. Please check the file and try again.</span></span></span></p></td><td><p><span><span><span>检索文件和检索结果仅支持UTF-8编码</span></span></span></p></td><td><p><span><span><span>400 Bad Request</span></span></span></p></td></tr><tr><td><p><span><span><span>NoSuchKey</span></span></span></p></td><td><p><span><span><span>The specified key does not exist</span></span></span></p></td><td><p><span><span><span>指定的对象键不存在</span></span></span></p></td><td><p><span><span><span>404 Not Found</span></span></span></p></td></tr><tr><td><p><span><span><span>AccessDenied</span></span></span></p></td><td><p><span><span><span>Access Denied</span></span></span></p></td><td><p><span><span><span>签名或者权限不正确，拒绝访问</span></span></span></p></td><td><p><span><span><span>403 Forbidden</span></span></span></p></td></tr><tr><td><p><span><span><span>MethodNotAllowed</span></span></span></p></td><td><p><span><span><span>The specified method is not allowed against this resource</span></span></span></p></td><td><p><span><span><span>当前资源不支持该 HTTP 方法</span></span></span></p></td><td><p><span><span><span>405 Method Not Allowed</span></span></span></p></td></tr><tr><td><p><span><span><span>InternalError</span></span></span></p></td><td><p><span><span><span>We encountered an internal error. Please try again</span></span></span></p></td><td><p><span><span><span>服务端内部错误</span></span></span></p></td><td><p><span><span><span>500 Internal Server</span></span></span></p></td></tr></tbody></table>

## 示例

#### 示例1: 从 CSV 格式的对象中检索内容

以下示例展示了调用该接口从 CSV 格式的对象中检索全部内容，并将检索结果输出为 CSV 格式的过程。待检索的对象名为 `exampleobject.csv` ，该对象存储于北京地域（ap-beijing）的存储桶 examplebucket-1250000000中。

如果您需要执行不同的检索指令，可以在 Expression 元素中修改 SQL 指令，有关指令的详细介绍，请参见 [Select 命令](https://cloud.tencent.com/document/product/436/37636 "https://cloud.tencent.com/document/product/436/37636") ，以下为部分常见检索场景的简介。

假设您使用列索引筛选对象中的内容，您可以使用 `s._n` 筛选第 `n` 列的数据， `n` 最小为1。如下指令将从对象中筛选第3列数值大于100的记录，并返回这些记录的第1和第2列：

```sql
SELECT s._1, s._2 FROM COSObject s WHERE s._3 > 100
```

```sql
SELECT s.Id, s.FirstName FROM COSObject s
```

您也可以在 SQL 表达式中指定函数，如下指令将统计出第一列中小于1的记录数：

```sql
SELECT count(*) FROM COSObject s WHERE s._1 < 1
```

如下为响应的例子：

```
HTTP/1.1 200 OKx-cos-id-2: cos_id_demox-cos-request-id: cos_request_id_demoDate: Tue, 12 Jan 2019 11:50:29 GMT﻿
A series of messages
```

#### 示例2: 从 JSON 格式的对象中检索内容

以下示例展示了调用该接口从 JSON 格式的对象中检索全部内容，并将检索结果输出为 CSV 格式的过程。待检索的对象名为 `exampleobject.json` ，该对象存储于北京地域（ap-beijing）的存储桶 examplebucket-1250000000中。

```xml
POST /exampleobject.json?select&select-type=2 HTTP/1.1Host: examplebucket-1250000000.cos.ap-beijing.myqcloud.comDate: Tue, 12 Jan 2019 11:52:29 GMTAuthorization: authorization stringContent-Length: content length﻿
<?xml version="1.0" encoding="UTF-8"?><SelectRequest>    <Expression>Select * from COSObject</Expression>    <ExpressionType>SQL</ExpressionType>    <InputSerialization>        <CompressionType>NONE</CompressionType>        <JSON>            <Type>DOCUMENT</Type>        </JSON>    </InputSerialization>    <OutputSerialization>        <CSV>            <QuoteFields>ASNEEDED</QuoteFields>            <RecordDelimiter>\\n</RecordDelimiter>            <FieldDelimiter>,</FieldDelimiter>            <QuoteCharacter>"</QuoteCharacter>            <QuoteEscapeCharacter>"</QuoteEscapeCharacter>        </CSV>                                   </OutputSerialization></SelectRequest>
```

同样的，您也可以对 JSON 对象执行不同的检索指令，可以在 `Expression` 元素中修改 SQL 指令，有关指令的详细介绍，请参见 [Select 命令](https://cloud.tencent.com/document/product/436/37636 "https://cloud.tencent.com/document/product/436/37636") ，以下为部分常见检索场景的简介。

您可以通过 JSON 属性名称检索相应的数据，如下指令将从对象中筛选 `city` 数值为 Seattle 的记录，并返回这些记录的 `country` 和 `city` 信息：

```sql
SELECT s.country, s.city from COSObject s where s.city = 'Seattle'
```

您也可以在 SQL 表达式中指定函数，如下指令将统计出 JSON 对象中的记录总数：

```sql
SELECT count(*) FROM COSObject s
```

## 注意事项

与 [GET Object](https://cloud.tencent.com/document/product/436/7753 "https://cloud.tencent.com/document/product/436/7753") 接口不同， SELECT Object Content 不支持以下功能：

返回对象的某一片段：您不能通过 Range 这类参数指定返回对象的某一部分。

对于归档存储（ARCHIVE）和深度归档存储（DEEP\_ARCHIVE）类型的对象，COS Select 无法直接进行检索，您需要取回数据后再进行操作。