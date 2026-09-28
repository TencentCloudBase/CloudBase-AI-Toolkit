# 贡献一篇 cloud API recipe

面向：想往 `cloud-api-operations` 增补 recipe 的人，以及替他们干活的 Agent。

仓库通用流程（环境安装、提交规范、分支模型、问题反馈）见根目录 `CONTRIBUTING.md`；编写规范与准入判据见 `../SKILL.md`。本篇只写 recipe 特有的部分。

## 第 1 步：过准入，再动笔

最关键的一次自检：

> 拿目标的 **Action 名**去公开 API 概览 / 官方接口文档搜一次。**0 命中就停手**。
> 「官方 SDK 文档里写全了」「本地能跑通」都不算数 —— **SDK 文档公开 ≠ Action 公开**。

不合格的能力**不要提 recipe PR**，改成开 Issue 说明：

| 情况 | Issue 里写什么 |
| --- | --- |
| 只在控制台可见，没有公开 API | 这是产品缺口：要让 AI 能操作，先得有公开 API |
| 只有某个语言的 SDK 封装，没有公开 Action | 点名缺哪条语言无关通路（云 API 直调 / CLI / MCP） |
| 读概览 + 单接口文档即可直接调，或已被 `query*` / `manage*` 工具覆盖 | 不需要 recipe，不用提 PR，说明即可 |

> 仓库维护者另有一条归档路径（`specs/`，不进版本控制）；外部贡献者走上面的 Issue 即可。

## 第 2 步：改哪些文件

| 动作 | 路径 |
| --- | --- |
| 新增 recipe | `config/source/skills/cloud-api-operations/references/recipes/<场景名>.md` |
| 登记目录表 | 同目录 `README.md` 的 `## 目录` 表加一行：序号 / 场景名 / 链接 / 状态 |
| 生成产物 | 由下方脚本产出，**不要手写**：`doc/prompts/**`、`doc/components/prompts.json`、`doc/sidebar.json`、`config/.claude/skills/**` |

recipe 结构固定五节 —— `When to use → 前置权限 → 接口序列 → 踩坑清单 → 验证步骤`（入口特殊才加第六节）。写作规则、文案红线、状态标注要求都在 `../SKILL.md`。

`前置权限` 一节要能**直接交付**给用户：写清用哪种凭据身份、需要哪个角色的哪几个策略，并给出可点击的一键授权链接（拼法与角色载体的读法见 `../SKILL.md` 的权限模型一节）。

## 第 3 步：三层自测（结果贴进 PR）

### 3.1 机器校验（必须全过）

```bash
pnpm install --frozen-lockfile

node scripts/generate-prompts-data.mjs && node scripts/generate-prompts.mjs
node scripts/sync-claude-skills-mirror.mjs
node scripts/build-compat-config.mjs

node scripts/diff-compat-config.mjs      # 期望：Has blocking diff: NO
pnpm run check:prompts-sync
```

- **新增文件会让兼容面 diff 报 blocking**（「多出」也算阻断）。这种 existence 级变更要**全量**刷新：`node scripts/update-compat-baseline.mjs`（补新 key 只有全量能做）。
- 只是**改了已有 md 的内容**：用 `node scripts/update-compat-baseline.mjs --only <你的 skill 目录名>` 定向刷新 —— 只更新路径含该子串的条目，保持别人的存量漂移不动（全量刷新会把它们一起洗白，报告就失真了）。
- 刷新后 `config/source/editor-config/compat-baseline.json` 要一起提交。
- 脚本产出的**已跟踪文件**要一起提交：`doc/prompts/**`、`doc/components/prompts.json`、`doc/sidebar.json`、`config/.claude/skills/**`、compat baseline。`.generated/**` 不入版本控制。
- `main` 上另有 workflow 兜底同步镜像，本地先跑一遍可省掉一次往返。

### 3.2 端到端实跑（必须）

在真实环境把「接口序列」按原样走一遍：只读场景跑到拿到目标数据，写操作跑到「验证步骤」全部通过。把每步的关键返回值或日志片段贴进 PR。

没条件跑通的：状态只能标 `🟡 文档核对，未实跑`，并在 PR 里写明哪些步骤没跑、缺什么前置。

### 3.3 多模型冷启动（与维护者一起做，合并前必过）

目的：证明**不是只有作者能跑通** —— recipe 的价值就在于别人（以及别的模型）照着能做出来。

- 选 **≥2 个不同来源的模型**（至少一个偏小/偏弱的），每个模型**只给这篇 recipe + 一句待办**，不给额外提示、不给作者的上下文
- 逐个记录：是否跑通；没跑通卡在哪一步、原因是「文档没说清」还是「模型能力不够」
- 判断：**多数模型卡在同一处 → recipe 缺信息**，补进对应节后重跑；只有弱模型卡 → 在 `When to use` 或踩坑清单里写清适用边界
- 结果写进 PR 描述，维护者复核；合并后由维护者登记目录表的「状态」列

交给模型的东西只有两件：**这篇 recipe 的源文件路径**，和**一句业务目标的待办**（例如「核对某环境的当前配置，并给出把它调整到 X 的方案」）。不要把 recipe 正文粘进提示词，也不要补充作者的说明 —— 那样测的是你的讲解水平，不是 recipe 能不能独立成立。

两条容易踩的：

- **先确认工作区在含这篇 recipe 的分支上。** 若 recipe 还没合进主分支、而工作区停在主分支，模型找不到源文件就会退回去读生成目录里的副本，还会顺带报告「源目录缺这篇文件」—— 那是环境错位带来的噪声，会把结果带偏。发现模型报「文件不存在」时，先查这个，别急着改 recipe。
- **待办里限定只读，或写明「给方案、不要执行」。** recipe 覆盖的往往是真实环境的写操作，冷启动不该在谁的账号上真的改配置。这层验证的是「照着能不能走对」，不是「敢不敢下手」。

## PR 描述模板

```text
场景：<一句话，出现什么症状该用>

Action：<service> · <version> · <Action 名，逐个列出>

准入自检：<目标 Action 名在公开概览的命中结果>

权限：<需要的服务角色 + 策略名；一键授权链接可直接点击>

自测：
- 机器校验：<compat-diff / prompts-sync 结果>
- 端到端：<环境类型 + 跑到哪一步 + 关键返回值>
- 多模型：<用了哪些模型 + 结果 + 卡点>

不确定的地方：<没有就写"无">
```

## 评审会看什么

- 只动了 `config/source/skills/**` 与本篇要求的生成产物，没有手改 `.generated/**`
- 准入自检对得上：目标 Action 在公开概览里查得到
- recipe 正文只写使用者照着做什么 —— 没有出处叙述、验证过程、维护者待办、内部标识（AppId / Uin / 内部环境名）
- `前置权限` 给的是「角色名 + 策略名 + 可点击链接」，不是"去控制台加策略"
- 三层自测结果齐全，多模型冷启动通过
