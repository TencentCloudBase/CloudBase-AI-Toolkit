---
stage: resolve
interface: mcp
product:
  - database
topic:
  - security
---

Signed-in users get zero rows from `bookmarks` even though rows exist. Fix the policies so a user can read their own bookmarks. Do not turn row security off and do not grant the table to anonymous.
