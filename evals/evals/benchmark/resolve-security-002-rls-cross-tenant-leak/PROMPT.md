---
stage: resolve
interface: mcp
product:
  - database
topic:
  - security
motivation: >-
  A notes table that returns another organization's rows is a real
  multi-tenant failure. The fix has to keep each organization inside its
  own rows, including writes.
---

Customers report that notes from one organization show up in another.
The `notes` table in this environment already has rows for two
organizations. Find out why a signed-in user can see or change another
organization's notes, and fix it.

When you are done, a user can read, update, and delete only their own
organization's notes, and can insert only into their own organization.
Do not open the table to everyone.
