---
stage: build
interface: mcp
product:
  - storage
topic:
  - security
---

`storage.objects` must keep row security on. A user may list only their own objects. Anonymous users must not list the bucket.
