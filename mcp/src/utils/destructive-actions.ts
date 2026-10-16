import { t, type MessageKey } from "../i18n/index.js";
import { getSqlVerb, isDestructiveSql, splitSqlStatements, stripLeadingSqlComments } from "./sql-risk.js";

/**
 * 破坏性动作的**单一真源**。
 *
 * 为什么需要它：MCP 注解（`destructiveHint`）是**工具级**的，而破坏性动作是**工具内的 action** ——
 * `manageFunctions` 里 `queryFunctions`（读）与 `deleteFunction`（删）只能共用一个注解值，
 * 模型与客户端都看不出"这一次调用要删东西"。所以名单必须按 `工具名.action` 单独维护。
 *
 * 两条约束：
 *   1. **只放"执行前确认"的触发面**，不放"值得记一笔"的一切写操作 —— 名单越大，误伤越多；
 *   2. 名字像破坏性、但有意不确认的，必须写进 `DESTRUCTIVE_EXEMPT_ACTIONS` **并给理由**，
 *      由 `destructive-actions.test.ts` 保证"既不登记、也不豁免"的动作会让测试变红。
 */

/**
 * 谓词触发面：有些动作**只有参数确实危险时**才该确认（典型是 SQL —— `execute` 里既可能跑
 * `SELECT` 也可能跑 `DELETE`，只看 action 名会把两者一起拦下）。
 *
 * 约定：`when` 返回 `false` ⇒ **这次调用不命中**，按未登记处理（既不弹确认、也不走拦截返回）；
 * 省略 `when` ⇒ 与既有条目一致（命中 action 即触发）。谓词必须是纯函数、只看参数，不读文件/不联网。
 */
export type DestructiveActionPredicate = (args: Record<string, unknown>) => boolean;

/** 需要用户核对的信息：只取标识类字段，密钥类一律不取 */
export type DestructiveTarget = {
    /** 资源标识（云函数名 / 集合名 / 存储路径 / 服务名 / 实例 ID） */
    resource?: string;
    /** 批量操作的数量。只有入参里真有条数时才填，不要用缺省值冒充 */
    count?: number;
    /** 同一 action 有不止一种诚实说法时，覆盖 spec.messageKey */
    messageKey?: MessageKey;
};

export type DestructiveActionSpec = {
    /** 确认文案的词典 key（文案里必须带 {resource}） */
    messageKey: MessageKey;
    /** 从入参抽"这次要动什么"；取不到时返回占位，不抛错 */
    target: (args: Record<string, unknown>) => DestructiveTarget;
    /** 可选的参数谓词：只有它返回 true 时这次调用才命中（见类型注释） */
    when?: DestructiveActionPredicate;
};

// ---- PostgreSQL：按**参数里的 SQL** 判定，而不是按 action 名 ----

/** 语句预览长度上限：确认框里要能看清"是哪条语句"，又不至于把整段脚本倒进去 */
const SQL_PREVIEW_MAX = 240;

function asSqlText(value: unknown): string {
    return typeof value === "string" ? value : "";
}

function sqlPreview(statement: string): string {
    const flattened = statement.replace(/\s+/g, " ").trim();
    return flattened.length > SQL_PREVIEW_MAX
        ? `${flattened.slice(0, SQL_PREVIEW_MAX)}…`
        : flattened;
}

/**
 * 从 SQL 脚本里挑出**需要确认的**语句。判据复用 `sql-risk.ts` 的 `isDestructiveSql`
 * （DROP / TRUNCATE / DELETE / ALTER…DROP|RENAME），再按调用点的**范围**收窄：
 *   - 交互式 `execute`：**DELETE 要拦**；DDL 类（DROP / TRUNCATE / ALTER…DROP）只在
 *     `allowDdlViaExecute === true` 时才可能执行，所以那时才拦（默认 false 时 DDL 走 migration，
 *     在那边拦）；
 *   - `applyMigration`：只拦 DDL 类（迁移里的 DELETE 不额外确认 —— 它是迁移的正常内容，
 *     而 Booker 给的清单就是 DROP / TRUNCATE / ALTER…DROP）。
 * `ALTER … RENAME` 在 `isDestructiveSql` 里也算破坏性，但它不改数据、也不在清单里，这里不收。
 */
function pgDestructiveStatements(
    args: Record<string, unknown>,
    scope: { allowDelete: boolean; allowDdl: boolean },
): string[] {
    const sqlText = asSqlText(args.sql);
    if (!sqlText.trim()) {
        return [];
    }
    return splitSqlStatements(sqlText).filter((statement) => {
        if (!isDestructiveSql(statement)) {
            return false;
        }
        const normalized = stripLeadingSqlComments(statement);
        const verb = getSqlVerb(normalized);
        if (verb === "DELETE") {
            return scope.allowDelete;
        }
        if (verb === "ALTER") {
            return scope.allowDdl && /\bDROP\b/i.test(normalized);
        }
        return scope.allowDdl && (verb === "DROP" || verb === "TRUNCATE");
    });
}

function pgExecuteDestructiveStatements(args: Record<string, unknown>): string[] {
    return pgDestructiveStatements(args, {
        allowDelete: true,
        allowDdl: args.allowDdlViaExecute === true,
    });
}

function pgApplyMigrationDestructiveStatements(args: Record<string, unknown>): string[] {
    return pgDestructiveStatements(args, { allowDelete: false, allowDdl: true });
}

/**
 * **`rollbackSql` 有意不扫**（按裁定先判定再决定，结论：它不该被拦）。
 *
 * 判定依据（看代码，不靠印象）：`args.rollbackSql` 只在 `databasePG.ts:2443` 与 `:2593`
 * 被**存进迁移记录**（`pending.Rollback = args.rollbackSql`，类型见 `:766` `Rollback?: string`），
 * 全仓**没有任何路径执行它**——没有读 `.Rollback` 去执行的地方，也没有 migration down / rollback
 * 动作；`repairMigration` 的 `reverted` 分支（`:3218-3224`）只改 `Status`，`applied` 分支传的是
 * 修复用的 `Query`（正向前进 SQL），都不是回滚脚本。
 *
 * 所以本次调用**不会执行** rollbackSql ⇒ 因它拦下这次 forward apply 是**误报**，不收。
 * 后续项：将来若新增"真正执行回滚"的入口（例如 migration down / rollback 动作），
 * 那个入口必须挂同一道闸（`when` 判 `rollbackSql`，范围同 ②）。
 */

function statementsTarget(statements: string[]): DestructiveTarget {
    const first = statements[0];
    return {
        resource: first ? sqlPreview(first) : undefined,
        ...(statements.length > 1 ? { count: statements.length } : {}),
    };
}

function asText(value: unknown): string | undefined {
    if (typeof value === "string" && value.trim().length > 0) {
        return value.trim();
    }
    if (typeof value === "number") {
        return String(value);
    }
    return undefined;
}

/**
 * Document delete is keyed by `query` plus `isMulti`, not by a count.
 * `isMulti: true` removes every match; otherwise the API removes one match.
 * A `documents` array on this action is ignored by the handler, so it must not become a count.
 */
function documentDeleteTarget(args: Record<string, unknown>): DestructiveTarget {
    return {
        resource: asText(args.collectionName),
        messageKey:
            args.isMulti === true
                ? "confirmation.message.deleteDocumentsQuery"
                : "confirmation.message.deleteDocumentsOne",
    };
}

/** DestroyMySQL is scoped to the environment. `dbInstance` is an object, and only `instanceId` names it. */
function mysqlDestroyTarget(args: Record<string, unknown>): DestructiveTarget {
    const value = args.dbInstance;
    const instanceId =
        asText(value) ??
        (value !== null && typeof value === "object" && !Array.isArray(value)
            ? asText((value as Record<string, unknown>).instanceId)
            : undefined);
    if (instanceId) {
        return { resource: instanceId };
    }
    return {
        resource: t("confirmation.message.mysqlThisEnv"),
        messageKey: "confirmation.message.destroyMysqlEnv",
    };
}

/** @todo 第一批：整资源删除（资源本身消失、影响面大且难自愈） */
export const DESTRUCTIVE_ACTIONS: Readonly<Record<string, DestructiveActionSpec>> = {
    "manageFunctions.deleteFunction": {
        messageKey: "confirmation.message.deleteFunction",
        target: (args) => ({ resource: asText(args.functionName) }),
    },
    "writeNoSqlDatabaseStructure.deleteCollection": {
        messageKey: "confirmation.message.deleteCollection",
        target: (args) => ({ resource: asText(args.collectionName) }),
    },
    "writeNoSqlDatabaseContent.delete": {
        messageKey: "confirmation.message.deleteDocumentsOne",
        target: documentDeleteTarget,
    },
    "manageStorage.delete": {
        messageKey: "confirmation.message.deleteStorage",
        target: (args) => ({ resource: asText(args.cloudPath) }),
    },
    "manageCloudRun.delete": {
        messageKey: "confirmation.message.deleteCloudRun",
        target: (args) => ({ resource: asText(args.serverName) }),
    },
    "manageMysqlDatabase.destroyMySQL": {
        messageKey: "confirmation.message.destroyMysql",
        target: mysqlDestroyTarget,
    },

    // 谓词型（参数里确实有破坏性 SQL 才拦）：
    "managePgDatabase.execute": {
        messageKey: "confirmation.message.pgExecuteDestructiveSql",
        when: (args) => pgExecuteDestructiveStatements(args).length > 0,
        target: (args) => statementsTarget(pgExecuteDestructiveStatements(args)),
    },
    "managePgDatabase.applyMigration": {
        messageKey: "confirmation.message.pgApplyMigrationDestructive",
        when: (args) => pgApplyMigrationDestructiveStatements(args).length > 0,
        target: (args) => statementsTarget(pgApplyMigrationDestructiveStatements(args)),
    },
};

/**
 * 名字像破坏性、但**有意不做执行前确认**的动作。每条都要写理由。
 *
 * 两类理由：① 可重建 / 影响面小，误删代价低；② 风险性质不同、需换别的手段（见 PLAN 的 D 系列决策）。
 */
export const DESTRUCTIVE_EXEMPT_ACTIONS: Readonly<Record<string, string>> = {
    "envDomainManagement.delete":
        "删安全域名只改浏览器 CORS 白名单，可随时重新添加；不动数据、也不下线任何访问入口。",
    "manageEnv.removeSecurityDomain": "同上（安全域名＝CORS 白名单，可重建）。",
    "manageFunctions.deleteFunctionTrigger":
        "触发器可在控制台重建；且它常随函数一起消失，删函数本身已确认。",
    "manageFunctions.deleteLayerVersion": "层版本可重新发布，误删不丢源码。",
    "manageHosting.delete": "静态托管可重新部署恢复（源码在本地/仓库里）。",
    "manageGateway.deleteRoute": "路由可重新绑定，不影响数据。",
    "manageGateway.deleteCustomDomain": "自定义域名可重新绑定（证书与解析另有来源）。",
    "manageAgents.deleteAgent": "Agent 配置可重建；第二批候选（待第一批的真实读数）。",
    "manageAppAuth.deleteProvider": "登录渠道配置可重建；第二批候选。",
    "manageAppAuth.deleteApiKey":
        "密钥可重新签发；第二批候选 —— 删掉会让已上线的集成立刻中断，需要单独评估。",
    "manageApps.deleteAppVersion": "版本可重新发布；第二批候选。",
    "manageApps.deleteApp": "应用记录可重建；第二批候选 —— 删应用会中断线上入口，需要单独评估。",
    "managePermissions.deleteRoles":
        "风险是把自己锁在外面，确认框解决不了这个问题；按 PLAN D4 单独评估（应改为删除前校验剩余管理员）。",
    "managePermissions.removeRoleMembers": "同上（权限类，另立项处理）。",
    "managePermissions.removeRolePolicies": "同上（权限类，另立项处理）。",
    "managePermissions.deleteUsers": "同上（权限类，另立项处理）。",
};

/** 动作名是否"看起来会破坏东西"：守卫测试据此找出未登记项 */
export const DESTRUCTIVE_NAME_PATTERN = /^(delete|destroy|drop|remove|truncate|clear)/i;

export type ResolvedDestructiveAction = {
    /** `工具名.action` */
    key: string;
    action: string;
    spec: DestructiveActionSpec;
};

/**
 * 判断这次调用是否命中名单。两个触发面，**都不做模糊匹配** ——
 * 名单是可审计的，猜出来的"像破坏性"会在评审里失去意义：
 *   1. **按 action**：`DESTRUCTIVE_ACTIONS` 里有 `工具名.action` 即命中；
 *   2. **按参数谓词**：条目带 `when` 时，还要它返回 true 才算命中（SQL 这类"同名 action 下
 *      既可能读也可能删"的场景靠它区分）。
 */
export function resolveDestructiveAction(
    toolName: string,
    args: unknown,
): ResolvedDestructiveAction | undefined {
    const action = (args as Record<string, unknown> | undefined)?.action;
    if (typeof action !== "string") {
        return undefined;
    }
    const key = `${toolName}.${action}`;
    const spec = DESTRUCTIVE_ACTIONS[key];
    if (!spec) {
        return undefined;
    }
    if (spec.when && spec.when((args ?? {}) as Record<string, unknown>) !== true) {
        return undefined;
    }
    return { key, action, spec };
}
