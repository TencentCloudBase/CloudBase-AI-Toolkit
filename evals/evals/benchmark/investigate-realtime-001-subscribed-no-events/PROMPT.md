---
stage: investigate
interface: mcp
product:
  - database
topic:
  - sdk
---

Clients subscribe with `app.realtime()` Postgres changes and receive nothing for `orders` inserts. `courier_locations` must keep receiving inserts. Fix publication so `orders` insert, update, and delete events are published. This is not document `watch()`.
