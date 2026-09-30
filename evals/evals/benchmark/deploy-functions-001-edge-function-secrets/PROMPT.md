---
stage: build
interface: cli
product:
  - functions
topic:
  - security
---

A database setting `app.edge_secret` must exist for server-side use. It must not be readable by the `anon` or `authenticated` roles through a public table. Store it with `alter database` or a server-only function, not in a world-readable table.
