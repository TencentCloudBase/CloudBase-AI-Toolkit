---
stage: build
interface: mcp
product:
  - auth
  - hosting
topic:
  - sdk
  - login
motivation: >-
  Enabling a custom login method and verifying it end-to-end is one of the
  most common first tasks when agents wire up a CloudBase web app, and the
  form semantics (plain usernames, not emails) are part of the task.
---

The web app in `app/` needs user accounts. Enable username + password
sign-in for the app's CloudBase environment, wire up `app/src/auth.js`
(the stubs in there describe what each function should do), and make sure
it works for real: people sign up with a username, password, and display
name, sign back in later, and the app greets them with their display name.

Usernames are plain strings like `admin` or `alex` — the sign-up form must
accept them as-is.

When you're done, a fresh visitor should be able to sign up and sign in
against the real environment.
