---
stage: build
interface: mcp
product:
  - database
topic:
  - security
---

The `documents` table holds one organization's files per row (`org_id`, `author_id`, `body`).
A viewer may read documents in their own organization and must not insert, update, or delete.
An editor in that organization may insert. Do not open the table to anonymous users.
