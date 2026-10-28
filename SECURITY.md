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
  defect rather than a vulnerability, we say so and explain the reasoning, and point you
  at the issue tracker.
- Ship a fix, then coordinate public disclosure with you. We ask for up to **90 days**
  from acknowledgement before public disclosure; we will agree on a shorter window when
  the fix lands sooner, and we will tell you if we need longer.
- Credit you in the release notes and the published advisory, unless you ask us not to.

## How We Judge a Report

This project ships an MCP server, a set of skills, and IDE configuration that run on the
user's own machine and act with the user's cloud credentials. That shape decides what a
real vulnerability looks like here.

We accept a report when all three hold:

1. **Reachability** — the attacker gets there on a path a normal user walks: installed as
   documented, through a tool the server registers and documents.
2. **Attacker capability** — what has to be controlled is something an attacker can
   realistically control. A value the user typed, or one the model produced on the user's
   instruction, is not attacker input.
3. **Impact** — what they gain, concretely: which resource, which action, acting as whom.

A report missing any of the three describes a defect, not a vulnerability. We still want
it. See *Defects That Are Not Vulnerabilities* below.

## What to Report

- **Credential egress** — a live credential value that our code sends to an endpoint it
  does not serve, or into a published artifact. Test fixtures, example values, and the
  cloud API the credential exists for do not count.
- **Permission bypass** — a tool doing what the credentials it was handed cannot do in
  the console. Using those credentials to their limit does not count, and neither does a
  tool holding broader credentials than its function needs; that is security debt.
- **Local execution flaws** — command injection or path traversal in a command the
  server runs itself, where the attacker chooses the input. A command generated for the
  user to paste does not count, nor does a write outside a documented directory whose
  path the attacker cannot choose.
- **Supply chain** — a known vulnerability in a dependency that is reachable under how we
  use it, with a fix available. A CVE number without a call path does not count, and
  neither does one with no upstream patch.
- **CI/CD injection** — an outside contributor reaching a credential CI should not hand
  a fork, or altering a release artifact. Running test code in PR CI is by design.

## Defects That Are Not Vulnerabilities

Some reports describe a real defect with no attacker behind it: a plaintext secret
written to a local log file, a credential field returned by default when it could be
opt-in, a delete that reaches further than the tool's own documentation describes, a
template that fails on Windows. Send those through the normal issue tracker.

We fix them. They simply do not get an advisory number or a disclosure window, and we
would rather spend that process on something an attacker can reach.

## What Is Out of Scope

- **Whether a destructive action asks before it runs.** That depends on the client:
  elicitation is optional in the protocol, and the host decides when to put a question in
  front of a person. We ask where a client can render the question, and treat a client
  that answers for itself in milliseconds as nobody having looked. A policy cannot turn an
  optional capability into a guarantee.
- **Code a normal user cannot reach.** Not registered in `tools/list`, not described in
  the docs, no caller in the repo, or reachable only by importing an undocumented export.
  Tell us the path a documented, normally installed setup walks and we will reopen the
  question.
- **What the model does with data a tool returns.** Context boundaries, redaction, and
  retention belong to the host that holds the model, not to the server that returned the
  value. The same applies to prompt injection that leads a model to call a tool: the
  server cannot tell the user's instruction from an attacker's.
- **Credentials the user supplied, used to their full extent.** If a SecretId can delete
  an environment, that is what the console granted it, not something the tool escalated.
- **Dependency advisories with no reachable call path, or with no upstream patch.** These
  are tracked through Dependabot. Reachability and a fix both have to exist before there
  is anything for us to ship.
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
- 确认严重程度和受影响版本，并告知是否受理。如果判定是缺陷而不是漏洞，我们会说明理由，
  并告诉你该走普通 issue。
- 修复后与你协调公开时间。从确认收到起，我们请求最多 90 天的披露窗口；
  修复更早完成就提前公开，需要更久会提前告知。
- 在 release notes 和安全公告中致谢，除非你要求匿名。

## 我们怎么判断

本项目交付的是运行在用户本机、以用户云凭据执行操作的 MCP server、skills 与 IDE 配置。
这个形态决定了什么算真正的漏洞。

三件事都成立，我们才按漏洞受理：

1. **能到达** —— 攻击者的路径是普通用户真会走的那条：按文档安装，通过 server 注册并
   有文档的工具进来。
2. **攻击者能力** —— 需要被控制的东西，是攻击者现实中能控制的。用户自己输入的、或模型
   按用户要求产出的值，不算攻击者输入。
3. **影响** —— 具体拿到什么：哪个资源、哪个动作、以谁的身份。

缺任何一条，我们视为缺陷，不是漏洞。这类报告我们照样要，见下面的「是缺陷，不是漏洞」。

## 属于范围的漏洞

- **凭据外发** —— 真实有效的凭据值，被我们的代码送到它本来不服务的端点，或进入公开
  发布的产物。测试用的假凭据、示例值、以及本来就该发给云 API 的凭据，不算。
- **权限绕过** —— 工具做到了它拿到的凭据在控制台里做不到的事。把凭据用到上限不算；
  工具持有比功能更大的权限也不算，那算安全债。
- **本地执行缺陷** —— server 自己执行、且路径或参数由攻击者指定的命令注入和路径穿越。
  生成给用户自己粘贴执行的命令不算；写到文档声明目录之外但路径不可控，也不算。
- **供应链** —— 依赖上的已知漏洞在我们这种用法下能被打通，且有可用修复。只给 CVE
  编号、不给可达路径的不算；上游还没补丁的也不算。
- **CI/CD 注入** —— 外部贡献者能拿到 CI 本不该给 fork 的凭据，或能改动发布产物。
  在 PR CI 里跑测试代码是设计如此。

## 是缺陷，不是漏洞

有些报告描述的是真缺陷，但背后没有攻击者：明文密钥被写进本机日志、本可以改成按需返回
的凭据字段默认就返回了、删除动作落到了工具文档没写的对象上、某个模板在 Windows 上失败。
这类请走普通 issue。

我们会修。只是它不占安全公告编号、不走披露窗口，那套流程我们更愿意留给攻击者真能到达
的问题。

## 不属于范围

- **破坏性操作执不执行前先问人。** 这取决于客户端：elicitation 在协议里是可选的，什么
  时候把问题摆到人面前由宿主决定。客户端能渲染确认框的时候我们会问，客户端自己代答的
  时候我们按「没人看过」处理。一项可选能力没法被策略变成保证。
- **普通用户到不了的代码。** 不在 `tools/list` 里、文档没写、仓内没有调用方，或者只有
  导入未文档化的导出才能触发。请指出按文档正常安装后怎么走到这条路径，我们会重新评估。
- **模型拿到工具返回之后做的事。** 上下文边界、脱敏、留存，属于持有模型的那一端，不
  属于返回值的那一端。诱导模型调用某个工具的 prompt injection 同理：server 分辨不出这
  是用户的指令还是攻击者的。
- **用户给的凭据被用满。** 一个 SecretId 能删环境，是控制台给它的权限，不是工具提权。
- **没有可达调用路径、或上游还没有补丁的依赖告警。** 这类由 Dependabot 跟踪。可达性和
  可用的修复都成立，才有我们能发的东西。
- 我们所集成的第三方服务自身的漏洞，请上报给对应上游。
- 需要攻击者已经控制用户机器、shell 或云账号才能成立的场景。
- 公开端点的限流、爆破、缺少安全响应头，且未证明实际影响。
- 没有具体攻击路径的最佳实践建议。
- 扫描器产出、没有 PoC、未验证影响的报告。

## 支持的版本

我们只在最新发布版本上修复。更早的大版本不做回补；如果你在用旧版本，
请先在最新版本上确认问题可复现。
