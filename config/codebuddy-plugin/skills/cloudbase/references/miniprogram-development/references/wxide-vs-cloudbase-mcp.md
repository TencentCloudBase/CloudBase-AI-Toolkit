# WeChat IDE Skills vs CloudBase MCP / Skills

**微信云开发 = CloudBase × 微信**：同一套云能力，在微信侧用开发者工具登录态直达；CloudBase MCP 补 IDE Skills 未覆盖的进阶云治理。

## Three layers

| Layer | Role | Login | Typical capabilities |
| --- | --- | --- | --- |
| **WeChat IDE Skills** (Nightly) | Execution surface (default for mini programs) | WeChat scan login in DevTools | Project / compile / simulator / preview / upload, automation, console/network, cloud env / functions / NoSQL / storage via `wechatide` |
| **CloudBase Skills** | Knowledge pack | Does not replace login | CloudBase rules, pitfalls, coding conventions (`npx skills add tencentcloudbase/cloudbase-skills -y`) |
| **CloudBase MCP** | Full cloud complement | Tencent Cloud auth (API Key / web / device-code) | Env governance, advanced permissions, data models, MySQL/PostgreSQL, and other gaps IDE Skills do not cover |

Nightly ships built-in Skills/MCP: https://developers.weixin.qq.com/miniprogram/dev/devtools/nightly_backup.html

## Decision tree

1. Is the task mini program **debug / preview / open project / console / network / upload experience build**?
   - Yes → **WeChat IDE Skills** (`wechatide`). See [devtools-debug-preview.md](devtools-debug-preview.md).
2. Is the task **daily** cloud ops on the mini program CloudBase env (list/query collections, deploy a function, list/upload storage)?
   - Nightly available → **WeChat IDE Skills** `cloudbase-operator` tools.
   - Nightly unavailable → **CloudBase MCP** (after Tencent Cloud login).
3. Is the task **advanced cloud** (data model / MySQL / PG / fine-grained security rules / multi-env platform ops beyond IDE tools)?
   - → **CloudBase MCP**.
4. Always useful: install **CloudBase Skills** as knowledge constraints for how to write CloudBase code — they are not a substitute for either execution surface.

## Do / Don't

**Do**

- Prefer Nightly + `wechatide` for high-frequency mini program workflows
- Keep CloudBase Skills installed for best-practice knowledge
- Use CloudBase MCP to fill gaps IDE Skills do not cover

**Don't**

- Force a separate Tencent Cloud MCP login for everyday NoSQL / function / storage ops when `wechatide` already works with WeChat login
- Assume Stable DevTools includes the same Skills/MCP as Nightly
- Copy or invent `wechatide` tool schemas — use `--help` and the Nightly `tools.yaml`

## Related

- Execution paths: [devtools-debug-preview.md](devtools-debug-preview.md)
- `wx.cloud` / OPENID / client rules: [cloudbase-integration.md](cloudbase-integration.md)
