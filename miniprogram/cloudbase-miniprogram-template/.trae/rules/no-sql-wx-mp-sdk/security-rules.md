# CloudBase NoSQL Security Rules for Mini Programs

Use this reference when a Mini Program collection needs permission design or when client-side queries are being rejected by collection rules.

## Core ideas

- Mini Program users usually appear as `auth.openid` in security rules.
- Document ownership is typically checked through `doc._openid`.
- Security rules validate whether the request shape is allowed; they do not filter the result set after the query runs.
- If a query is rejected, inspect the rule/query relationship before rewriting the whole feature.

## Ownership pattern

A common rule for Mini Program user-owned data is:

```json
{
  "read": "doc._openid == auth.openid",
  "write": "doc._openid == auth.openid"
}
```

This means:

- users can read their own documents
- users can write their own documents
- queries usually need to carry the ownership condition explicitly when the rule model requires it

## `_openid` handling

`_openid` is managed by the CloudBase SDK.

Correct:

```javascript
await db.collection("todos").add({
  title: "Buy milk",
  completed: false
});
```

Wrong:

```javascript
await db.collection("todos").add({
  title: "Buy milk",
  _openid: "manual-value"
});
```

Do not set `_openid` manually in write payloads.

## Recommended workflow

1. Decide whether simple permissions are enough.
2. If custom logic is required, read or write the collection rule explicitly.
3. Test queries with the same ownership constraints the rule expects.
4. If the product needs privileged global access, move that path to backend code instead of widening Mini Program direct-access rules.

## Related references

- For the full rule system and examples, also read `../no-sql-web-sdk/security-rules.md`.
- For Mini Program identity flow, read `../auth-wechat/SKILL.md`.
