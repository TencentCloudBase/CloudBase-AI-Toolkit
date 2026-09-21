---
name: cloud-api-recipe-authoring
description: "Author or revise a cloud-api-operations recipe (config/source/skills/cloud-api-operations/references/recipes/). Encodes why the long tail of control-plane capabilities is deliberately NOT wrapped as MCP/CLI tools, the API-first admission test for whether a capability deserves a recipe, the negative and positive lists, the fixed recipe structure, the writing rules distilled from writing-for-agents, the user-facing copy red lines, and the product regeneration/verification pipeline. Also routes contributors (and their agents) to the contribution flow and the pre-PR self-test protocol in references/contributing.md. Use when adding a recipe, judging whether a scenario belongs in the recipe set, updating the recipes index, re-checking existing recipes against the admission test, or onboarding someone who wants to submit one."
alwaysApply: false
---

# Cloud API Recipe Authoring

目标：让**「AI 可以 100% 操作云开发」**可验证 —— 每个高频管控面场景都有一篇能照着跑通的 recipe，且每篇都建立在**公开 API** 之上。

## When to use

- 新增一篇 recipe，或修改现有一篇
- 判断某个能力**该不该**进 recipe 集（准入）
- 更新 `config/source/skills/cloud-api-operations/references/recipes/README.md` 的目录表与状态列
- 复核已有 recipe 是否仍满足准入（Action 是否已公开、是否已被专用 MCP 工具覆盖）
- 有人（或他的 Agent）要提交一篇 recipe —— 把 `./references/contributing.md` 给他

## 为什么不全部封装进 MCP / CLI（分工原则）

产品排期里「对外开放 API」通常不优先，于是有一个固定落差：**控制台上了功能，AI 却操作不了**。因果链是单向的 —— 没有公开 API，CLI / MCP 就无从封装，AI 只能用鼠标。

补齐落差有两条路，我们不走「全都封装」那条：

| 做法 | 代价 |
| --- | --- |
| 把能力都补成 API、再全部封装成工具 | 工具面持续膨胀：模型选错工具的概率上升，工具描述吃掉上下文预算，每个工具都要跟 API 变更一起维护 |
| **只封装核心，长尾走 recipe** | 要多维护一份文档，但工具面稳定，长尾能力照样能被 AI 操作 |

**核心能力已经封装过了**（`query*` / `manage*` 工具家族 + CLI），剩下的大量接口**不需要**封装。一个能力该去哪：

| 能力形态 | 归属 |
| --- | --- |
| 有公开 API + 高频核心 | 已在 MCP / CLI 工具里 —— 直接用，不要另写 recipe |
| 有公开 API + 长尾（串联多 Action、有非平凡前置、有踩坑或回查义务） | **写 recipe**（本 skill） |
| 有公开 API + 单接口、读文档即可调 | 既不封装也不写 recipe —— agent 现场查索引 |
| **没有公开 API**（只在控制台可见） | 谁也封装不了 —— **产品缺口**，推产品先开放 API；这里也没有 recipe 可写 |

最后一行是硬约束：**没有公开 API，能力对 AI 的可用性就是 0**，这不是「我们封装得不够」的问题。

## 准入：API first（硬门槛，先过这一关再动笔）

三条必须同时满足：

1. **有公开云 API**：目标 Action 已列入公开 API 概览 / 接口文档（`https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/api-reference.md` 或产品官方文档）。
2. **语言无关可调用**：云 API 直调 / 官方 SDK / CLI / MCP 任一条通路都行 —— 但必须是**公开 API 的封装**，不能反过来「只有某个语言的 SDK 封装、没有公开 Action」。
3. **写操作能由使用者独立完成**：含签名、必要的前置查询与加解密。若关键步骤依赖客户端拿不到的内部配置，就不合格。

不满足时的处理：

- **不要**写进 `config/source/skills/`（那是对外发布面）
- 同时当**产品缺口**反馈：请官方把这些 Action 列入公开概览，或给出语言无关的调用路径
- 归档：维护者放 `specs/cloud-api-skill/pending-recipes/`（内部目录，不进版本控制），正文顶部写清「为什么未通过 + 解封条件」；外部贡献者不提 PR，按 `./references/contributing.md` 开 Issue 说明

踩过的实例见下文「反面 case」—— 驳回后不进公开集，也不要把归档内容抄回来。

## 负向清单（不该写 recipe）

- 读公开 API 概览 + 单个接口文档就能直接调的（单个 Action、参数可查、无需串联）→ 让 agent 走 `SKILL.md §1` 的发现流程现场查
- 已有专用 MCP 工具覆盖的（`query*` / `manage*` 家族）→ 路由到工具，不写文档
- 纯参数含义 / 概念说明 → 属于官方文档，路由过去
- 只对某个 SDK 语言成立的用法（除该 SDK 外没有语言无关通路）

## 正向清单（必须写 recipe）

- 需要**串联多个 Action 或多个产品**（例：monitor 策略族 + postgres `DescribeDBInstances`）
- 有**非平凡前置**：CAM 授权升级、临时密钥、环境绑定、签名或加密
- 有**实测踩坑**：报错信息 → 正确做法，靠读文档推不出来
- 调用后有**回查 / 清理义务**：幂等查重、解绑、残留维度清理

## 反面 case（准入驳回长什么样）

**集成中心 UserKey 密钥对管理** —— 全文在内部归档 `specs/cloud-api-skill/pending-recipes/integration-userkey.md`（不进版本控制，外部读者看不到内容，按下文「驳回后归档页写三样」自行落笔）。

它当时**过了正向清单的两条**：有非平凡前置（password 字段加密）、有实测踩坑（脱离 SDK 会明文落库）。但三条硬门槛一条都不过：

| 硬门槛 | 实际 |
| --- | --- |
| 有公开云 API | 6 个 Action（`GetUserKeyList` / `CreateUserKey` / …）在公开概览 **0 命中** |
| 语言无关可调用 | 唯一通路是 `@cloudbase/manager-node` 的封装；Python / Go / Java 用户没有对应入口 |
| 写操作能独立完成 | password 的加密密钥由 SDK 内部从七彩石取（`QueryRainbowConfig`），公开面没有入口 → 裸调云 API 无法加密，写路径走不通 |

**要记住的是漏判机制，不是这条结论**：把「官方 SDK 文档里写全了、本地跑得通」当成了「能力在公开 API 契约内」。**SDK 文档公开 ≠ Action 公开**。

**写前自检**：动笔前拿目标 Action 名去公开概览 / 官方接口文档搜一次（入口见上文准入 §1）。0 命中就停手，不进公开集。

**驳回后归档页写三样**（照 `pending-recipes/` 那份抄）：① 为什么未通过，逐条对到上面三条门槛；② 解封条件——满足其一即可移回公开集；③ 显式禁止「复制回公开 skill」。

## 权限模型（维护者视角：这一步要不要预置掉）

使用者看到的是「点一下授权链接」；我们要判断的是**要不要让这一步消失**。三种处置：

| 处置 | 什么情况 | 怎么做 |
| --- | --- | --- |
| 预置进角色族 | 能力通用、高频、且在 TCB 产品语义内（TCR 拉镜像、CloudBase Run 访问 VPC/CVM 属这类） | 推产品给 `TCB_QcsRole` 挂预设策略，命名沿 `QcloudAccessForTCBRoleIn<X>` → 用户零操作 |
| 让用户按需追加 | 长尾能力、跨产品，或预设策略粒度太粗（`QcloudMonitorFullAccess` 是全读写） | 给一键授权链接，写进 recipe 的 `前置权限`。**默认走这条** —— 把大权限挂在默认角色上，等于替所有用户扩大默认授权范围 |
| 都不做 | 能力没有公开 API（准入驳回那一类） | 到此为止，不写 recipe 也不预置；当产品缺口反馈 |

判断顺序：先过准入（没有公开 API 就停），再看值不值得进角色族；两条都不过就只留一键授权链接。

**动笔预置前先做一次身份校验**：确认这条通路的凭据真的以该角色发起。`auth get_temp_credentials` 导出的是 Web / device 登录的**同一份**临时密钥（不是另起一次角色假定），所以只有用「权限收窄到刚好没这个 Action」的身份实测报出 `UnauthorizedOperation`，才能判定角色策略在这条通路上生效。判不出来就给一键授权链接、不预置。

一个已观察到的线索：账号级 device 登录的凭据能过 `cam:CreateRole`、`cdn:DescribeDomains`，而同一账号 `TCB_QcsRole` 的挂载策略里都没有这两条 —— 倾向说明它取的**不是**该角色。但这个结果用主账号登录也会得到，必须换窄权子账号复测才算数；没复测前，对外只写「按凭据身份判断」，不要对外断言 CLI / MCP 走角色。

**已落定的归属**（按能力族，不按产品）：

| 能力 | 处置 | 依据 |
| --- | --- | --- |
| 云开发自己的域名（静态托管、网关自定义域名的绑定 / 解绑 / 查任务） | 预置——已在角色族 | 走 `tcb:*` 与 `cdn:Tcb*`，属 TCB 产品语义内 |
| 证书只读（列证书 / 详情 / 校验链） | 预置——已在角色族 | 绑自定义域名要在证书列表里挑一张，是必要读权限 |
| 云监控告警族 | 预置——已在角色族 | 随基座策略下发 `monitor:*`，不单独挂 `QcloudMonitorFullAccess` |
| 通用 CDN 加速域名（`AddCdnDomain` 等） | 让用户按需追加 | 跨产品长尾；`QcloudCDNFullAccess` 粒度太粗 |
| DNS 解析（DNSPod） | 让用户按需追加 | 跨产品长尾：解析记录操作与云开发无产品语义绑定 |
| 证书写（申请 / 续期 / 删除 / 部署） | 让用户按需追加 | 同上；`QcloudSSLFullAccess` 是全读写，粒度偏粗 |

角色挂载策略会随产品迭代变动，上面这张表可能过期 —— **以 `ListAttachedRolePolicies` + `GetPolicy` 读到的实际策略内容为准**，不要拿历史结论当事实。

## 用到的 service 必须在 MCP 白名单里

recipe 里出现的 service 要能在 `callCloudApi` 直接调通。白名单是 `mcp/src/tools/capi.ts` 的 `SERVICE_VERSIONS`（枚举 + 官方版本映射）。写 recipe 时若发现目标产品不在表里，**先补表再写 recipe**：单版本产品写 `service: ["YYYY-MM-DD"]`，多版本产品把官方在用版本都列进数组（缺省时调用方必须显式传 version）。版本号取自官方 SDK 目录 `tencentcloud/<service>/v<YYYYMMDD>`，不要凭记忆填。

改完 `SERVICE_VERSIONS` 要同步**两处**再跑产物链：使用者侧的完整索引 `config/source/skills/cloud-api-operations/references/service-versions.md`（按产品线分组的分组表），以及 `references/calling-methods.md` §1 的「最常用的几个」小表（只在核心产品变动时动这张）。

链接拼法、角色载体读法、策略覆盖范围见对外 skill 的 `config/source/skills/cloud-api-operations/references/calling-methods.md` §3 —— 维护者视角的内容**只写在本 skill**（对外 skill 只写「怎么点一下授权」，不写这一节）。

## 动笔前先自己跑通一遍（实测口径）

准入过了不等于能写 —— 先拿真账号把**只读**路径跑通，再决定哪些进主序列、哪些进「踩坑清单」。

- **目标 service 不在 `SERVICE_VERSIONS` 时先补表**（`mcp/src/tools/capi.ts`），再重建本地产物：跑 `build:webpack`，**不要跑 `npm run build`** —— 它的 `prebuild = rm -rf dist` 会被 safe-delete 钩子拦下，整条链断在第一步。版本号取自官方接口文档页或 SDK 目录 `tencentcloud/<service>/v<YYYYMMDD>`，两处对得上才填。
- **`callCloudApi` 有环境绑定门禁**：账号级登录后首个调用仍会返回 `ENV_REQUIRED`（「已登录，但尚未绑定环境」）。先 `auth(set_env, envId=…)` 绑一个正常环境即可 —— 备案这类账号级业务与环境无关，绑定只是为了过门禁。
- **用 stdio 探针直接驱动本地 `mcp/dist/cli.cjs`**（`initialize` → `tools/call`），比挂进客户端快得多；本地 MCP 起法与探针脚本见 skill `cloudbase-mcp-local-probe`。
- **只跑 `Describe*` / `Check*` / `Validate*`**，写操作一律留给使用者手动执行。写路径如果必须靠订单流程内的参数才能发起，正好说明它不进主序列。
- **把「缺哪个必填参数」当成判据**，不是当成障碍：返回 `missing the required parameter Skey / IcpOrderID / Uin` 这类只能从内部流程拿到的参数，就等于宣告该接口无法独立使用 —— 它该写进「踩坑清单」的反面做法，而不是主序列。
- 跑完把每个 Action 的**真实返回形状**记下来（字段名、空值表现），主序列里「取什么」一列才有据可依；只读为空是正常结果，不能据此判断接口没通。

## 结构（固定五节，入口特殊才加第六节）

顺序固定：`When to use → 前置权限 → 接口序列 → 踩坑清单 → 验证步骤`（+ 可选 `入口`）。对外发布的是这套顺序本身，别增删标题。

| 节 | 写什么 | 完成条件（可判定） |
| --- | --- | --- |
| `When to use` | 出现什么症状就该翻这篇（可判定的触发条件，不是主题概括）；末尾一句划界：本篇不管什么、该转哪去 | 触发条件能对上用户手里的报错/现象 |
| `前置权限` | 需要的 service / version、凭据身份（账号级 / 环境级 / 服务角色）、需要哪几个 CAM 策略；能直接用的官方文档入口 | 权限不足时能直接给出一条**可点击的一键授权链接**（角色名 + 策略名 + `principal`），而不是"去 CAM 控制台追加策略" |
| `接口序列` | 最小可跑序列（代码块或步骤表），每步带返回要点；方法/参数只在**一处**写全 | 每步的返回值都能对应到下一步的入参；**表格每一步都带 service 列**（表头写 `service` 或 `service / version`），用到多个 service 时分节写、每节表头都要有该列 —— 漏掉这列，读者只能靠猜这一步是谁的 API |
| `踩坑清单` | 表格：坑 / 现象（贴真实报错原文）/ 正确做法 | 每行都能对上一条真实报错或可复现现象 |
| `验证步骤` | 调用后怎么自查（只读自检、写后回查、幂等查重） | 每条都有明确通过判据（字段有值 / 计数一致），不用「合理」这类词 |

## 写作规则（从 writing-for-agents 提取，逐条给落地方式）

| 杠杆 | 本仓库的落地 | 反例 |
| --- | --- | --- |
| 单一可信源 | 序列只在代码块或表里写一次；索引表不重复它的内容 | 同一序列「表里一遍、代码里一遍」 |
| context pointer | 标题与首句写**症状**，让 agent 能判断「要不要翻这篇」 | 标题写成主题词（「关于告警」） |
| 信息层级 + progressive disclosure | in-file step > in-file reference > disclosed reference：只有**某一支**才需要的细节，下沉到分支里或指向可查处，不要塞进主序列 | 把 AES/IV/base64 全套写进正文，而只有「脱离 SDK 自己实现加密」才用得到 |
| co-location | 相关的东西放同一节，少造标题 | 「因为这篇要解决什么」+「能力入口」两个标题讲同一件事 |
| 完成条件 | 每节给可判定判据；要求 legwork 就明说读什么 | 「`TotalCount` 合理」无法判定，会诱发提前收工 |
| leading word | 复用现成紧凑词，别自造 | 把「SDK 取不到密钥时静默明文写入」起名 **明文落库**，与「密文落库自检」构成同一词汇对 |
| 正面表述 | 写「改查 X」「走 Y」，别写一串「不要…」（禁用词会把行为拖进上下文） | 「不要猜 Action 名、不要用索引、不要…」 |
| 环境即真源 | 命令与路径写成能在当前环境直接执行的；能本地查到的不要缓存 | 缓存 `node_modules` 里就能读到的实现细节 |
| 剪枝 | 删 no-op、删沉渣、删与别处重复的内容 | 同一事实在 SKILL.md / README / recipe 三处各写一遍 |

## 文案红线（对外文件，使用者视角）

- **不写**：出处与验证过程（取自哪份文档/源码、比对过哪些版本、我们怎么核对的）、测试状态叙述、维护者待办
- **不写**：内部标识（AppId / Uin / 内部环境名 / 仓内路径）
- **「实测」是值级标记**：贴在具体参数、接口或返回值上，最多一个；**不要**给整节或整表贴「（全部实测）」——它没有逐行分辨率，后来补进的未验证内容会继承这个标签，正好让 AI 高置信采信未验证的东西
- **可信度只记一处**：`recipes/README.md` 目录表的「状态」列（`✅ 生产实证（日期）` / `🟡 文档核对，未实跑`），SKILL.md 条目与 recipe 正文都不重复
- 以上对外规则的权威副本在 `config/source/skills/cloud-api-operations/references/recipes/README.md`，改结构/红线时两处一起看

## 索引维护

- 新 recipe 登记到 `recipes/README.md` 目录表：序号 + 场景名 + 文档链接 + 状态
- **一个场景一篇**；一个 recipe 长到两段独立序列时按 invocation 或 sequence 拆分，而不是继续加节
- 暂不写独立 recipe 的场景，写进「没有独立 recipe 的场景」，并指明复用哪篇、换什么参数

## 贡献与自测（给外部贡献者）

要加一篇 recipe 的完整流程、PR 该写什么、以及提 PR 前必须做的三层自测（机器校验 / 端到端实跑 / 多模型冷启动）见 `./references/contributing.md`。

**从 raw 链接直接读本文件时**：相对路径接在 `https://raw.githubusercontent.com/TencentCloudBase/CloudBase-AI-Toolkit/main/` 之后即可取到对应文件。

## 产物链与校验（改完必跑）

```bash
export PATH=/usr/local/bin:$PATH   # 缺它 → git-lfs 钩子报错，&& 链会静默断掉
NODE=/Users/bookerzhao/.workbuddy/binaries/node/versions/22.22.2-3/bin/node
$NODE scripts/generate-prompts-data.mjs && $NODE scripts/generate-prompts.mjs
$NODE scripts/sync-claude-skills-mirror.mjs && $NODE scripts/build-compat-config.mjs
$NODE scripts/check-prompts-sync.mjs && $NODE scripts/sync-claude-skills-mirror.mjs --check
$NODE scripts/diff-compat-config.mjs     # Has blocking diff: NO
```

- **新增或删除**文本面都会让 compat-diff 报 blocking，必须刷 `config/source/editor-config/compat-baseline.json`
- 刷 baseline 用**定向合并**（只取目标 skill 的 key，其余保留已提交值，key 顺序以生成器为准）；整份 `npm run update:compat-baseline` 会把别人的历史漂移一起吞掉
- 校验完成前不要宣称改完：三项预检全过 + `git diff` 里非目标改动行为空

## 常见坑

- 中文核对**不要用 shell `grep`**：本会话实测会静默返回空且 exit 0（假阴性），用内置检索工具
- 授权指引必须落到「角色名 + 策略名 + 可点击链接」；写"去 CAM 控制台追加策略"等于把找路成本丢回用户
- 沙箱 PATH 不含 `/usr/local/bin`（git-lfs 在那里），`git checkout <file>` 会返回非零并断掉 `&&` 链
- 删除 recipe 时，除源文件与 `config/.claude/` 镜像，还要清掉 SKILL.md 与 README 里的引用，再跑产物链
