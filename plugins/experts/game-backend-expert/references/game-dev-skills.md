# 游戏开发相关的可取用 skill（引擎与玩法）

> 我的主场是**服务端 + 引擎接入层**，但游戏开发本身的问题我**不推走**：下面这些是官方与社区在维护的 skill，覆盖引擎 API、玩法手感、UI、关卡、性能、存档格式、引擎内联机、内购接入。**要用它们来答，别凭记忆写引擎代码**——引擎版本差异大，凭印象写必错。
>
> 找别的：`npx skills find <关键词>`（交互式），或在 <https://skills.sh/> 搜索。装：`npx skills add <repo> -y`，先 `-l` 看清单更稳。

## 一、引擎官方 / 准官方

| 来源 | 怎么装 | 覆盖 |
|---|---|---|
| **`unity-technologies/skills`（Unity 官方仓）** | `npx skills add unity-technologies/skills -y` | `unity-cli`（命令行驱动编辑器：编辑场景与资产、跑 C#、构建、测试、配 Unity MCP）、`unity-package-management`、`new-unity-project`、UI 三套（`ui-ugui` / `ui-uitk` / `ui-imgui`）、`2d-pixel-perfect`、`create-2d-physics`、`physics-3d-collision`、`shader-graph-create-custom-node`、`urp-postprocessing`、`optimize-web`、`optimize-audio`、`localization`、`build-live-game`、`setup-multiplayer-services`（会话 / 房间 / 匹配）、`setup-vivox-voice-chat`、`implement-in-app-purchases` |
| **`wshobson/agents`** → `plugins/game-development/skills/` | `npx skills add wshobson/agents -s godot-gdscript-patterns,unity-ecs-patterns -y` | Godot 4 GDScript 生产模式（信号、场景、状态机、优化）；Unity ECS 模式 |
| **`thedivergentai/game-dev-agentic-skills`** | `npx skills add thedivergentai/game-dev-agentic-skills -y` | 一批 `godot-*`：2D 动画与物理、3D 光照 / 材质 / 世界搭建、能力系统、2D↔3D 改造；另有 Bevy 系列 |
| **Cocos 侧** | `npx skills add zpqq132555/skills -s cocos-creator-v3 -y` | 目前公开的只有这类社区个人仓（`cocos-creator-v2` / `cocos-creator-v3`），安装量低、覆盖窄——**用前先读一遍确认与你的 Cocos 版本对得上**，宁可直接查官方文档 |

## 二、引擎无关的"学科 + 引擎 + 品类"集合

**`gamedev-skills/awesome-gamedev-agent-skills`**——一个仓分目录，先 `npx skills add gamedev-skills/awesome-gamedev-agent-skills -l` 看清单，再有选择地装：

- `skills/disciplines/`（学科，**引擎无关**）：`game-feel`（juice：屏幕抖动、命中停顿、缓动、挤压拉伸、击退、分层反馈）、`game-ui-ux`、`level-design`、`game-ai`（行为树 / 效用 AI）、`physics-tuning`、`performance-optimization`、`shader-programming`、`procedural-gen`、`camera-systems`、`input-systems`、`save-systems`、`audio-design`、`dialogue-systems`、`create-game-assets`
- `skills/godot/`：`godot-gdscript`、`godot-nodes-scenes`、`godot-signals-groups`、`godot-2d-movement`、`godot-physics`、`godot-shaders`、`godot-animation`、`godot-tilemap`、`godot-resources`、`godot-multiplayer`、`godot-export`、`godot-gdscript-headless-testing`、`godot-3d-essentials`、`godot-csharp`、`godot-audio`
- `skills/unity/`：`unity-csharp-scripting`、`unity-input-system`、`unity-physics`、`unity-navmesh`、`unity-animation`、`unity-scriptableobjects`、`unity-tilemap-2d`、`unity-build-pipeline`
- `skills/genres/`：`platformer`、`roguelike`、`rpg`、`fps-shooter`、`tower-defense`、`puzzle`、`card-game`、`survival-crafting`、`visual-novel`
- 还有 `router/SKILL.md`（按需求路由到上面某个学科）与 `skills/other-engines/`（Bevy / LÖVE / pygame / Roblox）

另有一个通用入口：**`jeffallan/claude-skills` → `game-developer`**（`npx skills add jeffallan/claude-skills -s game-developer -y`），偏 ECS 架构、物理与碰撞体、带延迟补偿的联机、帧率优化到 60+。

## 三、我读完后的几条要点（先看这里能省一轮）

**存档：本地那份归引擎侧 skill，云端那份归我。** `save-systems` 讲的是把状态序列化成普通数据（不是引擎对象）、**临时文件 + 重命名做原子写**（崩溃不坏档）、带版本号加载并迁移、存档槽 + 限流自动保存——这些是**本地文件**的做法。一旦要**跨设备**接着玩、要防改档，就是我这边的事：表 + RLS + 服务端时间戳 + 服务端迁移（见 playbook 第五节）。两边都要，职责不同。

**联机：引擎 API 在引擎侧 skill，服务端骨架在我这。** `godot-multiplayer` 讲 Godot 4 的 `ENetMultiplayerPeer`、`@rpc`、每节点权威、`MultiplayerSpawner` / `MultiplayerSynchronizer`；Unity 官方 `setup-multiplayer-services` 讲会话、房间、匹配，并明确"**不是后端功能**"。而**房间状态存哪、谁记分、断线怎么重连、跨服怎么路由**，是我给服务端骨架的部分。

**内购：引擎接入在引擎侧 skill，订单在我这。** Unity 官方 `implement-in-app-purchases` 讲初始化、拉商品、两步购买、恢复交易、**收据校验**、订阅与权益查询。我这边保证的是订单表 + 幂等键 + 退款落表 + **发货判定只在服务端**（playbook 第六节）：它解决"怎么把购买做出来"，我解决"重复回调不重复发货、退款对得上账"。

**手感 / UI / 关卡 / 性能是纯引擎侧**，但也别硬答：`game-feel` 里对抖动衰减曲线、命中停顿帧数、挤压拉伸与分层反馈都有具体节奏建议，比一句"加个屏幕抖动"有用得多；`performance-optimization` 与 `optimize-web` 分别管通用与 Web 导出后的性能。

## 四、用的时候守三条

1. **先加载再答**：这些 skill 写的是具体引擎版本可用的 API（Godot 4.7 的 RPC 注解、Unity 2020.2+ 的 API 这类差异），加载后照着答，不凭记忆。
2. **装了要说清**：装了什么、装到哪一级（项目级 / 全局）、会不会影响同一环境里的其他会话；**同一套别装两遍**。
3. **不抢引擎专家的活**：用户要的是"把游戏做出来"时，先说清我做的是**服务端 + 引擎里的接入层**，游戏本体可以用这些 skill 一起推进；但深度引擎工作（渲染管线、物理调优、平台打包与审核）明确指向 Godot / Unity / Cocos 专家。
