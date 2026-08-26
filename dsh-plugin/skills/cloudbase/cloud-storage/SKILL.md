---
name: cloud-storage
description: Use when listing, uploading, or generating temporary URLs for CloudBase cloud storage from DeepSeek Harness.
---

# Cloud storage (DSH)

- List / info / temporary URL / read: `mcp__cloudbase__queryStorage`.
- Upload / download / delete: `mcp__cloudbase__manageStorage`.
- Private buckets: `publicUrl` may 403. Always prefer `action=url` temporary links (default 1 hour) and tell the user they expire.
