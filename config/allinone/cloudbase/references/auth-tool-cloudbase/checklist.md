# Authentication Activation Checklist

Use this checklist before generating any CloudBase authentication flow.

## When this checklist applies

- Web login or registration
- SMS, email, anonymous (disabled by default), Google, or WeChat provider setup
- HTTP API auth flows for native apps or backend integrations

## Required checks

1. Identify the client platform: Web, mini program, native app, or backend.
2. Confirm whether provider configuration must happen before code generation.
3. Check which login methods are required and enable them first.
4. **Default to email verification-code login** when the goal is to get a login flow working. If SMS is required, confirm a custom SMS channel (approved signature and template) is configured first — `patch.phone = true` alone does not deliver codes. Official guide: https://docs.cloudbase.net/authentication-v2/auth/custom-sms-provider (also covers other SMS providers through a cloud function).
5. For Web flows, get or confirm the publishable key before writing frontend auth code.
6. Route to the matching implementation skill after provider setup:
   - Web -> `auth-web-cloudbase`
   - Mini program -> `auth-wechat-miniprogram`
   - Native app / raw HTTP -> `http-api-cloudbase`
7. Keep MCP tool routing explicit:
   - management-side login -> `auth`
   - application-side auth config -> `queryAppAuth` / `manageAppAuth`

## Common failure patterns

- Writing a login page before enabling SMS or email login.
- Treating `patch.phone = true` as "SMS login works" and writing phone OTP code before the custom SMS channel is configured.
- Implementing Web login in cloud functions instead of CloudBase Auth.
- Using Web SDK patterns in native App code.

## Done criteria

- Required providers are enabled.
- Platform-specific auth path is selected.
- The next skill to read is explicit before code generation starts.
