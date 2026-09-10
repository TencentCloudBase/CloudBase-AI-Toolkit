import { defineModule } from "../types.js";

export const permissions = defineModule(
  {
    queryTitle: "查询 CloudBase 权限与用户配置",
    queryDescription:
      "查询 CloudBase 权限与用户配置，支持查询资源权限（数据库/云函数/存储桶等）、角色列表/详情、应用用户列表/详情，以及网关 OPA 授权策略（对齐 CLI `tcb policy list/get`）。\n\n示例：\n- 查询存储桶权限：`action=\"getResourcePermission\", resourceType=\"storage\", resourceId=\"bucket-name\"`\n- 列出旧网关策略：`action=\"listPolicy\"`（PG / OPA 引擎环境返回空列表，与 CLI 一致）\n- 读取用户 Rego：`action=\"getPolicy\"`；平台扩展策略：`action=\"getPolicy\", extension=true`\n\n📌 跨后端边界提示：调用前先用 `envQuery(action=\"info\", envId=...)` 看 `EnvInfo.RuntimeBackends`。`resourceType=\"noSqlDatabase\"` 查询的是 CloudBase NoSQL 集合规则，与 CloudBase PostgreSQL（PG）表的行级安全（RLS）是两套独立机制——同一个 PG 环境里 NoSQL 集合若仍在使用，对那些集合查询本工具结果**仍然有效**。要查 PG 表 RLS，请改用 `queryPgDatabase(action=\"sql\", sql=\"SELECT * FROM pg_policies WHERE tablename=...\")`。本工具不涉及 MySQL 权限。\n\n⚠️ PostgreSQL 环境：平台 `DescribeResourcePermission` 对 PG 环境会直接拒绝。当 `resourceType=\"function\"` 时，本工具会自动回退到 Manager SDK `describeEnvAuthzConfig`（与 CLI `tcb policy get` 一致，读取 `authz.user.rego`）。显式 OPA 策略请用 `listPolicy` / `getPolicy`。",
    manageTitle: "管理 CloudBase 权限与用户配置",
    manageDescription:
      "管理 CloudBase 权限与用户配置，支持修改资源权限（数据库/云函数/存储桶等）、角色管理、成员与策略增删、应用用户 CRUD，以及设置网关 OPA Rego 策略（对齐 CLI `tcb policy set`）。\n\n示例：\n- 设置存储桶为私有：`action=\"updateResourcePermission\", resourceType=\"storage\", resourceId=\"bucket-name\", permission=\"PRIVATE\"`\n- 创建角色：`action=\"createRole\", roleName=\"admin\", roleIdentity=\"admin\"`\n- 放开云函数匿名/未登录访问（PG 会走 OPA，对齐 CLI `tcb policy set`）：`action=\"updateResourcePermission\", resourceType=\"function\", resourceId=\"myFn\", permission=\"CUSTOM\", securityRule='{\"invoke\":true}'`\n- 直接设置用户 Rego：`action=\"setPolicy\", regoContent=\"package authz.user\\n\\ndefault allow := false\\n\", confirm=true`（⚠️ 立即禁用旧网关鉴权）\n\n注意：`createUser` / `updateUser` 是环境侧应用用户管理能力，适合测试账号、管理员或预置用户，不应替代浏览器里的 Web SDK 注册表单；前端用户名密码注册应使用 `auth.signUp({ username, password })`，登录应使用 `auth.signInWithPassword({ username, password })`。直接在浏览器里用 `auth.signUp` 创建用户名密码用户取决于 SDK/provider 支持，使用前必须验证；不支持时应走后端或管理端边界，不能在浏览器暴露密钥。`securityRule` 的详细语义取决于 `resourceType`：`doc._openid`、`auth.openid`、查询条件子集校验，以及 `create` / `update` / `delete` JSON 模板仅适用于 `resourceType=\"noSqlDatabase\"` 的文档数据库安全规则；配置 `function` 或 `storage` 时，请参考各自官方安全规则文档，而不是复用 NoSQL 模板。\n\n📌 跨后端边界提示：调用前先用 `envQuery(action=\"info\", envId=...)` 看 `EnvInfo.RuntimeBackends`：\n- `resourceType=\"noSqlDatabase\"` 仅作用于 CloudBase NoSQL 文档数据库的集合；CloudBase PostgreSQL（PG）表的行级权限**不**受它控制——PG 表请改用 RLS：`managePgDatabase(action=\"execute\", confirm=true)` 跑 `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` 与 `CREATE POLICY ...`。同一个 PG 环境里如果还有 NoSQL 集合在用，对那些**集合**继续使用 `noSqlDatabase` 规则是正确的——不是\"PG 环境就禁用本工具\"。\n- `resourceType=\"storage\"` 控制的是 NoSQL/COS 存储桶 ACL；PG 的 `pgstore` bucket 不在此 `resourceType` 覆盖范围内。\n- 本工具不涉及 MySQL；MySQL 数据库权限请走 MySQL 自身的 GRANT/REVOKE 语句（通过 `manageMysqlDatabase`）。\n\n⚠️ PostgreSQL 环境：平台 `ModifyResourcePermission` 对 PG 环境会直接拒绝。当 `resourceType=\"function\"` 时，本工具会自动回退到 Manager SDK `modifyEnvAuthzConfig`（与 CLI `tcb policy set` 一致，写入 `authz.user.rego`）。`securityRule` 可传完整 Rego（`package authz.user`）或 `'{\"invoke\":true}'`（自动生成放通 anonymous/unauthenticated 调 functions 的策略）。设置 Rego 后旧网关鉴权会失效，行为与 CLI 相同。显式 OPA 策略请优先用 `action=\"setPolicy\"`。",
    writeVerificationHint:
      "对于 {resourceId} 这类有后端权限控制的集合，前端调用 .doc(id).update() / .doc(id).remove() 后，不能只看是否没有抛异常。请显式检查返回结果中的 updated / deleted 是否大于 0；如果 result.code、result.message 存在，或 updated / deleted 为 0，要把它当作真实失败并向上抛错。",
    permissionPropagationHint:
      "刚更新完 {resourceId} 的安全规则时，后端权限通常在数秒到约 30 秒内生效。若紧接着的真实写操作仍返回 DATABASE_PERMISSION_DENIED，请先间隔数秒用同一登录态重试同一条 .doc(id).update() / .doc(id).remove()；不要盲等数分钟，也不要立刻连续重写规则，更不要在短暂传播窗口里把旧拒绝直接当成规则表达式仍然错误。",
    validateRegoEmpty: "action=setPolicy 需要非空 regoContent（对齐 CLI `tcb policy set <regoContent>`）。",
    validateRegoPackage: "Rego 策略必须以 `package authz.user` 开头（对齐 https://docs.cloudbase.net/cli-v1/policy/management ）。",
    validateRegoBraces: "Rego 策略花括号不匹配（{={open}, }={close}）。请检查语法后再调用 setPolicy。",
    regoInputRequired:
      "PostgreSQL 环境通过 OPA Rego 管理 HTTP/云函数网关鉴权（与 CLI `tcb policy set` 相同），" +
      "而不是 ModifyResourcePermission / 云函数 security-rule JSON。请二选一传入：\n" +
      "1) permission=\"CUSTOM\"，且 securityRule 为以 `package authz.user` 开头的完整 Rego 文档；或\n" +
      "2) permission=\"CUSTOM\"，且 securityRule='{\"invoke\":true}'，用于生成放通所有云函数的 allow 策略。\n" +
      "详见 https://docs.cloudbase.net/cli-v1/policy/management",
    managerNoDescribeEnvAuthz: "当前 @cloudbase/manager-node 未暴露 permission.describeEnvAuthzConfig。请升级 manager-node（>= 5.5.5）以对齐 CLI tcb policy get。",
    managerNoModifyEnvAuthz: "当前 @cloudbase/manager-node 未暴露 permission.modifyEnvAuthzConfig。请升级 manager-node（>= 5.5.5）以对齐 CLI tcb policy set。",
    managerNoDescribeResourcePolicyList: "当前 @cloudbase/manager-node 未暴露 permission.describeResourcePolicyList。请升级 manager-node（>= 5.5.5）以对齐 CLI tcb policy list。",
    pgModifyUnsupported:
      "PostgreSQL 环境不支持 ModifyResourcePermission。请对齐 CLI `tcb policy set`：" +
      "使用 permission=\"CUSTOM\"，并传入 OPA Rego（package authz.user）" +
      "或 securityRule='{\"invoke\":true}'（放通所有云函数）。" +
      "底层错误：{message}",
    mustBeArray: "{label} 必须是数组",
    roleLookupNote:
      "如果你需要 app-level admin override（例如 CMS 中 admin 可编辑所有文章，而 editor 只能编辑自己的文章），CUSTOM 规则通常是必要的。一个已验证可用的模式是：角色集合文档主键就是 auth.uid，并在文章权限里写 get('database.user_roles.' + auth.uid).role == 'admin' || doc.authorId == auth.uid。若现有 schema 已经有 users / profiles / user_roles 其一，请复用已存在且能通过 _id == auth.uid 直接 get() 到的那一份；不要把 where({ uid }) 查询得到的集合误写成 get('database.users.' + auth.uid)。",
    recommendedClientWritePattern:
      "对于 CMS 文章这类使用 app-level admin override 的 CUSTOM 规则，前端可继续使用 db.collection('{resourceId}').doc(id).update(...) / remove(...)。关键是安全规则要采用已验证模式：get('database.user_roles.' + auth.uid).role == 'admin' || doc.authorId == auth.uid，并且文章文档中要真实写入 authorId。",
    createRuleSummary: "create 规则不应引用 doc.*，因为 create 时文档尚未存在。",
    createRuleDetail:
      "CloudBase 的 create 规则验证的是写入数据（request.data），此时文档尚不存在，doc.* 不可用。" +
      "请将 create 规则改为仅使用 auth.* 检查（如 auth.uid != null && auth.loginType != 'ANONYMOUS'），" +
      "或在写入时将 owner 字段（如 _openid / authorId）写入 request.data，然后在 create 规则中用 request.data._openid == auth.openid 做校验。" +
      "read / update / delete 规则可以使用 doc.* 引用已有文档字段，且客户端查询条件必须是规则约束的子集（如 _openid: '{openid}'）。",
    docIdWriteSummary: "当前安全规则在 document-id 写入场景下可能被后端直接拒绝。",
    docIdWriteDetail:
      "这类规则经常在 owner-only 集合里被写错，但对于 CMS 文章这种“admin 可编辑所有文章、editor 只能编辑自己的文章”的场景，已验证可用的做法是保留 doc.authorId，并通过独立角色集合做 admin override：get('database.user_roles.' + auth.uid).role == 'admin' || doc.authorId == auth.uid。不要默认改成 where(...)，也不要把同集合 owner 判断重写成 get('database.collection.' + doc._id)。",
    invalidGetPathSummary: "get() 的 path 只应包含 collection 和 documentId，不应把字段名拼进 path 字符串。",
    invalidGetPathDetail:
      "请写成 get('database.collection.' + doc._id).fieldName，而不是 get('database.collection.' + doc._id + '.fieldName')。但在 CMS 文章权限里，不要把 get('database.collection.' + doc._id) 当成默认首选方案；更稳的已验证模式是读取单独的角色集合：get('database.user_roles.' + auth.uid).role == 'admin' || doc.authorId == auth.uid。",
    templateLiteralSummary: "CloudBase security rule 表达式不支持把 ${...} 当作 JS 模板字符串插值。",
    templateLiteralDetail:
      "在 securityRule 字符串里，请使用表达式拼接，例如 get('database.user_roles.' + auth.uid).role，而不是 get('database.user_roles.${auth.uid}').role。对于 CMS 文章这类需要 app-level admin override 的规则，请优先使用已验证的 user_roles + doc.authorId 模式。",
    bucketMissing: "存储 Bucket {bucket} 不存在",
    bucketsMissing: "以下存储 Bucket 不存在: {buckets}",
    paramRequired: "action={action} 时必须提供 {param}",
    getResourcePermissionParamsRequired: "action=getResourcePermission 时必须提供 resourceType 和 resourceId",
    getUserParamsRequired: "action=getUser 时必须提供 uid 或 username",
    updateResourcePermissionParamsRequired: "action=updateResourcePermission 时必须提供 resourceType、resourceId 和 permission",
    createRoleParamsRequired: "action=createRole 时必须提供 roleName 和 roleIdentity",
    createUserParamsRequired: "action=createUser 时必须提供 username 和 password",
    policyIdsUnsupported: "action={action} 暂不支持 policyIds。请改传 policies，且每项至少包含 ResourceType 和 Resource。",
    policiesRequired: "action={action} 时必须提供 policies，且每项至少包含 ResourceType 和 Resource。",
    setPolicyConfirmRequired: "action=setPolicy 会立即禁用旧网关鉴权（对齐 CLI `tcb policy set`），必须显式传 confirm=true。",
    getResourcePermissionSuccess: "资源权限查询成功",
    getResourcePermissionFallbackSuccess: "资源权限查询成功（PostgreSQL 环境已回退到 describeEnvAuthzConfig / tcb policy get）",
    listResourcePermissionsSuccess: "资源权限列表查询成功",
    listResourcePermissionsFallbackSuccess: "资源权限列表查询成功（PostgreSQL 环境已回退到 describeEnvAuthzConfig / tcb policy get）",
    listRolesSuccess: "角色列表查询成功",
    getRoleSuccess: "角色详情查询成功",
    listUsersSuccess: "应用用户列表查询成功",
    getUserSuccess: "应用用户详情查询成功",
    listPolicyNote: "PG 环境与 authz_engine=opa 的环境会返回空列表（与 CLI `tcb policy list` / SDK describeResourcePolicyList 一致）。读取用户 Rego 请用 action=getPolicy。",
    listPolicySuccess: "网关授权策略列表查询成功",
    getPolicyExtensionSuccess: "平台扩展 OPA 策略查询成功（authz.platform.extension.rego）",
    getPolicySuccess: "用户 OPA 策略查询成功（authz.user.rego）",
    updateResourcePermissionSuccess: "资源权限更新成功",
    updateResourcePermissionFallbackSuccess: "资源权限更新成功（PostgreSQL 环境已回退到 modifyEnvAuthzConfig / tcb policy set）",
    createRoleSuccess: "角色创建成功",
    updateRoleSuccess: "角色更新成功",
    deleteRolesSuccess: "角色删除成功",
    createUserSuccess: "应用用户创建成功",
    updateUserSuccess: "应用用户更新成功",
    deleteUsersSuccess: "应用用户删除成功",
    setPolicySideEffect: "设置 authz.user.rego 会立即禁用旧网关鉴权。",
    setPolicySuccess: "用户 OPA Rego 策略设置成功（旧网关鉴权已失效）",
  },
  {
    queryTitle: "Query CloudBase permissions and user config",
    queryDescription:
      "Query CloudBase permissions and user config: resource permissions (database/functions/buckets etc.), role list/detail, app user list/detail, and gateway OPA authorization policies (aligned with CLI `tcb policy list/get`).\n\nExamples:\n- Query bucket permission: `action=\"getResourcePermission\", resourceType=\"storage\", resourceId=\"bucket-name\"`\n- List legacy gateway policies: `action=\"listPolicy\"` (returns an empty list on PG / OPA engine environments, consistent with the CLI)\n- Read user Rego: `action=\"getPolicy\"`; platform extension policy: `action=\"getPolicy\", extension=true`\n\n📌 Cross-backend boundary note: before calling, check `EnvInfo.RuntimeBackends` via `envQuery(action=\"info\", envId=...)`. `resourceType=\"noSqlDatabase\"` queries CloudBase NoSQL collection rules, which are a separate mechanism from row-level security (RLS) on CloudBase PostgreSQL (PG) tables — in the same PG environment, if NoSQL collections are still in use, querying them with this tool **remains valid**. To query PG table RLS, use `queryPgDatabase(action=\"sql\", sql=\"SELECT * FROM pg_policies WHERE tablename=...\")` instead. This tool does not cover MySQL permissions.\n\n⚠️ PostgreSQL environments: the platform `DescribeResourcePermission` API rejects PG environments outright. When `resourceType=\"function\"`, this tool automatically falls back to the Manager SDK `describeEnvAuthzConfig` (aligned with CLI `tcb policy get`, reading `authz.user.rego`). For explicit OPA policies use `listPolicy` / `getPolicy`.",
    manageTitle: "Manage CloudBase permissions and user config",
    manageDescription:
      "Manage CloudBase permissions and user config: modify resource permissions (database/functions/buckets etc.), role management, member/policy add & remove, app user CRUD, and setting gateway OPA Rego policies (aligned with CLI `tcb policy set`).\n\nExamples:\n- Set a bucket to private: `action=\"updateResourcePermission\", resourceType=\"storage\", resourceId=\"bucket-name\", permission=\"PRIVATE\"`\n- Create a role: `action=\"createRole\", roleName=\"admin\", roleIdentity=\"admin\"`\n- Open a cloud function to anonymous/unauthenticated access (PG goes through OPA, aligned with CLI `tcb policy set`): `action=\"updateResourcePermission\", resourceType=\"function\", resourceId=\"myFn\", permission=\"CUSTOM\", securityRule='{\"invoke\":true}'`\n- Set user Rego directly: `action=\"setPolicy\", regoContent=\"package authz.user\\n\\ndefault allow := false\\n\", confirm=true` (⚠️ immediately disables legacy gateway authorization)\n\nNote: `createUser` / `updateUser` are environment-side app user management capabilities, suitable for test accounts, administrators, or pre-provisioned users; they should not replace the Web SDK signup form in the browser. For frontend username/password signup use `auth.signUp({ username, password })` and for login `auth.signInWithPassword({ username, password })`. Creating username/password users directly in the browser with `auth.signUp` depends on SDK/provider support and must be verified before use; if unsupported, go through a backend or management API boundary and never expose keys in the browser. The detailed semantics of `securityRule` depend on `resourceType`: `doc._openid`, `auth.openid`, query-condition subset validation, and the `create` / `update` / `delete` JSON templates only apply to document database security rules with `resourceType=\"noSqlDatabase\"`; when configuring `function` or `storage`, refer to their official security rule docs instead of reusing NoSQL templates.\n\n📌 Cross-backend boundary note: before calling, check `EnvInfo.RuntimeBackends` via `envQuery(action=\"info\", envId=...)`:\n- `resourceType=\"noSqlDatabase\"` only affects CloudBase NoSQL document database collections; row-level permissions of CloudBase PostgreSQL (PG) tables are **not** controlled by it — for PG tables use RLS instead: run `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` and `CREATE POLICY ...` via `managePgDatabase(action=\"execute\", confirm=true)`. In the same PG environment, if NoSQL collections are still in use, continuing to use `noSqlDatabase` rules for those **collections** is correct — it does not mean \"this tool is disabled on PG environments\".\n- `resourceType=\"storage\"` controls NoSQL/COS bucket ACLs; PG `pgstore` buckets are not covered by this `resourceType`.\n- This tool does not cover MySQL; for MySQL database permissions use MySQL's own GRANT/REVOKE statements (via `manageMysqlDatabase`).\n\n⚠️ PostgreSQL environments: the platform `ModifyResourcePermission` API rejects PG environments outright. When `resourceType=\"function\"`, this tool automatically falls back to the Manager SDK `modifyEnvAuthzConfig` (aligned with CLI `tcb policy set`, writing `authz.user.rego`). `securityRule` accepts a full Rego document (`package authz.user`) or `'{\"invoke\":true}'` (auto-generates a policy allowing anonymous/unauthenticated calls to functions). Setting Rego disables legacy gateway authorization, same as the CLI. Prefer `action=\"setPolicy\"` for explicit OPA policies.",
    writeVerificationHint:
      "For collections with backend permission control like {resourceId}, after the frontend calls .doc(id).update() / .doc(id).remove(), do not just check that no exception was thrown. Explicitly verify that updated / deleted in the result is greater than 0; if result.code or result.message exists, or updated / deleted is 0, treat it as a real failure and propagate the error.",
    permissionPropagationHint:
      "Right after updating security rules for {resourceId}, backend permissions usually take effect within a few seconds to about 30 seconds. If an immediate real write still returns DATABASE_PERMISSION_DENIED, wait a few seconds and retry the same .doc(id).update() / .doc(id).remove() with the same login state; do not wait blindly for minutes, do not immediately rewrite the rules repeatedly, and do not treat an old rejection during the short propagation window as evidence that the rule expression is still wrong.",
    validateRegoEmpty: "action=setPolicy requires non-empty regoContent (aligned with CLI `tcb policy set <regoContent>`).",
    validateRegoPackage: "The Rego policy must start with `package authz.user` (see https://docs.cloudbase.net/cli-v1/policy/management ).",
    validateRegoBraces: "Unbalanced braces in the Rego policy ({={open}, }={close}). Check the syntax before calling setPolicy.",
    regoInputRequired:
      "PostgreSQL environments manage HTTP/function gateway auth via OPA Rego " +
      "(same as CLI `tcb policy set`), not ModifyResourcePermission / function security-rule JSON. " +
      "Pass either:\n" +
      "1) permission=\"CUSTOM\" with securityRule as a full Rego document starting with `package authz.user`, or\n" +
      "2) permission=\"CUSTOM\" with securityRule='{\"invoke\":true}' to generate a public-functions allow policy.\n" +
      "See https://docs.cloudbase.net/cli-v1/policy/management",
    managerNoDescribeEnvAuthz: "Current @cloudbase/manager-node does not expose permission.describeEnvAuthzConfig. Upgrade manager-node (>= 5.5.5) to align with CLI tcb policy get.",
    managerNoModifyEnvAuthz: "Current @cloudbase/manager-node does not expose permission.modifyEnvAuthzConfig. Upgrade manager-node (>= 5.5.5) to align with CLI tcb policy set.",
    managerNoDescribeResourcePolicyList: "Current @cloudbase/manager-node does not expose permission.describeResourcePolicyList. Upgrade manager-node (>= 5.5.5) to align with CLI tcb policy list.",
    pgModifyUnsupported:
      "PostgreSQL environments do not support ModifyResourcePermission. " +
      "Align with CLI `tcb policy set`: use permission=\"CUSTOM\" and pass OPA Rego " +
      "(package authz.user) or securityRule='{\"invoke\":true}' for public functions. " +
      "Underlying error: {message}",
    mustBeArray: "{label} must be an array",
    roleLookupNote:
      "If you need app-level admin override (e.g. in a CMS, admins can edit all articles while editors can only edit their own), a CUSTOM rule is usually required. A verified pattern is: make the role collection's document primary key auth.uid itself, and in the article permission write get('database.user_roles.' + auth.uid).role == 'admin' || doc.authorId == auth.uid. If the existing schema already has users / profiles / user_roles, reuse the one that exists and can be fetched directly via _id == auth.uid with get(); do not mistakenly write the collection obtained by a where({ uid }) query as get('database.users.' + auth.uid).",
    recommendedClientWritePattern:
      "For CMS articles using CUSTOM rules with app-level admin override, the frontend can keep using db.collection('{resourceId}').doc(id).update(...) / remove(...). The key is that the security rule uses the verified pattern: get('database.user_roles.' + auth.uid).role == 'admin' || doc.authorId == auth.uid, and the article document must actually contain the authorId field.",
    createRuleSummary: "The create rule should not reference doc.*, because the document does not exist yet at create time.",
    createRuleDetail:
      "CloudBase's create rule validates the written data (request.data); the document does not exist yet, so doc.* is unavailable. " +
      "Change the create rule to use only auth.* checks (e.g. auth.uid != null && auth.loginType != 'ANONYMOUS'), " +
      "or write the owner field (e.g. _openid / authorId) into request.data at write time, then validate with request.data._openid == auth.openid in the create rule. " +
      "read / update / delete rules may use doc.* to reference existing document fields, and the client's query conditions must be a subset of the rule constraints (e.g. _openid: '{openid}').",
    docIdWriteSummary: "The current security rule may be rejected by the backend in document-id write scenarios.",
    docIdWriteDetail:
      "Such rules are often written incorrectly in owner-only collections, but for the CMS article scenario where \"admins can edit all articles and editors can only edit their own\", the verified approach is to keep doc.authorId and do admin override through a separate role collection: get('database.user_roles.' + auth.uid).role == 'admin' || doc.authorId == auth.uid. Do not default to where(...), and do not rewrite the same-collection owner check as get('database.collection.' + doc._id).",
    invalidGetPathSummary: "The get() path should only contain the collection and documentId; do not concatenate field names into the path string.",
    invalidGetPathDetail:
      "Write get('database.collection.' + doc._id).fieldName instead of get('database.collection.' + doc._id + '.fieldName'). However, for CMS article permissions, do not treat get('database.collection.' + doc._id) as the default first choice; the more robust verified pattern is reading a separate role collection: get('database.user_roles.' + auth.uid).role == 'admin' || doc.authorId == auth.uid.",
    templateLiteralSummary: "CloudBase security rule expressions do not support ${...} as JS template string interpolation.",
    templateLiteralDetail:
      "In the securityRule string, use expression concatenation, e.g. get('database.user_roles.' + auth.uid).role, instead of get('database.user_roles.${auth.uid}').role. For rules needing app-level admin override like CMS articles, prefer the verified user_roles + doc.authorId pattern.",
    bucketMissing: "Storage bucket {bucket} does not exist",
    bucketsMissing: "The following storage buckets do not exist: {buckets}",
    paramRequired: "{param} is required when action={action}",
    getResourcePermissionParamsRequired: "resourceType and resourceId are required when action=getResourcePermission",
    getUserParamsRequired: "uid or username is required when action=getUser",
    updateResourcePermissionParamsRequired: "resourceType, resourceId, and permission are required when action=updateResourcePermission",
    createRoleParamsRequired: "roleName and roleIdentity are required when action=createRole",
    createUserParamsRequired: "username and password are required when action=createUser",
    policyIdsUnsupported: "action={action} does not support policyIds yet. Pass policies instead; each item must at least contain ResourceType and Resource.",
    policiesRequired: "policies is required when action={action}; each item must at least contain ResourceType and Resource.",
    setPolicyConfirmRequired: "action=setPolicy immediately disables legacy gateway authorization (aligned with CLI `tcb policy set`); you must explicitly pass confirm=true.",
    getResourcePermissionSuccess: "Resource permission retrieved successfully",
    getResourcePermissionFallbackSuccess: "Resource permission retrieved successfully (PostgreSQL environment fell back to describeEnvAuthzConfig / tcb policy get)",
    listResourcePermissionsSuccess: "Resource permission list retrieved successfully",
    listResourcePermissionsFallbackSuccess: "Resource permission list retrieved successfully (PostgreSQL environment fell back to describeEnvAuthzConfig / tcb policy get)",
    listRolesSuccess: "Role list retrieved successfully",
    getRoleSuccess: "Role details retrieved successfully",
    listUsersSuccess: "App user list retrieved successfully",
    getUserSuccess: "App user details retrieved successfully",
    listPolicyNote: "PG environments and environments with authz_engine=opa return an empty list (consistent with CLI `tcb policy list` / SDK describeResourcePolicyList). To read user Rego, use action=getPolicy.",
    listPolicySuccess: "Gateway authorization policy list retrieved successfully",
    getPolicyExtensionSuccess: "Platform extension OPA policy retrieved successfully (authz.platform.extension.rego)",
    getPolicySuccess: "User OPA policy retrieved successfully (authz.user.rego)",
    updateResourcePermissionSuccess: "Resource permission updated successfully",
    updateResourcePermissionFallbackSuccess: "Resource permission updated successfully (PostgreSQL environment fell back to modifyEnvAuthzConfig / tcb policy set)",
    createRoleSuccess: "Role created successfully",
    updateRoleSuccess: "Role updated successfully",
    deleteRolesSuccess: "Roles deleted successfully",
    createUserSuccess: "App user created successfully",
    updateUserSuccess: "App user updated successfully",
    deleteUsersSuccess: "App users deleted successfully",
    setPolicySideEffect: "Setting authz.user.rego immediately disables legacy gateway authorization.",
    setPolicySuccess: "User OPA Rego policy set successfully (legacy gateway authorization is now disabled)",
  },
);
