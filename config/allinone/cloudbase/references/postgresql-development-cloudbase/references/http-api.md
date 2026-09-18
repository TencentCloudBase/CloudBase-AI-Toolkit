# CloudBase PG HTTP API

Use the HTTP API only when the SDK path is blocked or the caller is a non-SDK client.

## Base endpoints

```text
REST: https://<envId>.api.tcloudbasegateway.com/v1/rdb/rest/<table>
Auth: https://<envId>.api.tcloudbasegateway.com/auth/v1
```

Schema-qualified forms may also be available depending on the target database shape:

```text
/v1/rdb/rest/<schema>/<table>
/v1/rdb/rest/<instance>/<schema>/<table>
```

## Auth header

```http
Authorization: Bearer <Publishable Key | access_token | API Key>
```

- Publishable Key maps to `anon`.
- User access token maps to `authenticated`.
- API Key maps to `service_role` and must never be exposed in browser code.

## Query examples

```bash
curl "https://<envId>.api.tcloudbasegateway.com/v1/rdb/rest/todos?select=*&is_completed=eq.false" \
  -H "Authorization: Bearer <access_token>"
```

```bash
curl -X POST "https://<envId>.api.tcloudbasegateway.com/v1/rdb/rest/todos" \
  -H "Authorization: Bearer <access_token>" \
  -H "Prefer: return=representation" \
  -H "Content-Type: application/json" \
  -d '{"title":"写一篇文档"}'
```

Do not send `_openid` for PG tables. Use owner columns with `DEFAULT auth.uid()` / JWT `sub`.

## PostgREST query syntax

- equality: `?status=eq.published`
- range: `?price=gte.100&price=lte.500`
- like: `?name=like.*CloudBase*`
- in: `?status=in.(draft,published)`
- order: `?order=created_at.desc`
- pagination: `?limit=20&offset=0`
- columns: `?select=id,title,created_at`

If the endpoint shape is uncertain, query OpenAPI docs with `searchKnowledgeBase(mode="openapi", apiName="mysqldb", query="PostgreSQL ...")` instead of guessing paths.
