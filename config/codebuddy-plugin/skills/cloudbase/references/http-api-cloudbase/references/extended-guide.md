# Extended guide — http-api-cloudbase

> Moved from SKILL.md to satisfy Agent Skills Spec 500-line limit.

## Usage Examples

### Cloud Function Invocation Example

```bash
curl -X POST "https://your-env-id.api.tcloudbasegateway.com/v1/functions/YOUR_FUNCTION_NAME" \
  -H "Authorization: Bearer <access_token/apikey/publishable_key>" \
  -H "Content-Type: application/json" \
  -d '{"name": "张三", "age": 25}'
```

For detailed API specifications, always download and reference the OpenAPI Swagger files mentioned above.

## 关系型数据库 RESTful API (PostgREST 风格)

> **适用于 MySQL 和 PostgreSQL**：两者均基于 PostgREST 风格暴露 REST API，端点格式和请求语义一致。

提供关系型数据库（MySQL / PostgreSQL）的 HTTP 操作接口。

### Base URL Patterns

Support three domain access patterns:

1. `https://{envId}.api.tcloudbasegateway.com/v1/rdb/rest/{table}`
2. `https://{envId}.api.tcloudbasegateway.com/v1/rdb/rest/{schema}/{table}`
3. `https://{envId}.api.tcloudbasegateway.com/v1/rdb/rest/{instance}/{schema}/{table}`

Where:
- `envId` is the environment ID
- `instance` is the database instance identifier
- `schema` is the database name
- `table` is the table name

If using the system database, **recommend pattern 1**.

### Request Headers

| Header | Parameter | Description | Example |
|--------|-----------|-------------|---------|
| Accept | `application/json`, `application/vnd.pgrst.object+json` | Control data return format | `Accept: application/json` |
| Content-Type | `application/json`, `application/vnd.pgrst.object+json` | Request content type | `Content-Type: application/json` |
| Prefer | Operation-dependent feature values | - `return=representation` Write operation, return data body and headers<br>- `return=minimal` Write operation, return headers only (default)<br>- `count=exact` Read operation, specify count<br>- `resolution=merge-duplicates` Upsert operation, merge conflicts<br>- `resolution=ignore-duplicates` Upsert operation, ignore conflicts | `Prefer: return=representation` |
| Authorization | `Bearer <token>` | Authentication token | `Authorization: Bearer <access_token>` |

### Query Records

**GET** `/v1/rdb/rest/{table}`

**Query Parameters**:
- `select`: Field selection, supports `*` or field list, supports join queries like `class_id(grade,class_number)`
- `limit`: Limit return count
- `offset`: Offset for pagination
- `order`: Sort field, format `field.asc` or `field.desc`

**Example**:

```bash
# Before URL encoding
curl -X GET 'https://your-env.api.tcloudbasegateway.com/v1/rdb/rest/course?select=name,position&name=like.%张三%&title=eq.文章标题' \
  -H "Authorization: Bearer <access_token>"

# After URL encoding
curl -X GET 'https://your-env.api.tcloudbasegateway.com/v1/rdb/rest/course?select=name,position&name=like.%%E5%BC%A0%E4%B8%89%&title=eq.%E6%96%87%E7%AB%A0%E6%A0%87%E9%A2%98' \
  -H "Authorization: Bearer <access_token>"
```

**Response Headers**:
- `Content-Range`: Data range, e.g., `0-9/100` (0=start, 9=end, 100=total)

### Insert Records

**POST** `/v1/rdb/rest/{table}`

**Request Body**: JSON object or array of objects

> 💡 **Identity fields differ by database mode**: In PostgreSQL / CloudBase PG, do **not** use `_openid`. Prefer owner columns with `DEFAULT auth.uid()` (JWT `sub`) and omit the owner field from INSERT bodies. In legacy MySQL/NoSQL-oriented examples, `_openid` may be populated by the platform; do not copy that pattern into PG tables.

**Example**:

```bash
curl -X POST 'https://your-env.api.tcloudbasegateway.com/v1/rdb/rest/course' \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{
    "name": "数学",
    "position": 1
  }'
```

### Update Records

**PATCH** `/v1/rdb/rest/{table}`

**Request Body**: JSON object with fields to update

**Example**:

```bash
curl -X PATCH 'https://your-env.api.tcloudbasegateway.com/v1/rdb/rest/course?id=eq.1' \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{
    "name": "高等数学",
    "position": 2
  }'
```

> ⚠️ **Important**: UPDATE requires a WHERE clause. Use query parameters like `?id=eq.1` to specify conditions.

### Delete Records

**DELETE** `/v1/rdb/rest/{table}`

**Example**:

```bash
curl -X DELETE 'https://your-env.api.tcloudbasegateway.com/v1/rdb/rest/course?id=eq.1' \
  -H "Authorization: Bearer <access_token>"
```

> ⚠️ **Important**: DELETE requires a WHERE clause. Use query parameters to specify conditions.

### Error Codes and HTTP Status Codes

| Error Code | HTTP Status | Description |
|------------|-------------|-------------|
| INVALID_PARAM | 400 | Invalid request parameters |
| INVALID_REQUEST | 400 | Invalid request content: missing permission fields, SQL execution errors, etc. |
| INVALID_REQUEST | 406 | Does not meet single record return constraint |
| PERMISSION_DENIED | 401, 403 | Authentication failed: 401 for identity authentication failure, 403 for authorization failure |
| RESOURCE_NOT_FOUND | 404 | Database instance or table not found |
| SYS_ERR | 500 | Internal system error |
| OPERATION_FAILED | 503 | Failed to establish database connection |
| RESOURCE_UNAVAILABLE | 503 | Database unavailable due to certain reasons |

### Response Format

1. All POST, PATCH, DELETE operations: Request header with `Prefer: return=representation` means there is a response body, without it means only response headers.

2. POST, PATCH, DELETE response bodies are usually JSON array type `[]`. If request header specifies `Accept: application/vnd.pgrst.object+json`, it will return JSON object type `{}`.

3. If `Accept: application/vnd.pgrst.object+json` is specified but data quantity is greater than 1, an error will be returned.

### URL Encoding

When making requests, please perform URL encoding. For example:

**Original request**:

```shell
curl -i -X GET 'https://{{host}}/v1/rdb/rest/course?select=name,position&name=like.%张三%&title=eq.文章标题'
```

**Encoded request**:

```shell
curl -i -X GET 'https://{{host}}/v1/rdb/rest/course?select=name,position&name=like.%%E5%BC%A0%E4%B8%89%&title=eq.%E6%96%87%E7%AB%A0%E6%A0%87%E9%A2%98'
```

## NoSQL RESTful API

NoSQL RESTful API 提供文档型数据库（NoSQL）的 HTTP 操作接口，支持集合管理、文档 CRUD、聚合查询、事务操作和数据库命令。

### Base URL

```
https://{envId}.api.tcloudbasegateway.com/v1/database/instances/{instance}/databases/{database}/
```

| 参数 | 说明 |
|------|------|
| `envId` | 环境 ID |
| `instance` | 数据库实例 ID，默认实例使用 `(default)` |
| `database` | 数据库名称，默认数据库使用 `(default)` |

示例：
- 默认实例 + 默认数据库：`/v1/database/instances/(default)/databases/(default)/`
- 指定实例 + 默认数据库：`/v1/database/instances/test_instance/databases/(default)/`

### 请求与响应格式

- 请求支持 Relaxed 和 Strict EJSON 格式
- 响应均为 Strict EJSON 格式
- EJSON 支持的特殊类型：`ObjectId`、`Date`、`Int`、`Long`、`Decimal128`、`Binary`、`RegExp`

### 错误码与 HTTP 状态码

| 错误码 | HTTP 状态码 | 说明 |
|--------|-------------|------|
| `INVALID_PARAM` | 400 | 参数错误 |
| `DATABASE_PERMISSION_DENIED` | 401 | 权限不足 |
| `DATABASE_INVALID_OPERRATOR` | 403 | 不支持的操作 |
| `DATABASE_COLLECTION_NOT_EXIST` | 404 | 集合不存在 |
| `DOCUMENT_NOT_FOUND` | 404 | 文档不存在 |
| `DATABASE_COLLECTION_ALREADY_EXIST` | 409 | 集合已存在 |
| `DATABASE_DUPLICATE_WRITE` | 409 | 唯一索引冲突 |
| `EXCEED_REQUEST_LIMIT` | 422 | 请求次数超限 |
| `EXCEED_CONCURRENT_REQUEST_LIMIT` | 422 | 并发请求超限 |
| `DATABASE_REQUEST_FAILED` | 500 | 数据库请求失败 |
| `SYS_ERR` | 500 | 内部错误 |
| `DATABASE_TRANSACTION_CONFLICT` | 503 | 事务冲突 |
| `DATABASE_TRANSACTION_FAIL` | 503 | 事务执行失败 |
| `DATABASE_TIMEOUT` | 504 | 数据库操作超时 |

详细端点使用和请求示例，请参考官方文档：https://docs.cloudbase.net/http-api/nosql/nosql-restful-api

---

## AI 大模型接入 API

统一的大模型接入 API，支持通过 HTTP 调用已配置的 AI 大模型（支持 SSE 流式响应）。

### 认证方式

| 方式 | 说明 |
|------|------|
| `Authorization: Bearer <token>` | AccessToken 认证（推荐） |
| TC3-HMAC-SHA256 签名 | 腾讯云 API v3 签名方式 |
| `Authorization: <apikey>` | APIKey 认证 |

> AccessToken 获取方式：参考 Auth OpenAPI (`searchKnowledgeBase({ mode: "openapi", apiName: "auth" })`)

### 错误码

| 错误码 | 说明 |
|--------|------|
| `AI_MODEL_CONFIG_MISSING` | 缺少模型 API Key 或配置 |
| `AI_MODEL_PARAM_INVALID` | 输入参数无效 |
| `AI_MODEL_DISABLED` | 模型已禁用，请在控制台检查或等待约 2 分钟 |
| `AI_MODEL_NOT_SUPPORTED` | 请求模型不支持或未启用 |
| `AI_MODEL_PARAM_REQUIRED` | 缺少必需参数 `model` |
| `AI_MODEL_NOT_FOUND` | 指定的模型组不存在 |
| `EXCEED_CONCURRENT_REQUEST_LIMIT` | 并发请求超限，请稍后重试或申请更高配额 |
| `EXCEED_TOKEN_QUOTA_LIMIT` | 模型 Token 配额超限，请购买资源或调整模型组 |

详细端点和请求格式，请参考官方文档：https://docs.cloudbase.net/http-api/ai-model/ai-%E5%A4%A7%E6%A8%A1%E5%9E%8B%E6%8E%A5%E5%85%A5
以及 OpenAPI 规范：`https://docs.cloudbase.net/openapi/ai_model.v1.openapi.yaml`

---

## Online Debugging Tool

CloudBase platform provides an [online debugging tool](https://docs.cloudbase.net/http-api/basic/online-api-call) where you can test API interfaces without writing code:

1. Visit the API documentation page
2. Find the debugging tool entry
3. Fill in environment ID and request parameters
4. Click send request to view response

## API Documentation References

**⚠️ Always use `searchKnowledgeBase` tool to get OpenAPI Swagger specifications:**

Use `searchKnowledgeBase({ mode: "openapi", apiName: "<api-name>" })` with these API names:
- `auth` - Authentication API
- `mysqldb` - 关系型数据库 RESTful API (MySQL/PostgreSQL)
- `nosql` - NoSQL RESTful API (文档型数据库)
- `functions` - Cloud Functions API
- `cloudrun` - CloudRun API
- `storage` - Storage API
- `ai_model` - AI 大模型接入 API

**How to use the OpenAPI documentation:**
1. Call `searchKnowledgeBase` tool with the appropriate `apiName`
2. Parse the returned YAML content to extract:
   - Endpoint paths (e.g., `/v1/rdb/rest/{table}`)
   - HTTP methods (GET, POST, PATCH, DELETE)
   - Path parameters, query parameters, request body schemas
   - Response schemas and status codes
   - Authentication requirements
3. Use the extracted information to construct accurate API calls
4. Never assume endpoint structure - always verify against swagger documentation

## Common Patterns

### Reusable Shell Variables

```bash
env="your-env-id"
token="your-access-token-or-api-key"
base="https://${env}.api.tcloudbasegateway.com"
```

### Common Request Pattern

```bash
curl -X GET "${base}/v1/rdb/rest/table_name" \
  -H "Authorization: Bearer ${token}" \
  -H "Content-Type: application/json"
```

### Error Handling

Always check HTTP status codes and error response format:

```json
{
  "code": "ERROR_CODE",
  "message": "Error message details",
  "requestId": "request-unique-id"
}
```

## Common Authentication Flows

> **🌟 IMPORTANT: Default Authentication Method**
>
> When no specific signup/signin method is specified by the user, **ALWAYS use Phone SMS Verification** as the default and recommended method. It is:
> - ✅ The most user-friendly for Chinese users
> - ✅ No password to remember
> - ✅ Works for both new users (registration) and existing users (login)
> - ✅ Most secure with OTP verification
> - ✅ Supported by default in CloudBase

### Phone Number Verification Code Login (Native Apps) ⭐ RECOMMENDED

This is the **preferred** authentication flow for native mobile apps (iOS/Android/Flutter/React Native):

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Step 1: Send Verification Code                                        │
│  POST /auth/v1/verification                                             │
│  Body: { "phone_number": "+86 13800138000", "target": "ANY" }          │
│  ⚠️ IMPORTANT: phone_number MUST include "+86 " prefix WITH SPACE      │
│  Response: { "verification_id": "xxx", "expires_in": 600 }             │
│  📝 SAVE verification_id for next step!                                 │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│  Step 2: Verify Code                                                    │
│  POST /auth/v1/verification/verify                                      │
│  Body: { "verification_id": "<saved_id>", "verification_code": "123456" }│
│  Response: { "verification_token": "xxx" }                              │
│  📝 SAVE verification_token for login!                                  │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│  Step 3: Sign In with Token                                             │
│  POST /auth/v1/signin                                                   │
│  Body: { "verification_token": "<saved_token>" }                        │
│  Response: { "access_token": "xxx", "refresh_token": "xxx" }           │
└─────────────────────────────────────────────────────────────────────────┘
```

**⚠️ Critical Notes:**
1. **Phone number format**: MUST be `"+86 13800138000"` with space after country code
2. **Save `verification_id`**: Returned from Step 1, required for Step 2
3. **Save `verification_token`**: Returned from Step 2, required for Step 3 

## Best Practices

1. **Always use URL encoding** for query parameters containing special characters
2. **Include WHERE clauses** for UPDATE and DELETE operations
3. **Use appropriate Prefer headers** to control response format
4. **Handle errors gracefully** by checking status codes and error responses
5. **Keep tokens secure** - never expose API Keys in client-side code
6. **Use appropriate authentication method** based on your use case:
   - AccessToken for user-specific operations
   - API Key for server-side admin operations
   - Publishable Key for public access (note: anonymous login is disabled by default for new environments)
7. **Phone number format**: Always use international format with space: `"+86 13800138000"`
8. **Verification flow**: Save `verification_id` from send step, use it in verify step
