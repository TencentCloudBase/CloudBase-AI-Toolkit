---
stage: resolve
interface: mcp
product:
  - database
topic:
  - security
  - sdk
motivation: >-
  Security rules that cover read but not create/update/delete are a
  recurring real-world failure: the app looks fine until a user tries to
  write, and the error surfaces far away from the cause.
---

A customer reports: "our notes app reads fine, but every save fails with a
permission error. Nothing was changed on purpose — please investigate and
fix it."

The app and its database live in this project's CloudBase environment, in
the state they were left in. Find out what is actually blocking writes,
fix it, and make sure both reading and writing work for a normal signed-in
user afterwards — without opening the collection up to the whole world.
