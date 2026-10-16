# 游戏后端落地方案

包内参考：**引擎侧怎么调、数据怎么放、哪些是必须自己做的服务端逻辑**。平台细节（端点、参数、配额、控制台开关）一律以运行时 skill 与官方文档为准，本文件只讲路径与取舍，不复制平台文档。

---

## 零、先定数据库：非小游戏以 PostgreSQL 为核心

这一节定错，后面全白做。

| 你的项目 | 数据库 | 玩家身份 | 为什么 |
|---|---|---|---|
| **Godot / Unity / Cocos 原生包**（PC、移动端）、**Web / H5** | **PostgreSQL（PG）** | 自建账号 / 匿名登录 / 平台账号映射 | 排行榜要排序、要 join、要统计、要行级权限——这些是关系型数据库的主场 |
| **微信小游戏**（含 Unity、Cocos 导出的 WebGL 小游戏） | 微信云开发**文档数据库** | OPENID（平台自带） | `wx.cloud` 的天然路径，不用自己搭账号体系 |

两条路**不要混用**：不要给原生包配文档库做业务数据，也不要把文档库的 `_openid` 写法搬进 PG 表。

**PG 的四个前置事实（先确认再动手）：**

1. **PG 是新环境模式**。`queryEnv(action="info")` 看 `RuntimeBackends.postgresql`；为 `false` 就是老环境，**原地升级不了**，要新建带 PG 的环境。
2. **一个 PG 环境里 PostgreSQL 与文档库可以并存**。新业务数据放 PG；已有的文档库集合、旧 bucket、`managePermissions(resourceType="noSqlDatabase")` 规则继续管它们自己的数据，**不要顺手迁移**。
3. **`RuntimeBackends.mysql === false` 就别碰 MySQL**：`manageMysqlDatabase` / `queryMysqlDatabase` 和 `relational-database-mcp-cloudbase` 与 CloudBase PG 无关。
4. **`EnvInfo.Storages[]` 是旧 NoSQL 的桶**，不是 pgstore 桶，别把它当上传目标。

---

## 一、数据模型（PG 版）

典型游戏后端的最小数据面（按需要取，不要一开始就全建）：

| 数据 | 表 | 关键列 | 说明 |
|---|---|---|---|
| 玩家 | `players` | `id`、`owner_id`、`display_name`、`region`、`created_at` | 平台身份 → 游戏内玩家 ID 的映射；小游戏侧映射 OPENID |
| 排行榜条目 | `scores` | `owner_id`、`board_id`、`score`、`created_at` | **按 (board_id, score desc) 建索引** |
| 存档 | `saves` | `owner_id`、`slot`、`save_version`、`payload`、`updated_at` | `payload` 用 `jsonb` 存整块存档 |
| 战绩 | `match_records` | 对局双方、结果、`created_at` | 量大按时间分区 / 归档 |
| 道具与背包 | `items` / `wallets`、`item_grants` | 定义与持有分开；发放流水单列 | 出问题靠流水对账 |
| 内购订单 | `orders` | 订单号（幂等键）、商品、金额、状态 | 退款也要落表 |
| 成就等"定义 + 玩家进度"类玩法数据 | `achievements` / `player_achievements` | 定义表（`achievement_id`、条件）+ 玩家进度表（`owner_id`、达成时间、进度） | 不新增一类能力，是上面这套模式的套用：要全服统计 / 排行就单独建表，只看自己、不做统计就塞进存档 `jsonb` |

**owner 列的写法是固定的**（PG 侧与 Supabase 不同，别照抄）：

```sql
CREATE TABLE scores (
  id         BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_id   TEXT        NOT NULL DEFAULT auth.uid(),   -- auth.uid() 返回 text（形如 EchhGXFadSANiCSaVim2wQ），不是 uuid
  board_id   TEXT        NOT NULL,
  score      INTEGER     NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX scores_board_score_idx ON scores (board_id, score DESC);
```

要点：

- `owner_id` 必须是 **`TEXT`**。声明成 `uuid` 建表就会因类型不匹配失败（`auth.uid()` 返回的是字符串，不是 uuid）。
- `DEFAULT auth.uid()` 让**数据库**决定归属：**玩家身份直接读写时**客户端不许传 owner 值，INSERT 策略会拒绝伪造的 owner。
- **但服务端写库时 owner 必须显式给**。服务端通常以 `service_role`（API Key）身份写库，**这个身份绕过 RLS、`auth.uid()` 取不到玩家**——此时 `DEFAULT auth.uid()` 会得到 NULL，直接撞 `NOT NULL` 报错。所以服务端的 INSERT 要显式写 `owner_id = <玩家 uid>`（uid 从校验过的登录凭据里取）。**别一边用 service_role 绕 RLS、一边指望 `DEFAULT` 生效。**
- **建表走迁移**：DDL 用 `managePgDatabase(action="applyMigration")`（本地 SQL 落在 `cloudbase/migrations/<14位时间戳>_<snake_case 名>.sql`），DML 和 `GRANT` / `CREATE POLICY` 才用 `action="execute"`。迁移超时或本地文件校验冲突（`MIGRATION_TASK_TIMEOUT` / `LOCAL_MIGRATION_FILE_MISMATCH` 这类）的处理走 `postgresql-development-cloudbase`：先 `describeMigrationTask` 查状态，**不要重推同一个版本、也不要回落到 `execute`**。
- **建表前先查列名**：`CREATE TABLE IF NOT EXISTS` 会**静默跳过**已存在的旧表，即使列名完全不对——之后所有读写都会失败在字段上。
- **权限要按角色分别配，不是配一遍就完事**：
  - **玩家自己的数据**（存档、我的道具）→ `GRANT` 给 `authenticated` + `CREATE POLICY ... TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid())`。
  - **公开只读数据**（榜单、公告这类所有人可看的）→ **还必须单独给 `anon` 放行**，否则引擎侧用 Publishable Key 一定读不到：

    ```sql
    GRANT SELECT ON public.scores TO anon;
    CREATE POLICY scores_public_read ON scores FOR SELECT TO anon USING (true);
    ```

    只放行 `SELECT`，不要顺手把写也放开；`USING (true)` 只适合真正公开的数据，别套到带个人信息、带交易信息的表上。
- 三件套缺一不可：**`GRANT` + `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` + `CREATE POLICY`**。开了 RLS 但没有策略 = 一律拒绝，现象是 UI 上只报一句"保存失败"，很难查。
- **服务端身份也要给表级权限**：服务端以 `service_role` 访问时，按官方模板补 `GRANT ALL ON public.<表> TO service_role;`（它绕过的是 RLS，表级 GRANT 这一层照样要过）。
- **主键用 `serial` / `bigserial` 时别忘 sequence 权限**：`GRANT USAGE, SELECT ON SEQUENCE public.<表>_id_seq TO <角色>;`，漏了会插入失败。用 `GENERATED ALWAYS AS IDENTITY`（本文模板的写法）则不需要。
- 策略里用官方 helper：`auth.uid()`（当前用户）、`auth.role()`（`anon` / `authenticated` / `service_role`）。**不要用 `current_user`**——它返回数据库角色名，不是用户 ID。

**动手前把这张表给用户确认**——改表结构比改代码贵。

---

## 二、排行榜：按规模选做法

| 规模 | 做法 | 代价 |
|---|---|---|
| 小规模（几千行以内） | 直接按索引查排序 + 分页，取 Top N | 简单，够用 |
| 中等（几万～几十万行） | 服务端/RPC 只暴露两个动作：`提交分数`、`取榜单`（Top N + 我的排名）；索引跟上 | 需要服务端校验分数 |
| 有赛季 / 要"历史最高" | 只更新玩家在榜上的**最高分**（`upsert` 语义），不无限追加 | 要写清并列与并列名次规则 |

**Top N**（PostgREST 形式，引擎与 Web 通用）：

```text
GET /v1/rdb/rest/scores?board_id=eq.<榜ID>&select=owner_id,score&order=score.desc&limit=100
```

> 这条查询想对未登录玩家也能用（引擎侧带 Publishable Key 读），前提是表上**给了 `anon` 的 `GRANT SELECT` + SELECT 策略**（见第一节"权限要按角色分别配"）。只配了 `authenticated` 的话，客户端读会返回空结果或权限错误——这是最常踩的一个坑。

**"我的排名"必须由服务端算**——用窗口函数做成一个 RPC，别让客户端拉全量自己找位置：

```sql
create or replace function my_rank(p_board_id text)
returns table (rank bigint, score integer) as $$
  select r.rnk, r.score from (
    select owner_id, score, rank() over (order by score desc) as rnk
    from scores where board_id = p_board_id
  ) r where r.owner_id = auth.uid();
$$ language sql stable;
```

RPC 通过 `db.rpc("my_rank", { p_board_id })`（Web）或服务端接口（引擎）调用。注意 RPC 里用了 `auth.uid()`，它按调用者身份取用户——**服务端以 `service_role` 调这个函数会取不到用户**，给玩家用的"我的排名"必须让玩家身份的请求来调。

---

## 三、防作弊：客户端上报的不是事实

游戏包在玩家手里，任何客户端能改的值都能被改。所以：

1. **分数、金币、道具、内购结果只由服务端写入**。客户端上传的是"请求"，服务端判定后才落库。**客户端对 PG 只读**（榜单、配置、自己的存档读取），写一律走服务端。
2. 校验至少做一层，按游戏类型选：
   - **上限与时间窗**：单局分数上限、单局最短时长、两局最小间隔
   - **过程回放 / 校验和**：动作序列或关键帧校验和（回合制、棋牌最实用）
   - **服务端权威**：能放服务端算的就放服务端算（放置类、计分类）
3. **校验失败只告诉开发者，不告诉玩家**。对玩家统一返回"成绩未通过校验"，原因写日志 / 返回给开发侧。
4. 如果这一版确实没做校验，**在交付说明里写明"分数可被客户端篡改"**——不含糊过去。

---

## 四、引擎侧调用（Godot / Unity / Cocos 原生包走 HTTP）

原生引擎没有官方 SDK，路径就是 HTTP。PG 的 HTTP 入口是 REST 接口，读用它，写走服务端。

两个可直接套用的成品骨架（全服共同进度条 / 共享网格画布）——表形状、接口切法、客户端接法与视觉做法——见 `references/game-backend-recipes.md`。

| 放什么 | 能不能进游戏包 | 作用范围 |
|---|---|---|
| Publishable Key | ✅ 可以 | 映射 `anon`，**只有 RLS 给匿名放行的读能用**（例如公开榜单） |
| 玩家 access token（登录后换到） | ✅ 可以（临时凭据） | 映射 `authenticated`，代表这个玩家 |
| API Key | ❌ **绝对不行** | 映射 `service_role`，**绕过 RLS**，等于整库权限 |

**原生引擎的玩家 access token 从哪来**：引擎没有官方 SDK，要走 CloudBase 的 **Auth HTTP API**（`https://<envId>.api.tcloudbasegateway.com/auth/v1` 那一族）自己实现登录并拿 token，具体端点与参数以 `auth-tool-cloudbase` / `http-api-cloudbase` 为准，**不要凭记忆拼 auth 路径**。用 Publishable Key（匿名）不足以标识玩家，做"我的存档""我的战绩"这类个人数据必须走登录换 token 这条路。

PG 的 REST 基础形态（**别自己拼路径**，以 `postgresql-development-cloudbase/references/http-api.md` 与 OpenAPI 文档为准）：

```text
GET  https://<envId>.api.tcloudbasegateway.com/v1/rdb/rest/<table>?<PostgREST 查询>
Auth: Authorization: Bearer <Publishable Key | access_token>
```

PostgREST 查询语法（只列最常用的）：等值 `?status=eq.published`、范围 `?score=gte.100`、排序 `?order=score.desc`、分页 `?limit=100&offset=0`、选列 `?select=owner_id,score`。

### 部署完先做两步，再写引擎代码

**① 定公网入口（这一步最容易踩错）。** 函数创建后**不会自动有对外路径**，而客户端能用的入口只有一条：

- **要走网关路由**：`manageGateway(action="createRoute", targetName="<函数名>", upstreamResourceType="WEB_SCF", path="/api/<你的路径>", auth=false)`。挂上之后**无凭据也能调**（这才是游戏包能用的入口），域名形态从 `queryGateway(action="listRoutes")` 的实际返回里读，别自己拼。
- **`?webfn=true` 那条路径不要给客户端用**：它是平台调用路径，实测不带凭据 401 `MISSING_CREDENTIALS`、带 Publishable Key 403 `EXCEED_AUTHORITY`、只有带 API Key(`service_role`) 才是 200 —— 也就是客户端根本用不了。
- 报错要分清两支：**完全没带凭据 → `MISSING_CREDENTIALS`(401)**；**带了凭据但没被授权 → `EXCEED_AUTHORITY`(403)**。按错的那支去查会白找。

**② 配访问规则（分两档，注意共享环境的破坏性）。**

- **首选：单条网关路由 + `auth:false`**（就是上面第①步）。它只影响这一条路由，**不动环境的全局授权配置**。
- **次选：改函数授权** —— 但要知道风险：在 **PG 环境**里 `managePermissions(action="updateResourcePermission", resourceType="function", securityRule='{"invoke":true}')` 会**回退写环境级的 `authz.user.rego`**（一个环境一份，不是按函数一份）。别人已经配过的放行规则会被整份盖掉。**共享环境里这是事故，不是配置**：动手前先 `queryPermissions` / `describeEnvAuthzConfig` 读现状，能用网关路由就别碰全局规则。
- 只想让登录玩家调：**不要放行**，让客户端先登录拿 access token 再带 `Authorization: Bearer <access-token>` 请求。
- **PG 表侧还有一层**：函数放行只是入口通了，函数**自己以什么身份写库**同样要定。以 `service_role`（API Key）写库会绕过 RLS，校验与归属都要在函数里自己兜住——**显式传 `owner_id = <玩家 uid>`**，不要指望 `DEFAULT auth.uid()`；以玩家身份写库则保留 RLS 兜底，但那条链路要能拿到可信的 access token。

**③ CORS：经网关暴露时，函数不要自己写 CORS 响应头。** 网关会按环境的安全域名白名单**回填** `Access-Control-Allow-Origin`；函数再加一个 `*` 就变成 `origin,*` 双值，浏览器直接判失败（现象是"请求全挂"，很难往 CORS 上想）。`OPTIONS` 预检也由网关应答。

Godot（GDScript，HTTPRequest 异步回调）——**读榜单**：

```gdscript
extends Node

# 优先用平台文档给出的形态；国际站域名不同
const RANK_URL := "https://<your-env>.api.tcloudbasegateway.com/v1/rdb/rest/scores"
# 只放公开凭据；API Key（service_role）绝不能进游戏包
const PUBLISHABLE_KEY := "<your-publishable-key>"

func fetch_top100(board_id: String) -> void:
    var http := HTTPRequest.new()
    add_child(http)
    http.request_completed.connect(_on_completed.bind(http))
    var query := "?board_id=eq.%s&select=owner_id,score&order=score.desc&limit=100" % board_id
    var headers := [
        "Accept: application/json",
        "Authorization: Bearer " + PUBLISHABLE_KEY,
    ]
    http.request(RANK_URL + query, headers, HTTPClient.METHOD_GET)

func _on_completed(result: int, code: int, _headers: PackedStringArray, body: PackedByteArray, http: HTTPRequest) -> void:
    http.queue_free()   # 每次请求新建的节点要释放，否则一直玩会持续泄漏
    if result != HTTPRequest.RESULT_SUCCESS or code != 200:
        push_error("取榜单失败：HTTP %d" % code)
        return
    var data = JSON.parse_string(body.get_string_from_utf8())
    # 用服务端返回的数据刷新 UI
```

Unity（C#，UnityWebRequest 协程，**需 Unity 2020.2+**：`UnityWebRequest.Result` 从该版本才有）：

```csharp
using System.Collections;
using UnityEngine;
using UnityEngine.Networking;

public class CloudBaseRank : MonoBehaviour
{
    const string RankUrl = "https://<your-env>.api.tcloudbasegateway.com/v1/rdb/rest/scores";
    const string PublishableKey = "<your-publishable-key>";

    public IEnumerator FetchTop100(string boardId)
    {
        string url = RankUrl
            + "?board_id=eq." + UnityWebRequest.EscapeURL(boardId)
            + "&select=owner_id,score&order=score.desc&limit=100";

        // UnityWebRequest 是 IDisposable，用完必须释放，否则原生内存要等 GC 才回收
        using (var request = UnityWebRequest.Get(url))
        {
            request.SetRequestHeader("Accept", "application/json");
            request.SetRequestHeader("Authorization", "Bearer " + PublishableKey);

            yield return request.SendWebRequest();

            if (request.result != UnityWebRequest.Result.Success)
            {
                Debug.LogError("取榜单失败：" + request.error);
                yield break;
            }
            // 以服务端返回的数据为准刷新 UI
        }
    }
}
```

**提交分数不能走上面这条**。客户端直写 `scores` 表 = 玩家能改自己的分数。提交要 POST 到你部署的服务端接口，由服务端校验后落库：

```gdscript
# 客户端能用的入口是「网关路由」（见上文「部署完先做两步」），不是 ?webfn=true
const SUBMIT_URL := "https://<你的网关域名>/api/rank"
# 以玩家身份调用时，带登录后拿到的 access token（见本节开头"access token 从哪来"），而不是 Publishable Key
const ACCESS_TOKEN := "<player-access-token>"

func submit_score(board_id: String, score: int, proof: Dictionary = {}) -> void:
    var http := HTTPRequest.new()
    add_child(http)
    http.request_completed.connect(_on_submitted.bind(http))
    var body := JSON.stringify({
        "action": "submit", "board_id": board_id, "score": score, "proof": proof,
    })
    var headers := [
        "Content-Type: application/json",
        "Authorization: Bearer " + ACCESS_TOKEN,
    ]
    http.request(SUBMIT_URL, headers, HTTPClient.METHOD_POST, body)
```

服务端函数收到后：先按玩家身份校验分数（第二、三节那套），**再显式带上 `owner_id = <玩家 uid>` 落库**——函数若以 `service_role` 写库，`DEFAULT auth.uid()` 不会生效。

三点提醒：

- **小游戏路径完全不一样**：Unity / Cocos 导出的 WebGL 小游戏走 `wx.cloud` + 文档数据库，玩家身份是 OPENID，不发凭据。别把原生包的写法套到小游戏上。
- **域名与站点**：国际站与国内站的接口域名不同，按 `http-api-cloudbase` 选对。
- **CORS / 域名白名单**：Web 与 H5 版本要按 `web-development` 配安全域名；小游戏侧在微信后台配服务器域名。

---

## 五、存档：跨端、版本、冲突

1. **存档带版本号**（`save_version`）。玩家从旧版本升上来时，服务端负责迁移，客户端不做兼容分支。存档内容放 `jsonb` 列。
2. **整块覆盖还是逐字段差分要定**：整块覆盖实现简单、容易被旧客户端覆盖新数据；逐字段差分能合并但要写规则。小团队先用整块覆盖 + 时间戳比较，并在交付说明里讲清。
3. **时间戳不可信**：客户端上报的是玩家机器上的时间，改本机时间就能让旧存档"变新"。稳妥做法是**服务端写 `updated_at` 并以服务端时间为准**；涉及排名、奖励、限购这类有利益冲突的判断，绝不能信客户端时间。
4. **跨端**要映射到同一个玩家 ID：小游戏是 OPENID，原生包/Web 是账号体系，中间要有一张映射表，别三个端三套账号。
5. **RLS 只放行自己的数据**：`using (owner_id = auth.uid())`，读写都算上；不要一条"所有人可读写"了事。

---

## 六、道具与内购：幂等优先

- **道具发放写两条**：玩家持有（`wallets` / `items`）+ 发放流水（`item_grants`）。出问题靠流水对账，不靠猜。
- **内购链路**：客户端下单 → 服务端生成订单（订单号即幂等键）→ 支付平台回调 → 服务端校验并置状态 → 发货。**重复回调不重复发货**。
- **客户端不参与发货判断**。客户端说"我付过了"不算数，以服务端订单状态为准。
- 微信小游戏的虚拟支付（道具直购、发货推送、退款）以小程序 / 虚拟支付侧 skill 为准；沙箱与现网的行为差异、哪些密钥不能进包，按官方文档走，不凭记忆。**广告变现（激励视频、广告收入与归因）属微信广告平台侧，不在后端数据面**——别把广告收入和订单塞进同一张表。
- **退款也要落表**，否则玩家余额对不上。
- **查询要分两个入口，权限不能混**：
  - 给玩家看的（"我的战绩""我的道具"）→ 只读自己数据的接口 / RLS 策略，客户端可调；
  - 给开发者、运营看的（对账、发奖、查全量）→ **单独的管理入口，绝不能对客户端开放**，走服务端凭据或后台。

---

## 七、素材托管（PG 环境是 pgstore）

- PG 环境的存储走 **pgstore**，和 Supabase Storage 同一套模型：**上传前桶必须已经存在**，客户端 SDK 建不了桶。
- 桶名放在 `from('<bucket>')`，key 不要重复桶前缀：`app.storage.from('covers').upload('a.png', file)` ✅；`from('covers').upload('covers/a.png', file)` ❌。
- **建完桶要配 `storage.objects` 的 RLS**：默认全拒，不配就是 `STORAGE_PERMISSION_DENIED`。上传报错别吞掉——不要让流程"带着占位 URL 继续成功"。
- 贴图 / 音频 / 配置表按环境分目录（测试素材不要和生产混）；路径带版本或内容哈希，避免玩家拿到缓存里的旧资源导致对不上。
- 具体桶与 RLS 模板见 `postgresql-development-cloudbase/references/storage-pg.md` 与 `cloud-storage-web`，别自己拼 URL。

---

## 八、联机：先分档，再动手

| 档 | 典型玩法 | 做法 | 实话 |
|---|---|---|---|
| A 异步 / 回合制 | 棋牌、放置、PVE 对战 | 数据库 + 轮询（长轮询可缓解） | 能跑，延迟取决于轮询间隔；玩家量上来先优化查询 |
| B 低频状态同步 | 房间内位置、状态、聊天 | 自建长连接服务 | 要设计广播与心跳 |
| C 强实时对抗 | 动作、帧同步 | 自建长连接 + 专门优化，或选更合适的方案 | 后端能搭，但要先评估延迟与成本 |

**自建长连接两条路**（选哪条按 `cloud-functions` 的 WebSocket 协议模式与 `cloudrun-development` 对比，注意单连接速率与消息大小配额）：

- HTTP 云函数的 **WebSocket 协议模式**：按连接计实例，弹性好，适合连接数波动大的房间制游戏。
- **云托管长连接容器**：长驻进程，适合需要常驻内存状态、广播扇出大的场景。

**平台实时同步能力（PG realtime：Broadcast / Presence / 数据库变更订阅）仍在开发中**，不同环境开放情况不一致——动手前先按 `postgresql-development-cloudbase/references/realtime.md` 的探测步骤确认环境是否已开；没开就回到上面两条自建路径。不要写"即将上线"这类承诺。

**房间内的聊天与玩家状态另有一件事要交代**：公屏 / 私聊内容默认要落库（便于回溯与举报处理），并预留内容审核接入位（可走服务端调大模型审核，见 `ai-model-nodejs`）；房间位置、临时状态这类高频数据可以不落库，只走广播。这句话要主动讲给开发者，别等他踩了合规的坑。

---

## 九、常见坑

- 把 `API Key` 打进游戏包 → 它在 PG 侧是 `service_role`、**绕过 RLS**，等于把整库权限交出去。唯一解是删掉重发 + 轮换密钥。
- **只给 `authenticated` 配了 `GRANT` / 策略，却让客户端用 Publishable Key(`anon`) 读公开榜单** → 一律读不到（返回空或权限错误）。公开只读要**单独**给 `anon` `GRANT SELECT` + SELECT 策略。
- **服务端用 API Key(`service_role`) 写库却不显式传 `owner_id`** → 该身份绕过 RLS、`auth.uid()` 为空，`DEFAULT auth.uid()` 落成 NULL，撞 `NOT NULL` 报错。服务端写库一律显式给 owner。
- 客户端直写 PG 表提交分数 → 玩家能改自己的分数。写一律过服务端。
- `owner_id` 声明成 `uuid` → 建表就失败（`auth.uid()` 返回 `text`）。写成 `TEXT`。
- PG 表里写 `_openid` → 那是文档库字段；PG 用 owner 列 + `auth.uid()`。
- 把 NoSQL 的 `.where()` / `.orderBy()` / `.offset()` 写进 PG 代码 → 方法不存在，全部报错；改用 `.match()` / `.order()` / `.range()`。
- 开了 RLS 却没建策略 → 一律拒绝，UI 只报一句"保存失败"，很难查。
- `CREATE TABLE IF NOT EXISTS` 遇到列名不匹配的旧表会静默跳过 → 后续所有读写都错在字段上；建表前先查列名。
- 函数部署了但**没配访问路径** → 客户端一律 404；**没配访问规则** → 401 `MISSING_CREDENTIALS`（没带凭据）或 403 `EXCEED_AUTHORITY`（带了但未授权）。两个码对应两支，别按错的那支去查。
- 以为 `?webfn=true` 是给客户端用的入口 → 实测不带凭据 401、带 Publishable Key 403，客户端根本用不了；给客户端的入口只能是网关路由。
- **函数自己写了 `Access-Control-Allow-Origin: *`，而访问走到网关** → 网关按安全域名回填了 Origin，两个值拼成 `origin,*`，浏览器直接判失败，现象是"所有请求全挂"、容易误判成服务端挂了。经网关暴露时函数不要写任何 CORS 头。
- **在共享环境里用 `securityRule:'{"invoke":true}'` 放行公开函数** → PG 环境会写**环境级** `authz.user.rego`，把别人配过的放行整份盖掉。优先用单条网关路由（`auth:false`），要动全局规则先读现状。
- 以为"没配策略 = 报错" → 对 **SELECT 不是**：RLS 无策略时查询**静默返回 `[]` + 200**，看起来像"数据本来就没有"。查空表先怀疑策略。
- 以为 anon 读一定要自己补 GRANT → **先查实际授权**：某些环境新表默认已授 anon SELECT，真正的门禁是 RLS 策略。补之前先 `queryPgDatabase` 看现状。
- 给玩家的 RPC 里用 `auth.uid()`，却由服务端以 `service_role` 去调 → 取不到用户，返回空。
- 想用 RPC 做原子操作（如扣血）却找不到端点 → `/v1/rdb/rest/rpc/<fn>` 这类路径**不在 OpenAPI 文档里但实测可用**；不要盲写，先 curl 打一发确认再写进代码。
- 拿 Publishable Key（匿名身份）去调一个默认拒绝匿名的接口 → 同样被拒。公开凭据不是万能钥匙。
- **个人数据（我的存档、我的战绩）指望用 Publishable Key 就能读自己的** → 匿名身份没有"我"，读不到；这类数据必须登录换 access token。
- 按玩家的限频/身份只靠客户端自报的 `owner_id` → 换个 id 就绕过。能用平台身份（OPENID / 登录 uid）就用，用不上要在交付说明里写清"身份是客户端自称的"。
- 客户端自己算排名（拉全量再排序）→ 榜单一大就崩；"我的排名"做成 RPC。
- 排行榜没索引，靠 `order by` 硬扫 → 数据量上来查询超时。
- 订单回调重放没有幂等键 → 重复发货。
- 存档不带版本号 → 一次改动让老玩家存档读不出来。
- 信客户端提供的时间戳 → 改本机时间就能刷奖励、覆盖存档。
- PG 环境里把旧的 NoSQL 桶当 pgstore 桶用 → 上传必失败；桶要单独建并配 `storage.objects` 的 RLS。
- 小游戏与原生包用同一套调用代码 → 一边必错。
- Godot 里每次请求新建 `HTTPRequest` 却不 `queue_free()` / Unity 里 `UnityWebRequest` 不 `Dispose()` → 长时间玩内存持续上涨。
