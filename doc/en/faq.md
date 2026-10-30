# FAQ

## What is CloudBase MCP?

Tencent CloudBase is an **AI-native backend service** built for AI Coding. Over the MCP protocol, an AI IDE gets one-stop access to databases, authentication, cloud functions, container hosting, static hosting, and other backend integration and deployment capabilities. In other words, it turns CloudBase into a backend platform that AI can call directly, so AI does not just write code — it also completes the full loop from data storage and business logic to deployment.

CloudBase MCP works with many AI IDEs (OpenClaw, Cursor, WindSurf, CodeBuddy, Claude Code, GitHub Copilot, and more). Configure the MCP once, and you can then use natural language in these IDEs to:

- Design and create database tables and collections
- Manage file storage, static hosting, and static assets
- Develop and deploy cloud functions and cloud hosting services
- Build and ship full-stack projects in one step

## Why CloudBase

### Why choose CloudBase?

- **Fast deployment**: China-based nodes, faster access than overseas regions
- **Stable and reliable**: the Serverless platform chosen by 3.3 million developers
- **Developer friendly**: a full-stack platform designed for the AI era, with automatic environment setup
- **Cost efficient**: the Serverless architecture scales elastically; new users can try it for free during development

## Getting started

### I'm a new user. How do I get started quickly?

1. Install a supported AI development tool (OpenClaw, Cursor, WindSurf, etc.)
2. Create an environment in the Tencent CloudBase console (free for new users)
3. Download a project template, or configure MCP in your existing project
4. Tell the AI "Log in to CloudBase" and start building

### Which AI development tools are supported?

CloudBase AI CLI, OpenClaw, Cursor, WindSurf, WorkBuddy, Doubao, MiniMax Code, DeepSeek Harness, Kimi Code, Kimi Work, ZCode, Codex App, CodeBuddy, CLINE, GitHub Copilot, Claude Code, Gemini CLI, Codex CLI, OpenCode, Trae, Tongyi Lingma, RooCode, Baidu Comate, Augment Code, Qwen Code, iFlow CLI, and other mainstream AI development tools.

## Technical questions


### How do I integrate the templates and rules into an existing project?

If you already have your own project, configure MCP first, then tell the AI "Download the CloudBase AI rules into the current project". It downloads and fills in the AI editor rule files in your project directory — no manual work needed.

If you only want the config files for a specific IDE (to keep the project directory clean), name the IDE:

```
Download the CloudBase AI rules into the current project, Cursor only
Download the CloudBase AI rules into the current project, WindSurf only
Download the CloudBase AI rules into the current project, Claude Code only
```

---

### How do I get my CloudBase environment ID?

1. Open the [Tencent CloudBase console](https://tcb.cloud.tencent.com/dev) and create an environment (free for new users)
2. Copy the **Environment ID** from the right side of the console's Overview page  
   (you will need it for deployment)

---

### How do I update the CloudBase AI ToolKit?

**Update the AI rules**

To update an existing project to the latest CloudBase AI rules, tell the AI:

```
Download the CloudBase AI rules and update the rules in the current project
```

The AI downloads the latest rule files into your project directory automatically.

**Update the MCP tools**

When a new version of the MCP tools is released:

1. **Auto update (recommended)**: in your AI tool's MCP list, find cloudbase and re-enable it or refresh the list — the latest version installs automatically

2. **Manual update**: if the auto update fails, disable and re-enable cloudbase, or restart your AI IDE

**Notes**:
- The MCP config uses the `@latest` tag, so it usually picks up the latest version automatically
- If you hit a caching issue, fully restart the AI IDE and re-enable the MCP
- Check for updates regularly to get the latest features and fixes

---

### The MCP tool count shows 0

If cloudbase-mcp shows a tool count of 0 in your AI tool's MCP list, work through these steps:

**1. Check the environment**
- Make sure Node.js is v18.15.0 or later
- On macOS with nvm, set the default Node version to v18.15.0 or later — mismatched versions across terminals cause this
- Check your network; setting npm to the Tencent mirror helps:
  ```bash
  npm config set registry https://mirrors.cloud.tencent.com/npm/
  ```

**2. Re-enable the MCP**
- Disable cloudbase-mcp in the MCP list
- Re-enable cloudbase or refresh the list
- If it still fails, fully restart the AI IDE and try again

**3. Reinstall manually**

In most cases, re-enabling or refreshing in the MCP list installs the tools and they show up.

Follow the steps in [How do I install CloudBase MCP globally?](#how-do-i-install-cloudbase-mcp-globally)

---

### MCP error -32001: Request timed out after configuring MCP

If you see `MCP error -32001: Request timed out` while configuring MCP:

Follow the steps in [How do I install CloudBase MCP globally?](#how-do-i-install-cloudbase-mcp-globally)

### How do I install CloudBase MCP globally?

#### The problems

When using CloudBase MCP, have you run into any of these?

- **Slow installs** - `npx` downloads the package again every time, and the wait adds up
- **Complex setup** - you have to configure the npm registry, Node.js version, and other dependencies by hand
- **Repeated setup** - every AI IDE needs the MCP service configured separately
- **Network issues** - npm installs often time out or fail

#### The fix: quick install via CloudBase AI CLI

Use the quick install of **CloudBase AI CLI**. It solves all of the above in one shot:

- Fast: installs in seconds, where npm usually takes minutes
- One place: one command manages multiple AI coding CLI tools, including the built-in CloudBase AI Toolkit MCP
- Works anywhere: runs in WeChat DevTools, VS Code, GitHub Actions, and more
- Ready to use: the MCP service is configured automatically after install

#### Quick install steps

**1. Install with npm**

```bash
npm install @cloudbase/cli@latest -g
```

**2. Verify the install**

Once installed, CloudBase AI CLI automatically sets up the CloudBase AI Toolkit MCP service and creates the global command `cloudbase-mcp`.

**3. Configure MCP**

Restart your AI IDE, then update the MCP config:

```json
{
  "mcpServers": {
    "cloudbase": {
      "command": "cloudbase-mcp"
    }
  }
}
```

**4. Verify the MCP service**

CloudBase MCP should start right away.

#### Supported AI IDEs

The CloudBase AI CLI quick install works in every AI IDE that supports MCP (Model Context Protocol), including:

- **Cursor** - AI coding assistant built on VS Code
- **WindSurf** - AI coding tool by Tencent Cloud
- **CodeBuddy** - AI coding assistant
- **Visual Studio Code** - via the CodeBuddy extension
- **Claude Code** - Anthropic's AI coding environment
- **GitHub Copilot** - MCP-capable versions
- **Other MCP-capable AI IDEs**

One install, and you can switch between AI IDEs without reconfiguring anything.

- Working setup in CodeBuddy
![](https://qcloudimg.tencent-cloud.cn/raw/3ad6cefbfee790ad3b42eea0cdb752cb.png)

- CloudBase MCP configured via the CodeBuddy extension in Visual Studio Code
![](https://qcloudimg.tencent-cloud.cn/raw/b6e70f722768d4a844280102378358fe.png)

- Working setup in Cursor
![](https://qcloudimg.tencent-cloud.cn/raw/344fe2c5a96a3e19c6cafc2bcbe73f96.png)

### The MCP configuration doesn't take effect

1. Check that the config format is correct
2. Restart the AI IDE
3. Make sure the MCP service is enabled

### Safari can't complete the authorization login

If authorization fails in Safari, switch to Chrome and sign in there.

Safari has compatibility issues in some cases that break the authorization flow. Chrome handles the CloudBase authorization flow better.

---

### How do I use MCP in a remote dev environment or on a server?

#### The problems

Running the CloudBase AI ToolKit in a remote environment, have you hit these?

- **No browser auth** - the server has no GUI, so browser login is impossible
- **Isolated environment** - the remote environment cannot reach your local browser for authorization
- **Automated deployment** - CI/CD pipelines need a non-interactive setup
- **Permission control** - you need fine-grained access to CloudBase resources

#### The fix: environment variables

CloudBase AI CLI supports browser-free authorization via environment variables, which is exactly what remote environments need.

#### Install CloudBase AI CLI

```bash
npm install @cloudbase/cli@latest -g
```

This creates the global `cloudbase-mcp` command.

**Option 1: CloudBase API Key (recommended)**

An API Key is a long-lived environment-level credential. MCP exchanges it for temporary keys automatically and refreshes them before expiry — nothing to manage by hand:

```json
{
  "mcpServers": {
    "cloudbase": {
      "command": "cloudbase-mcp",
      "env": {
        "CLOUDBASE_API_KEY": "your CloudBase API Key",
        "CLOUDBASE_ENV_ID": "your CloudBase environment ID"
      }
    }
  }
}
```

> 💡 Create and manage API Keys in the environment settings of the [CloudBase console](https://tcb.cloud.tencent.com/dev). The SDK-style `CLOUDBASE_APIKEY` (no underscore) also works; when both are set, `CLOUDBASE_API_KEY` wins.

**Option 2: Tencent Cloud API keys**

Pass the credentials through the `env` block of the MCP config:

```json
{
  "mcpServers": {
    "cloudbase": {
      "command": "cloudbase-mcp",
      "args": ["--integration-ide", "YOUR_IDE"],
      "env": {
        "TENCENTCLOUD_SECRETID": "your Tencent Cloud SecretId",
        "TENCENTCLOUD_SECRETKEY": "your Tencent Cloud SecretKey",
        "TENCENTCLOUD_SESSIONTOKEN": "only needed when using temporary keys",
        "CLOUDBASE_ENV_ID": "your CloudBase environment ID"
      }
    }
  }
}
```

**Where to get the keys:**
- Tencent Cloud SecretId / SecretKey: [CAM console](https://console.cloud.tencent.com/cam/capi)
- CloudBase environment ID: the Overview page of the [CloudBase console](https://tcb.cloud.tencent.com/dev)

This setup fits:
- Remote dev environments (GitHub Codespaces, cloud IDEs, etc.)
- Server-side automation scripts
- Automated deployment in CI/CD pipelines

> **Security note**: if you deploy MCP on a remote server and expose it over HTTP (rather than local use only), **always set `CLOUDBASE_MCP_CLOUD_MODE=true`**. It automatically disables tools that read/write local files or start processes, such as `manageCloudRun` (local run) and `manageApps` (local code upload), so remote callers cannot touch the server's local resources. See the "Self-hosted deployment" section in [Connection Modes](connection-modes.mdx).

---

### Which app types are supported?

- **Web apps**: modern frontend + static hosting
- **WeChat Mini Programs**: the CloudBase Mini Program solution
- **Backend services**: cloud database + serverless functions + cloud hosting

---

### Any special tips for WeChat Mini Program development?

**Recommended workflow:**

1. **Create the CloudBase environment inside WeChat DevTools**
   - Enable it directly in WeChat DevTools so the Mini Program and the environment are bound correctly

2. **Pick [Mini Program / Official Account] when the AI IDE signs in**
   - On the Tencent Cloud CloudBase login page, choose [Mini Program / Official Account]
   - Sign in with your Mini Program, not your Tencent Cloud main account

This keeps permissions consistent and avoids environment misconfiguration.

---

### How do I use the CloudBase AI ToolKit with WeChat DevTools?

The CloudBase AI ToolKit pairs well with WeChat DevTools for a faster development loop.

#### Option 1: start in the AI IDE

If you already started a Mini Program project in an AI IDE (Cursor, WindSurf, CodeBuddy, etc.):

1. **Develop in the AI IDE**: write code and manage CloudBase resources with the CloudBase AI ToolKit
2. **Import into WeChat DevTools**: open the whole project folder in WeChat DevTools
3. **Live sync**: file changes in the AI IDE sync to WeChat DevTools in real time
4. **Build and preview**: build and preview inside WeChat DevTools
5. **Debug errors**: copy any build or runtime error back into the AI IDE for AI-assisted troubleshooting

**Benefits:**
- AI-assisted coding where it is strongest
- Native debugging of WeChat DevTools
- Live preview and on-device debugging
- The complete toolchain

#### Option 2: start in WeChat DevTools

If your Mini Program project already lives in WeChat DevTools:

1. **Open the project**: open the same project folder in your AI IDE
2. **Configure MCP**: set up the CloudBase MCP service per the docs
3. **Download the AI rules**: tell the AI "Download the CloudBase AI rules" to fetch the development rules
4. **Start AI development**: write code and manage CloudBase resources with the AI
5. **Preview in WeChat DevTools**: do live preview and debugging there

**How the work splits:**
- AI IDE: coding, cloud function development, database design, and so on
- WeChat DevTools: Mini Program preview, on-device debugging, performance profiling
- The two work together, each doing what it is best at

**Notes:**
- Make sure both tools open the same project folder
- Files sync automatically on save — nothing to do by hand
- Do the main development in the AI IDE and the final testing in WeChat DevTools

---

## Environment management

### How do I switch CloudBase environments?

```
Log out of CloudBase
Log in to CloudBase
```

### How do I switch Tencent Cloud accounts?

To switch to a different Tencent Cloud account:

1. **Clear the local login state**: tell the AI `Log out`
2. **Sign out in the browser**: sign out of the old Tencent Cloud account in your browser
3. **Sign in again**: tell the AI `Log in to CloudBase`

You are now on the new Tencent Cloud account.

### Logged in on the international site but can't see my environments?

Tencent CloudBase comes in a domestic site and an international site. Without an explicit site setting, everything defaults to the **domestic** site. If your environment lives on the international site, login lands on the domestic authorization page and your international environments never show up in the picker. Declare the site in the MCP config and sign in again:

```json
{
  "mcpServers": {
    "cloudbase": {
      "command": "npx",
      "args": ["@cloudbase/cloudbase-mcp@latest"],
      "env": {
        "TCB_SITE": "intl"
      }
    }
  }
}
```

For the other ways (the `--site intl` startup flag, specifying `site="intl"` in the conversation, project-level `.cloudbase/project.json`, or CloudBase CLI `tcb config set isIntl true`), see [Connection Modes - Site and Region](./connection-modes#site-region).

Credentials for the domestic and international sites are stored in separate slots and can coexist; switching sites does not require signing in again (see the next question).

### My domestic-site Singapore environment is treated as international?

The domestic site now supports the Singapore region (`ap-singapore`). Both sites offer that region, so setting only `TCB_REGION=ap-singapore` makes the MCP default to the **international** site (login redirects there and the NoSQL tools are skipped). Domestic-site Singapore users must set the site explicitly:

```json
{
  "mcpServers": {
    "cloudbase": {
      "command": "npx",
      "args": ["@cloudbase/cloudbase-mcp@latest"],
      "env": {
        "TCB_SITE": "domestic",
        "TCB_REGION": "ap-singapore"
      }
    }
  }
}
```

You can also create `.cloudbase/project.json` in the project root, and every session in that directory uses the right site automatically:

```json
{ "site": "domestic", "region": "ap-singapore", "envId": "your environment ID" }
```

**Remote mode**: nothing extra to declare. The remote service has no `site` parameter — the site is determined by the **domain**. Use the domestic address `tcb-api.cloud.tencent.com` and you are on the domestic site, even if the environment sits in `ap-singapore`:

```json
{
  "mcpServers": {
    "cloudbase": {
      "type": "http",
      "url": "https://tcb-api.cloud.tencent.com/mcp/v1?env_id=your environment ID"
    }
  }
}
```

> 💡 Clients that support OAuth can just use this URL; the browser walks you through authorization.
>
> ⚠️ Clients without OAuth support (or CI setups) need extra authorization headers, otherwise you get `403 Forbidden: Missing credentials`. See the header list in [Connection Modes · Authorization](/ai/cloudbase-ai-toolkit/connection-modes#remote-auth).

Self-hosted remote services (Cloud Mode / Docker CloudRun) keep using the server-side environment variable `TCB_SITE=domestic`.

### Can domestic and international credentials coexist?

Yes. MCP stores credentials in per-site slots (`credential.domestic` / `credential.intl`), so you can stay signed in to both sites and switch environments without signing in again. Legacy single-slot `auth.json` data is read as domestic-site credentials for compatibility and is upgraded to the slotted format on the first write.

### How do I check the current environment?

```
Show me the current CloudBase environment info
```

## Troubleshooting

### What if deployment fails?

Send the full error message to the AI:
```
There's an error. The message is: xxxx
```

### How do I debug a cloud function that misbehaves?

Let the AI check the logs and fix it:
```
The cloud function doesn't behave as required. The requirement is xxx. Check the logs and data, debug it, and fix it.
```



## Community

Questions or want to compare notes? Join our community!

### 🔥 WeChat community group

<div align="center">
<img src="https://7463-tcb-advanced-a656fc-1257967285.tcb.qcloud.la/mcp/toolkit-qrcode.png" width="200" alt="WeChat group QR code"/>
<br/>
<i>Scan to join the WeChat community group</i>
</div>

## Support

### How do I get help?

1. Read this FAQ
2. Product issues (environments, cloud functions, databases, cloud hosting, storage, payments, etc.) → [CloudBase community](https://cnb.cool/tencent/cloud/cloudbase/community/-/issues)
3. Issues with this toolkit (CloudBase MCP, skills, CLI) → [GitHub Issues](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/issues); use the CloudBase community if GitHub is unreachable
4. Join the WeChat community group for community support

### How do I join the community?

- Join the WeChat community group to share projects and swap experience
- Star the project on GitHub and open issues or PRs
- Follow the official docs for the latest features
