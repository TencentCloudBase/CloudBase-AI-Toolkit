# Security Policy

## Reporting a Vulnerability

Please **do not** open a public issue, discussion, or pull request that describes a
suspected vulnerability. Public disclosure before a fix is available puts every user
of this project at risk.

Pick the channel that matches your situation:

### 1. You want a TSRC reward

CloudBase is in scope for the Tencent Security Response Center (TSRC) bounty program.
Submit through TSRC first:

**https://security.tencent.com/index.php/report/add**

Reward eligibility requires that the issue has not been publicly disclosed and has not
been reported to another organization first. If you report through TSRC, please **do not
also open a GitHub advisory** for the same finding — we treat the TSRC ticket as the
single source of truth and will coordinate the fix there.

### 2. You want this fixed, and you have a GitHub account

Use GitHub's private vulnerability reporting:

**https://github.com/TencentCloudBase/CloudBase-AI-Toolkit/security/advisories/new**

This creates a private advisory visible only to you and the maintainers. It gives you a
tracking number, lets you review the patch before it ships, and supports a CVE request on
publication if the issue warrants one. There is no monetary reward on this channel.

### 3. Neither works for you

Email the maintainer at **bookerzhao@tencent.com**, or the shared Tencent security
mailbox at **security@tencent.com**. Put `CloudBase AI Toolkit` in the subject line, and
include enough detail to route it without a round trip: affected version, reproduction
steps, and impact.

## What We Will Do

- Acknowledge your report within **5 business days**.
- Confirm severity and affected versions, and tell you whether we accept it.
- Ship a fix, then coordinate public disclosure with you. We ask for up to **90 days**
  from acknowledgement before public disclosure; we will agree on a shorter window when
  the fix lands sooner, and we will tell you if we need longer.
- Credit you in the release notes and the published advisory, unless you ask us not to.

## What to Report

This project ships an MCP server, a set of skills, and IDE configuration that run on the
user's own machine and act with the user's cloud credentials. Findings we care about:

- **Credential exposure** — tokens, API keys, or secrets leaked into the repository,
  published packages, logs, or telemetry.
- **Unconfirmed destructive or billable actions** — an MCP tool that deletes resources,
  changes billing, or performs an irreversible operation without the user confirming it.
- **Permission bypass** — a tool that reads or writes resources outside the caller's
  identity, or that escalates beyond the credentials it was given.
- **Local execution flaws** — command injection, path traversal, or privilege escalation
  in the local MCP server or in a generated command.
- **Supply chain** — a compromised dependency, a malicious package reachable through our
  lockfile, or tampering with release artifacts.
- **CI/CD injection** — a way to execute code or alter published output through our
  workflows.

## What Is Out of Scope

- Vulnerabilities in third-party services we integrate with. Report those upstream.
- Anything that requires the attacker to already control the user's machine, shell, or
  cloud account.
- Rate limiting, brute force, or missing headers on public endpoints, when there is no
  demonstrated impact.
- Best-practice suggestions with no concrete attack path ("this header should be set",
  "consider using a stronger cipher").
- Reports produced by a scanner with no proof of concept and no verified impact.

## Supported Versions

We ship fixes on the latest published version. Older major versions do not receive
backports; if you are on an older release, please confirm the issue reproduces on the
latest version before reporting.

---

# 安全策略（中文）

**请不要通过公开 issue 报告安全问题。** 修复发布前公开细节，会把这个项目的所有使用者
置于风险中。

## 报告渠道

1. **想获得 TSRC 奖励** —— CloudBase 在腾讯安全应急响应中心（TSRC）的收录范围内，
   请优先通过 https://security.tencent.com/index.php/report/add 提交。奖励要求该问题
   未公开披露、且未先报告给其他组织；走了 TSRC 就不要再为同一个问题开 GitHub 安全公告，
   我们以 TSRC 工单为准。此渠道有奖金。
2. **只想让问题被修掉，且有 GitHub 账号** —— 使用 GitHub 私密漏洞报告：
   https://github.com/TencentCloudBase/CloudBase-AI-Toolkit/security/advisories/new
   你会有追踪编号，能在补丁发布前审阅修复，必要时可申请 CVE。此渠道没有奖金。
3. **以上都不方便** —— 发邮件到 **bookerzhao@tencent.com**（项目维护者），或
   **security@tencent.com**（腾讯安全团队共享邮箱），标题注明 `CloudBase AI Toolkit`。
   请一次写清受影响版本、复现步骤和影响，减少来回确认。

## 我们的处理方式

- 5 个工作日内确认收到。
- 确认严重程度和受影响版本，并告知是否受理。
- 修复后与你协调公开时间。从确认收到起，我们请求最多 90 天的披露窗口；
  修复更早完成就提前公开，需要更久会提前告知。
- 在 release notes 和安全公告中致谢，除非你要求匿名。

## 属于范围的漏洞

本项目交付的是运行在用户本机、以用户云凭据执行操作的 MCP server、skills 与 IDE 配置。
我们关注：

- **凭据泄漏** —— 令牌、API Key、密钥出现在仓库、发布包、日志或遥测数据中。
- **未确认的破坏性/计费操作** —— MCP 工具在未经用户确认的情况下删除资源、变更计费
  或执行不可逆操作。
- **权限绕过** —— 工具读写调用者身份之外的资源，或超出所获凭据的权限。
- **本地执行缺陷** —— 本地 MCP server 或生成的命令中的命令注入、路径穿越、提权。
- **供应链** —— 依赖被投毒、lockfile 可解析到恶意包、发布产物被篡改。
- **CI/CD 注入** —— 通过我们的 workflow 执行代码或篡改发布内容。

## 不属于范围

- 我们所集成的第三方服务自身的漏洞，请上报给对应上游。
- 需要攻击者已经控制用户机器、shell 或云账号才能成立的场景。
- 公开端点的限流、爆破、缺少安全响应头，且未证明实际影响。
- 没有具体攻击路径的最佳实践建议。
- 扫描器产出、没有 PoC、未验证影响的报告。

## 支持的版本

我们只在最新发布版本上修复。更早的大版本不做回补；如果你在用旧版本，
请先在最新版本上确认问题可复现。
