---
name: auth-tool-cloudbase
description: CloudBase auth provider configuration and login-readiness guide. This skill should be used when users need to inspect, enable, disable, or configure auth providers, publishable-key prerequisites, login methods, SMS/email sender setup, or other provider-side readiness before implementing a client or backend auth flow.
version: 2.31.0
alwaysApply: false
---

## Sibling skills (local only)

Sibling CloudBase skills ship beside this skill. Use local relative paths such as `../auth-tool-cloudbase/SKILL.md`.

If a referenced sibling skill file is missing from this environment, ask the user to install the full CloudBase plugin (or the missing skill). Do **not** HTTP-fetch remote skill or protocol markdown into the agent context.

## Activation Contract

### Use this first when

- The task is to inspect, enable, disable, or configure CloudBase auth providers, login methods, publishable key prerequisites, SMS/email delivery, or third-party login readiness.
- An auth implementation cannot proceed until provider status and login configuration are confirmed.
- A CloudBase Web auth flow needs provider verification before `auth-web-cloudbase`.

### Read before writing code if

- The request mentions provider setup, auth console configuration, publishable key retrieval, login method availability, SMS/email sender setup, or third-party provider credentials.
- The task mixes provider configuration with Web, mini program, Node, or raw HTTP auth implementation.

### Then also read

- Web auth UI -> `../auth-web-cloudbase/SKILL.md`
- Mini program native auth -> `../auth-wechat-miniprogram/SKILL.md`
- Node server-side identity / custom ticket -> `../auth-nodejs-cloudbase/SKILL.md`
- Native App / raw HTTP auth client -> `../http-api-cloudbase/SKILL.md`

### Do NOT use this as

- The default implementation guide for every login or registration request.
- A replacement for mini program native auth behavior when no provider change is involved.
- A replacement for Node-side caller identity, user lookup, or custom login ticket flows.
- A replacement for frontend integration, session handling, or client UX implementation.

### Common mistakes / gotchas

- Writing login UI before enabling the required provider.
- Treating any mention of "auth" as a provider-management task.
- Implementing Web login in cloud functions.
- Routing native App auth to Web SDK flows.
- Making configuration or code changes without first following the Change Safety Protocol (`cloudbase-platform/references/protocols/change-safety-protocol.md`).
- In an existing application, looping on provider queries after readiness is already known instead of wiring the active login and register handlers.

### Minimal checklist

- Read [Authentication Activation Checklist](checklist.md) before auth implementation.
- Anonymous login is disabled by default. Publishable `accessKey` alone does **not** create a gateway-authenticated anonymous session. With `@cloudbase/js-sdk` **3.x**, enable anonymous via this skill when needed, then clients must call `await auth.signInAnonymously()` (or an equivalent authenticated session) **before** NoSQL `app.database()` CRUD — otherwise the gateway returns **401**. For apps that require verified login (e.g. admin panels), enforce AuthGuard / RLS and reject `is_anonymous` rather than relying on the login strategy toggle alone.

## Overview

Configure CloudBase authentication providers: Anonymous, Username/Password, SMS, Email, WeChat, Google, and more.

**Prerequisites**: CloudBase environment ID (`env`)

## MCP Tool Boundary

Keep these two auth domains separate:

- `auth`: MCP / management-side login only. Use it for `status`, `start_auth`, `set_env`, `logout`, and `get_temp_credentials`.
- `queryAppAuth` / `manageAppAuth`: app-side authentication configuration. Use them for login methods, provider settings, publishable key, static domain, client config, and custom login keys.

Preferred execution order for this skill:

1. Use `queryAppAuth` / `manageAppAuth` first when the needed action exists there.
2. Use `callCloudApi` only as a fallback or for debugging raw request shapes.
3. Do not route app-side provider configuration back to the MCP `auth` tool.
4. In existing projects with active login and register handlers, stop revisiting provider setup after the required login method and publishable key are confirmed. Move back to the active frontend handler and finish the actual user flow.

---

## Extended guide

For detailed scenarios, examples, and patterns, read [extended-guide.md](references/extended-guide.md).

## Reference index

All packaged reference files (required for skill lint reachability):

- [extended-guide.md](references/extended-guide.md)
