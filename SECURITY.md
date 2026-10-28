# Security Policy

## Reporting a Vulnerability

Please **do not** open a public issue, discussion, or pull request that describes a
suspected vulnerability. Public disclosure before a fix is available puts every user
of this project at risk.

Pick the channel that matches your situation:

### 1. You have a GitHub account

Use GitHub's private vulnerability reporting:

**https://github.com/TencentCloudBase/CloudBase-AI-Toolkit/security/advisories/new**

This creates a private advisory visible only to you and the maintainers. It gives you a
tracking number, lets you review the patch before it ships, and supports a CVE request on
publication if the issue warrants one.

### 2. You do not have a GitHub account

Email the maintainer at **bookerzhao@tencent.com** with `CloudBase AI Toolkit` in the
subject line, and include enough detail for us to act without a round trip: affected
version, reproduction steps, and impact.

If you do not hear back within 5 business days, resubmit through GitHub's private
vulnerability reporting — that channel does not depend on one person's inbox.

## What We Will Do

- Acknowledge your report within **5 business days**.
- Confirm severity and affected versions, and tell you whether we accept it.
- Ship a fix, then coordinate public disclosure with you. We ask for up to **90 days**
  from acknowledgement before public disclosure; we will agree on a shorter window when
  the fix lands sooner, and we will tell you if we need longer.
- Credit you in the release notes and the published advisory, unless you ask us not to.

## What to Report

Anything that lets someone read, change, or delete a user's cloud resources without that
user's consent, that exposes their credentials, or that runs code they did not intend to
run — in the code we publish, the packages we ship, or the automation that builds them.

If you are unsure whether something is in scope, report it and let us decide.

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

1. **有 GitHub 账号** —— 使用 GitHub 私密漏洞报告：
   https://github.com/TencentCloudBase/CloudBase-AI-Toolkit/security/advisories/new
   你会有追踪编号，能在补丁发布前审阅修复，必要时可申请 CVE。
2. **没有 GitHub 账号，或 GitHub 不方便** —— 发邮件到 **bookerzhao@tencent.com**
   （项目维护者），标题注明 `CloudBase AI Toolkit`。请一次写清受影响版本、复现步骤和影响，
   减少来回确认。5 个工作日内没收到回复的话，请改用 GitHub 私密漏洞报告 ——
   那个渠道不依赖某一个人的邮箱。

## 我们的处理方式

- 5 个工作日内确认收到。
- 确认严重程度和受影响版本，并告知是否受理。
- 修复后与你协调公开时间。从确认收到起，我们请求最多 90 天的披露窗口；
  修复更早完成就提前公开，需要更久会提前告知。
- 在 release notes 和安全公告中致谢，除非你要求匿名。

## 属于范围的漏洞

凡是能让别人在你未同意的情况下读写、删除你的云资源，能拿到你的凭据，或能在你没打算
执行的地方跑起代码的问题，都算 —— 无论是我们发布的代码、发布的包，还是构建它们的自动化。

拿不准是否属于范围，直接报，由我们判断。

## 不属于范围

- 我们所集成的第三方服务自身的漏洞，请上报给对应上游。
- 需要攻击者已经控制用户机器、shell 或云账号才能成立的场景。
- 公开端点的限流、爆破、缺少安全响应头，且未证明实际影响。
- 没有具体攻击路径的最佳实践建议。
- 扫描器产出、没有 PoC、未验证影响的报告。

## 支持的版本

我们只在最新发布版本上修复。更早的大版本不做回补；如果你在用旧版本，
请先在最新版本上确认问题可复现。
