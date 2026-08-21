---
name: cloud-functions
description: Use when creating, updating, invoking, or debugging CloudBase cloud functions from DeepSeek Harness.
---

# Cloud functions (DSH)

- List: `mcp__cloudbase__queryFunctions`.
- Deploy: `mcp__cloudbase__manageFunctions` `action=createFunction` or `updateFunctionCode`. Point `functionRootPath` at the parent directory of the function folder.
- Runtime cannot be changed after create.
- User-facing name is 云函数, never SCF.
