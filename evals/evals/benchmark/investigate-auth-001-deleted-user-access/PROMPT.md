---
stage: investigate
interface: mcp
product:
  - auth
topic:
  - security
---

A deleted user can still read `private_notes`. Stop that. After the account is gone, that user's rows must not be readable by their old identity, and row security must stay on.
