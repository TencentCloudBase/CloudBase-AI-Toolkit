---
stage: build
interface: mcp
product:
  - auth
topic:
  - sdk
---

Email and password sign-up must create a user and store `display_name` on `public.profiles`. A wrong password must not create a session. Usernames are not required for this task.
