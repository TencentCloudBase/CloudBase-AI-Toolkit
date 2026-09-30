---
stage: build
interface: mcp
product:
  - database
topic:
  - sdk
board: unscored
---

`customers` and `orders` are already seeded. Add a view `customer_totals` with `customer_id` and `total`, one row per customer, ordered by `customer_id`.
The base tables must stay closed to the anonymous role.
