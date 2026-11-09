import { defineModule } from "../types.js";

export const deploy = defineModule(
  {
    buildTitle: "构建声明式配置中的静态托管项目（本地构建）",
    buildDescription:
      "解析 cloudbaserc 并对 hosting[] 中配置了 buildCommand 的项目执行本地构建（仅执行 buildCommand，不安装依赖、不上传）。" +
      "只处理 hosting[]，不处理 cloudbaserc 的 app 资源 —— app 的产物需要你自己在项目目录构建" +
      "（产物目录与构建命令可从 deployPlan 的 buildHint 读取），或改用 CLI `tcb app deploy` 走云端构建。" +
      "声明式 hosting 部署拆分为「build → plan → apply」三步，本工具是第一步：" +
      "先本地构建产物，再 deployPlan 预演，最后 deployApply 上传产物。" +
      "deployApply 对 app 与 hosting 都不构建 —— 产物缺失时报 BUILD_OUTPUT_NOT_FOUND，" +
      "hosting 可用本工具补齐，app 需你自行构建。" +
      "纯静态托管（未配置 buildCommand 且无法探测框架）自动跳过。" +
      "构建为纯本地操作：不解析环境、不要求登录，也不需要 confirm。" +
      "\n- cwd：项目根目录，默认当前工作目录" +
      "\n- mode：环境名，命中 envOverrides.<mode> 时合并对应的多环境覆盖配置",
    planTitle: "预演 CloudBase 声明式部署计划",
    planDescription:
      "解析 cloudbaserc 并计算声明式部署计划（dry-run，不产生任何变更）。" +
      "这是 deployApply 的预演对仗工具：plan 计算、deployApply 执行同一份 cloudbaserc。" +
      "返回每个资源的动作分类：create=新建，update=覆盖更新，skip=无变更/不会执行，" +
      "conflict=检测到冲突需中断，deploy=直传覆盖。" +
      "计划已按 yes 复算为「实际会发生的动作」：不传 yes=true 时，云端已存在的函数会标为 skip" +
      "（并在 declaredStatus 保留 update），与 deployApply 的实际执行结果一致，避免预演与执行相反。" +
      "\n⚠️ app / hosting 的计划项一律是「直传已有产物」：声明式部署只部署不构建，" +
      "cloudbaserc 的 buildCommand / framework 只用于推断产物目录，不会被执行。" +
      "\napp / hosting 的计划项带 buildHint = { buildCommand, outputDir, artifactReady }（机器可读，" +
      "不要去解析 details 里的中文文案）：artifactReady=false 表示产物目录缺失或为空，" +
      "此时 deployApply 必定失败（BUILD_OUTPUT_NOT_FOUND）。正确做法是先构建再 apply —— " +
      "hosting 可调用 deployBuild；app 需在项目目录执行 buildHint.buildCommand（为 null 则本就无需构建）。" +
      "构建完成后重新 deployPlan 确认 artifactReady=true，不要改配置绕过。" +
      "\n适用边界：本工具用于项目级声明式编排（一份 cloudbaserc 统一 plan/apply）；" +
      "单资源临时直传请用 manageFunctions/manageHosting/manageApps。" +
      "\n- cwd：项目根目录，默认当前工作目录" +
      "\n- mode：环境名，命中 envOverrides.<mode> 时合并对应的多环境覆盖配置" +
      "\n- envId：目标环境 ID，优先级高于 cloudbaserc 中的 envId；不传则用配置值或当前绑定环境" +
      "\n- only：仅计算指定资源类型的计划" +
      "\n- skip：跳过指定资源类型" +
      "\n- yes：与 deployApply 的 yes 对齐，用于复算已存在函数的有效动作。" +
      "true=预演为覆盖更新(update)；false（默认）=预演为保守跳过(skip)",
    applyTitle: "执行 CloudBase 声明式部署（本地 apply）",
    applyDescription:
      "解析 cloudbaserc 并按 database→functions→app→hosting→gateway 顺序执行声明式部署。" +
      "这是 deployPlan 的执行对仗工具（plan 预演 / deployApply 执行同一份 cloudbaserc），" +
      "属于本地形态的 apply（读本地 cloudbaserc 并把本地产物上传到云端），" +
      "是会变更云端资源的写操作，必须显式传 confirm=true 才会执行。" +
      "建议先用 deployPlan 预演，确认计划无误后再执行。" +
      "\n⚠️ 只部署不构建：本工具不会执行任何构建命令（app 与 hosting 都不会）。" +
      "cloudbaserc 里的 buildCommand / installCommand / framework 只用于推断产物目录，不会被执行。" +
      "产物目录不存在或为空时报 BUILD_OUTPUT_NOT_FOUND —— hosting 先调 deployBuild，" +
      "app 需让用户在项目目录执行其构建命令，完成后重试，不要改配置绕过。" +
      "构建前可用 deployPlan 读取 buildHint.buildCommand / outputDir / artifactReady 确认该跑什么。" +
      "app 需要云端构建时用 CLI `tcb app deploy`（本工具不提供云端构建）。" +
      "\n适用边界：本工具用于项目级声明式编排（一份 cloudbaserc 统一 plan/apply）；" +
      "单资源临时直传请用 manageFunctions/manageHosting/manageApps。" +
      "\n- confirm：必须显式传 true 才执行部署，否则直接拒绝" +
      "\n- confirmDestructive：当本次待执行的数据库迁移含破坏性语句（DROP/TRUNCATE/DELETE、" +
      "ALTER…DROP/RENAME）时，除 confirm 外还必须显式传 confirmDestructive=true 才会执行；" +
      "否则拒绝并列出命中的迁移与语句。无破坏性迁移时该参数不生效" +
      "\n- cwd：项目根目录，默认当前工作目录" +
      "\n- mode：环境名，命中 envOverrides.<mode> 时合并对应的多环境覆盖配置" +
      "\n- envId：目标环境 ID，优先级高于 cloudbaserc 中的 envId；不传则用配置值或当前绑定环境" +
      "\n- only：仅部署指定资源类型" +
      "\n- skip：跳过指定资源类型" +
      "\n- yes：遇到已存在资源时的处理方式。true=直接覆盖更新；false（默认）=保守跳过，" +
      "在无法交互确认的场景下已存在资源不会被覆盖（与 deployPlan 的 yes 语义一致）" +
      "\n- concurrency：同类型资源最大并行数，默认 1（串行）" +
      "\n- continueOnError：某个资源失败后继续部署其余资源（database 失败仍强制中断）",
    configNotFound:
      "未在 {cwd} 找到 cloudbaserc 配置文件（支持 json/yaml/yml/js）",
    envUnresolved:
      "未能确定部署环境 ID：请在 cloudbaserc 配置 envId、通过 envId 参数指定，或先登录并绑定环境。",
    configInvalid: "cloudbaserc 配置校验未通过：{detail}",
    invalidConcurrency: "无效的并发数 {concurrency}，应为不小于 1 的整数",
    planSkipExistingFn:
      "已存在函数 {fnName}：未传 yes=true，执行时将保守跳过（不覆盖）。传 yes=true 才会覆盖更新。",
    planGenerated: "已生成声明式部署计划",
    confirmRequired:
      "部署会变更云端资源，必须显式传 confirm=true 才会执行。建议先用 deployPlan 预演部署计划，确认无误后再执行。",
    destructiveConfirmRequired:
      "本次待执行的数据库迁移包含破坏性语句（DROP/TRUNCATE/DELETE 或 ALTER…DROP/RENAME），" +
      "可能造成数据/结构不可逆丢失。请先备份或复核，确认后额外传 confirmDestructive=true 再执行。" +
      "命中迁移：{items}",
    destructiveMigrationItem: "{migration}（{count} 条破坏性语句）",
    applied: "声明式部署已执行",

    // ---- Schema parameter descriptions ----
    "schema.build.cwd": "项目根目录，从此目录向下搜索 cloudbaserc；默认当前工作目录",
    "schema.build.mode": "环境名（如 production/staging），命中 envOverrides.<mode> 时合并覆盖",
    "schema.plan.cwd": "项目根目录，从此目录向下搜索 cloudbaserc；默认当前工作目录",
    "schema.plan.mode": "环境名（如 production/staging），命中 envOverrides.<mode> 时合并覆盖",
    "schema.plan.envId": "目标环境 ID，优先级高于 cloudbaserc 中的 envId；不传则用配置值或当前绑定环境",
    "schema.plan.only": "仅计算指定资源类型的计划，可选值：database/functions/app/hosting/gateway",
    "schema.plan.skip": "跳过指定资源类型，可选值：database/functions/app/hosting/gateway",
    "schema.plan.yes": "与 deployApply 的 yes 对齐，用于复算已存在函数的有效动作。true=预演为覆盖更新；false（默认）=预演为保守跳过",
    "schema.apply.confirm": "危险操作确认开关。部署会变更云端资源，必须显式传 confirm=true 才会执行",
    "schema.apply.confirmDestructive": "破坏性数据库变更确认开关。当待执行迁移含 DROP/TRUNCATE/DELETE 或 ALTER…DROP/RENAME 时，必须在 confirm=true 之外额外显式传 confirmDestructive=true；无破坏性迁移时不生效",
    "schema.apply.cwd": "项目根目录，从此目录向下搜索 cloudbaserc；默认当前工作目录",
    "schema.apply.mode": "环境名（如 production/staging），命中 envOverrides.<mode> 时合并覆盖",
    "schema.apply.envId": "目标环境 ID，优先级高于 cloudbaserc 中的 envId；不传则用配置值或当前绑定环境",
    "schema.apply.only": "仅部署指定资源类型，可选值：database/functions/app/hosting/gateway",
    "schema.apply.skip": "跳过指定资源类型，可选值：database/functions/app/hosting/gateway",
    "schema.apply.yes": "遇到已存在资源时是否直接覆盖更新。true=覆盖；false（默认）=保守跳过已存在资源",
    "schema.apply.concurrency": "同类型资源最大并行数，默认 1（串行）；仅作用于同类型资源，跨类型依赖顺序不变",
    "schema.apply.continueOnError": "某个资源失败后是否继续部署其余资源；database 失败始终强制中断",
  },
  {
    buildTitle: "Build static hosting projects declared in the config (local build)",
    buildDescription:
      "Parses cloudbaserc and runs a local build for every hosting[] item that declares a buildCommand (only buildCommand runs — no dependency install, no upload)." +
      " It only handles hosting[] and does NOT handle the cloudbaserc app resource — app artifacts must be built by you in the project directory" +
      " (read the build command and output directory from deployPlan's buildHint), or use the CLI `tcb app deploy` for a cloud build instead." +
      " Declarative hosting deployment is split into three steps — build → plan → apply — and this tool is the first one:" +
      " build the artifacts locally, preview with deployPlan, then upload them with deployApply." +
      " deployApply builds neither app nor hosting — missing artifacts fail with BUILD_OUTPUT_NOT_FOUND;" +
      " for hosting run this tool, for app build it yourself." +
      " Pure static hosting (no buildCommand and no detectable framework) is skipped automatically." +
      " The build is a purely local operation: it resolves no environment, requires no login and needs no confirm." +
      "\n- cwd: project root, defaults to the current working directory" +
      "\n- mode: environment name; when it matches envOverrides.<mode> the corresponding multi-environment overrides are merged",
    planTitle: "Preview CloudBase declarative deployment plan",
    planDescription:
      "Parse cloudbaserc and compute the declarative deployment plan (dry-run, makes no changes). " +
      "This is the preview counterpart of deployApply: plan computes and deployApply executes the same cloudbaserc. " +
      "Returns an action classification per resource: create=create new, update=overwrite update, skip=no change/will not run, " +
      "conflict=conflict detected, abort, deploy=direct overwrite. " +
      "The plan is recomputed by yes into the actions that will actually happen: without yes=true, functions already in the cloud are marked skip " +
      "(with update kept in declaredStatus), consistent with deployApply's actual execution, avoiding a plan/execution mismatch." +
      "\n⚠️ app / hosting plan items are always a direct upload of existing artifacts: declarative deploy deploys but never builds; " +
      "buildCommand / framework in cloudbaserc are only used to infer the output directory and are never executed." +
      "\napp / hosting plan items carry buildHint = { buildCommand, outputDir, artifactReady } (machine-readable — " +
      "do not parse the localized text in details): artifactReady=false means the output directory is missing or empty, " +
      "and deployApply is guaranteed to fail (BUILD_OUTPUT_NOT_FOUND). Build first, then apply — " +
      "for hosting call deployBuild; for app run buildHint.buildCommand in the project directory (null means no build is needed). " +
      "Re-run deployPlan afterwards to confirm artifactReady=true; do not edit the config to work around it." +
      "\nScope: this tool is for project-level declarative orchestration (one cloudbaserc for unified plan/apply); " +
      "for ad-hoc single-resource direct upload use manageFunctions/manageHosting/manageApps." +
      "\n- cwd: project root, defaults to the current working directory" +
      "\n- mode: environment name; when it matches envOverrides.<mode>, the corresponding multi-environment overrides are merged" +
      "\n- envId: target environment ID, takes priority over envId in cloudbaserc; if omitted, the config value or the currently bound environment is used" +
      "\n- only: compute the plan for the specified resource types only" +
      "\n- skip: skip the specified resource types" +
      "\n- yes: aligned with deployApply's yes, used to recompute the effective action for existing functions. " +
      "true=previewed as overwrite update (update); false (default)=previewed as conservative skip (skip)",
    applyTitle: "Execute CloudBase declarative deployment (local apply)",
    applyDescription:
      "Parse cloudbaserc and execute the declarative deployment in the order database→functions→app→hosting→gateway. " +
      "This is the execution counterpart of deployPlan (plan previews / deployApply executes the same cloudbaserc), " +
      "a local form of apply (reads the local cloudbaserc and uploads local artifacts to the cloud). " +
      "It is a write operation that changes cloud resources and requires an explicit confirm=true to execute. " +
      "It is recommended to preview with deployPlan first and execute after confirming the plan." +
      "\n⚠️ Deploys but never builds: this tool runs no build command at all (neither app nor hosting). " +
      "buildCommand / installCommand / framework in cloudbaserc are only used to infer the output directory and are never executed. " +
      "A missing or empty output directory fails with BUILD_OUTPUT_NOT_FOUND — for hosting call deployBuild first, " +
      "for app ask the user to run its build command in the project directory, then retry; do not edit the config to work around it. " +
      "Before building, read buildHint.buildCommand / outputDir / artifactReady from deployPlan to see what needs to run. " +
      "When app needs a cloud build, use the CLI `tcb app deploy` (this tool provides no cloud build)." +
      "\nScope: this tool is for project-level declarative orchestration (one cloudbaserc for unified plan/apply); " +
      "for ad-hoc single-resource direct upload use manageFunctions/manageHosting/manageApps." +
      "\n- confirm: must be explicitly true to execute the deployment, otherwise it is rejected" +
      "\n- confirmDestructive: when the pending database migrations contain destructive statements (DROP/TRUNCATE/DELETE, " +
      "ALTER…DROP/RENAME), besides confirm, confirmDestructive=true must also be explicitly passed to execute; " +
      "otherwise it is rejected and the matched migrations and statements are listed. This parameter has no effect when there are no destructive migrations" +
      "\n- cwd: project root, defaults to the current working directory" +
      "\n- mode: environment name; when it matches envOverrides.<mode>, the corresponding multi-environment overrides are merged" +
      "\n- envId: target environment ID, takes priority over envId in cloudbaserc; if omitted, the config value or the currently bound environment is used" +
      "\n- only: deploy only the specified resource types" +
      "\n- skip: skip the specified resource types" +
      "\n- yes: how to handle existing resources. true=overwrite directly; false (default)=conservatively skip; " +
      "in non-interactive scenarios existing resources will not be overwritten (same semantics as deployPlan's yes)" +
      "\n- concurrency: maximum parallelism for resources of the same type, default 1 (serial)" +
      "\n- continueOnError: continue deploying the remaining resources after one fails (a database failure still aborts)",
    configNotFound:
      "cloudbaserc config file not found under {cwd} (json/yaml/yml/js supported)",
    envUnresolved:
      "Unable to determine the deployment environment ID: set envId in cloudbaserc, pass it via the envId parameter, or log in and bind an environment first.",
    configInvalid: "cloudbaserc config validation failed: {detail}",
    invalidConcurrency:
      "Invalid concurrency {concurrency}; it must be an integer no less than 1",
    planSkipExistingFn:
      "Function {fnName} already exists: without yes=true, it will be conservatively skipped at execution time (not overwritten). Pass yes=true to overwrite and update.",
    planGenerated: "Declarative deployment plan generated",
    confirmRequired:
      "Deployment changes cloud resources; an explicit confirm=true is required to execute. It is recommended to preview the deployment plan with deployPlan first and execute after confirming.",
    destructiveConfirmRequired:
      "The database migrations to be executed this time contain destructive statements (DROP/TRUNCATE/DELETE or ALTER…DROP/RENAME), " +
      "which may cause irreversible data/structure loss. Back up or review first, then pass confirmDestructive=true additionally to execute. " +
      "Matched migrations: {items}",
    destructiveMigrationItem: "{migration} ({count} destructive statements)",
    applied: "Declarative deployment executed",

    // ---- Schema parameter descriptions ----
    "schema.build.cwd": "Project root directory; cloudbaserc is searched below it. Defaults to the current working directory.",
    "schema.build.mode": "Environment name, such as production/staging. Matching envOverrides.<mode> values are merged.",
    "schema.plan.cwd": "Project root directory; cloudbaserc is searched below it. Defaults to the current working directory.",
    "schema.plan.mode": "Environment name, such as production/staging. Matching envOverrides.<mode> values are merged.",
    "schema.plan.envId": "Target environment ID. Takes precedence over envId in cloudbaserc; when omitted, uses the config value or currently bound environment.",
    "schema.plan.only": "Compute the plan only for specified resource types: database/functions/app/hosting/gateway.",
    "schema.plan.skip": "Skip specified resource types: database/functions/app/hosting/gateway.",
    "schema.plan.yes": "Aligned with deployApply yes and used to recompute the effective action for existing functions. true previews overwrite update; false (default) previews conservative skip.",
    "schema.apply.confirm": "Dangerous-operation confirmation. Deployment changes cloud resources and requires explicit confirm=true.",
    "schema.apply.confirmDestructive": "Destructive database change confirmation. When pending migrations contain DROP/TRUNCATE/DELETE or ALTER…DROP/RENAME, explicitly pass confirmDestructive=true in addition to confirm=true. It has no effect without destructive migrations.",
    "schema.apply.cwd": "Project root directory; cloudbaserc is searched below it. Defaults to the current working directory.",
    "schema.apply.mode": "Environment name, such as production/staging. Matching envOverrides.<mode> values are merged.",
    "schema.apply.envId": "Target environment ID. Takes precedence over envId in cloudbaserc; when omitted, uses the config value or currently bound environment.",
    "schema.apply.only": "Deploy only specified resource types: database/functions/app/hosting/gateway.",
    "schema.apply.skip": "Skip specified resource types: database/functions/app/hosting/gateway.",
    "schema.apply.yes": "Whether to overwrite existing resources directly. true overwrites; false (default) conservatively skips existing resources.",
    "schema.apply.concurrency": "Maximum parallelism for resources of the same type. Defaults to 1 (serial); dependency order across resource types is unchanged.",
    "schema.apply.continueOnError": "Whether to continue deploying remaining resources after one fails; database failures always abort.",
  },
);
