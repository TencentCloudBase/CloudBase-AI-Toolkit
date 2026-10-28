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
- Confirm severity and affected versions, and tell you whether we accept it. If it is a
  defect rather than a vulnerability, we say so and point you at the issue tracker.
- Ship a fix, then coordinate public disclosure with you. We ask for up to **90 days**
  from acknowledgement before public disclosure; we will agree on a shorter window when
  the fix lands sooner, and we will tell you if we need longer.
- Credit you in the release notes and the published advisory, unless you ask us not to.

## How We Judge a Report

We accept a report as a vulnerability when all three hold:

1. **Reachability** — the attacker gets there on a path a normal user walks: installed as
   documented, through a tool the server registers and documents.
2. **Attacker capability** — the value or state the attacker must control is one an
   attacker can realistically control.
3. **Impact** — which resource, which action, acting as whom.

Missing any one of the three makes it a defect. See *Defects That Are Not Vulnerabilities*.

## What to Report

The shapes below are the ones we see most often. The list is not exhaustive: a report that
does not match any of them but shows a real attack path is still worth sending.

- **Credential egress** — a live credential value sent to an endpoint that credential does
  not serve, or into a published artifact.
- **Permission bypass** — a tool doing what the credentials it was handed cannot do in
  the console.
- **Local execution flaws** — command injection or path traversal in a command the server
  runs itself, where the attacker chooses the input.
- **Supply chain** — a known vulnerability in a dependency, reachable under how we use it,
  with a fix available.
- **CI/CD injection** — an outside contributor reaching a credential CI should not hand a
  fork, or altering a release artifact.

## Defects That Are Not Vulnerabilities

A real defect with no attacker behind it goes to the issue tracker and still gets fixed.
It does not take an advisory number or a disclosure window. Examples: a plaintext secret
written to a local log file, a credential field returned by default when it could be
opt-in, a delete that reaches further than the tool's own documentation describes.

## What Is Out of Scope

This list is how we usually decide. Something that falls under one of these entries but
still shows concrete impact is worth sending; impact decides.

- **Whether a destructive action asks before it runs.** Elicitation is optional in the
  protocol; the client and its host decide when to put a question in front of a person.
- **Code a normal user cannot reach.** Not in `tools/list`, not in the docs, no caller in
  the repo, or reachable only through an undocumented export.
- **What the model does with data a tool returns.** Context boundaries, redaction and
  retention belong to the host that holds the model.
- **Prompt injection that leads a model to call a tool.** The server has no reliable way
  to tell the user's instruction from an attacker's.
- **Credentials used to their limit.** If a SecretId can delete an environment, the console
  granted that.
- **Dependency advisories with no reachable call path, or no upstream patch.** These
  usually go through Dependabot.
- Vulnerabilities in third-party services we integrate with.
- Anything that only works because the attacker already controls the user's machine,
  shell, or cloud account.
- Rate limiting, brute force, or missing headers on public endpoints, with no demonstrated
  impact.
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
- 确认严重程度和受影响版本，并告知是否受理。如果判定是缺陷而不是漏洞，我们会说明并指出
  该走普通 issue。
- 修复后与你协调公开时间。从确认收到起，我们请求最多 90 天的披露窗口；
  修复更早完成就提前公开，需要更久会提前告知。
- 在 release notes 和安全公告中致谢，除非你要求匿名。

## 我们怎么判断

三件事都成立，我们才按漏洞受理：

1. **能到达** —— 攻击者的路径是普通用户真会走的那条：按文档安装，通过 server 注册并
   有文档的工具进来。
2. **攻击者能力** —— 攻击者必须控制的值或状态，是他现实中能控制的。
3. **影响** —— 哪个资源、哪个动作、以谁的身份。

缺任何一条，就是缺陷。见下面的「是缺陷，不是漏洞」。

## 属于范围的漏洞

下面是常见的几类，不是穷举。不合其中任何一条、但能给出真实攻击路径的报告，一样可以发。

- **凭据外发** —— 真实有效的凭据值，被送到这个凭据本来不服务的端点，或进入公开发布的
  产物。
- **权限绕过** —— 工具做到了它拿到的凭据在控制台里做不到的事。
- **本地执行缺陷** —— server 自己执行、且输入由攻击者指定的命令注入和路径穿越。
- **供应链** —— 依赖上的已知漏洞在我们这种用法下能被打通，且有可用修复。
- **CI/CD 注入** —— 外部贡献者能拿到 CI 本不该给 fork 的凭据，或能改动发布产物。

## 是缺陷，不是漏洞

背后没有攻击者的真缺陷，走普通 issue，我们也会修，只是不占安全公告编号、不走披露窗口。
例如：明文密钥被写进本机日志、本可以改成按需返回的凭据字段默认就返回了、删除动作落到了
工具文档没写的对象上。

## 不属于范围

这份清单是我们通常的判断方式。落在其中某一条、但仍然有具体影响的报告，仍然可以发，
影响说了算。

- **破坏性操作执行前问不问人。** elicitation 在协议里是可选的，什么时候把问题摆到人面前
  由客户端和它的宿主决定。
- **普通用户到不了的代码。** 不在 `tools/list` 里、文档没写、仓内没有调用方，或者只有
  通过未文档化的导出才能触发。
- **模型拿到工具返回之后做的事。** 上下文边界、脱敏、留存，属于持有模型的那一端。
- **诱导模型调用某个工具的 prompt injection。** server 没有可靠办法分辨这是用户的指令
  还是攻击者的。
- **用户给的凭据被用满。** 一个 SecretId 能删环境，是控制台给它的权限。
- **没有可达调用路径、或上游还没有补丁的依赖告警。** 这类通常走 Dependabot。
- 我们所集成的第三方服务自身的漏洞。
- 只有在攻击者已经控制用户机器、shell 或云账号时才成立的场景。
- 公开端点的限流、爆破、缺少安全响应头，且未证明实际影响。
- 没有具体攻击路径的最佳实践建议。
- 扫描器产出、没有 PoC、未验证影响的报告。

## 支持的版本

我们只在最新发布版本上修复。更早的大版本不做回补；如果你在用旧版本，
请先在最新版本上确认问题可复现。
