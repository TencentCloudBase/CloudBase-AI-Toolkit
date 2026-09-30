---
stage: build
interface: mcp
product:
  - database
topic:
  - security
---

`posts` rows belong to a tenant (`tenant_id`). Reads and writes must stay inside the caller's tenant.
Ship a failing isolation check that becomes passing once the policies are in place. Do not disable row security.
