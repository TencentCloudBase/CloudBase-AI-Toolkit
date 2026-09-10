import { defineModule } from "../types.js";

export const deploy = defineModule(
  {
    planTitle: "预演 CloudBase 声明式部署计划",
    planDescription:
      "解析 cloudbaserc 并计算声明式部署计划（dry-run，不产生任何变更）。" +
      "这是 deployApply 的预演对仗工具：plan 计算、deployApply 执行同一份 cloudbaserc。" +
      "返回每个资源的动作分类：create=新建，update=覆盖更新，skip=无变更/不会执行，" +
      "conflict=检测到冲突需中断，deploy=直传覆盖。" +
      "计划已按 yes 复算为「实际会发生的动作」：不传 yes=true 时，云端已存在的函数会标为 skip" +
      "（并在 declaredStatus 保留 update），与 deployApply 的实际执行结果一致，避免预演与执行相反。" +
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
      "属于本地形态的 apply（读本地 cloudbaserc 并在本地构建上传），" +
      "是会变更云端资源的写操作，必须显式传 confirm=true 才会执行。" +
      "建议先用 deployPlan 预演，确认计划无误后再执行。" +
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
  },
  {
    planTitle: "Preview CloudBase declarative deployment plan",
    planDescription:
      "Parse cloudbaserc and compute the declarative deployment plan (dry-run, makes no changes). " +
      "This is the preview counterpart of deployApply: plan computes and deployApply executes the same cloudbaserc. " +
      "Returns an action classification per resource: create=create new, update=overwrite update, skip=no change/will not run, " +
      "conflict=conflict detected, abort, deploy=direct overwrite. " +
      "The plan is recomputed by yes into the actions that will actually happen: without yes=true, functions already in the cloud are marked skip " +
      "(with update kept in declaredStatus), consistent with deployApply's actual execution, avoiding a plan/execution mismatch." +
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
      "a local form of apply (reads the local cloudbaserc and builds/uploads locally). " +
      "It is a write operation that changes cloud resources and requires an explicit confirm=true to execute. " +
      "It is recommended to preview with deployPlan first and execute after confirming the plan." +
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
  },
);
