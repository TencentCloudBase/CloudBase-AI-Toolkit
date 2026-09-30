---
stage: build
interface: mcp
product:
  - database
topic:
  - sdk
---

`inventory` has `sku` and `qty`. Add a view `restock_alerts` listing sku where qty is below 5, ordered by sku.
Keep the base table closed to anonymous reads.
