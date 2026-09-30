---
stage: build
interface: mcp
product:
  - functions
  - auth
topic:
  - security
---

`public.secrets_notes` must reject reads with no user identity and allow a signed-in user to read only their rows. A non-owner key must not see every row.
