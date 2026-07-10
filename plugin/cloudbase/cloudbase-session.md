# CloudBase Plugin Session Context

Use CloudBase guidance only when the current repo, prompt, or tool call makes it relevant.

- Prefer matched skills and MCP tools over memorized APIs.
- CloudBase has 4 scenarios: Web (React/Vue), Mini Program (WeChat), CloudRun (container), Database.
- Always call `envQuery({ action: "info" })` first to get envId and RuntimeMode before database/auth work.
- The full skill catalog stays in skills/; hooks load topic-sized chunks on demand via prompt analysis.
