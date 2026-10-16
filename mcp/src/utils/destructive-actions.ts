import { t, type MessageKey } from "../i18n/index.js";

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
};

function asText(value: unknown): string | undefined {
    if (typeof value === "string" && value.trim().length > 0) {
        return value.trim();
    }
    if (typeof value === "number") {
        return String(value);
    }
    return undefined;
}

function capiParams(args: Record<string, unknown>): Record<string, unknown> {
    const params = args.params;
    if (params !== null && typeof params === "object" && !Array.isArray(params)) {
        return params as Record<string, unknown>;
    }
    return {};
}

/** DeleteItem is one match unless MgoIsMulti is set. A missing flag is not a count of 1. */
function capiDeleteItemTarget(args: Record<string, unknown>): DestructiveTarget {
    const params = capiParams(args);
    return {
        resource: asText(params.TableName),
        messageKey:
            params.MgoIsMulti === true
                ? "confirmation.message.deleteDocumentsQuery"
                : "confirmation.message.deleteDocumentsOne",
    };
}

/** DestroyEnv / DestroyPlatformEnv name the environment in params.EnvId, not the session binding. */
function capiDestroyEnvTarget(args: Record<string, unknown>): DestructiveTarget {
    return { resource: asText(capiParams(args).EnvId) };
}

/** DestroyMySQL takes EnvId only. The dialog must not invent an instance id. */
function capiDestroyMysqlTarget(): DestructiveTarget {
    return {
        resource: t("confirmation.message.mysqlThisEnv"),
        messageKey: "confirmation.message.destroyMysqlEnv",
    };
}

function capiCloudRunVersionServers(args: Record<string, unknown>): string | undefined {
    const versions = capiParams(args).SimpleVersions;
    if (!Array.isArray(versions)) {
        return undefined;
    }
    const names: string[] = [];
    for (const item of versions) {
        if (item === null || typeof item !== "object" || Array.isArray(item)) {
            continue;
        }
        const name = asText((item as Record<string, unknown>).ServerName);
        if (name && !names.includes(name)) {
            names.push(name);
        }
    }
    return names.length > 0 ? names.join(", ") : undefined;
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
};

/**
 * Whole-resource deletes that the dedicated tools already confirm, when the
 * same call arrives as `callCloudApi`. Match `service` + `Action` exactly
 * (case-insensitive, so a casing variant cannot skip the dialog). A Delete /
 * Destroy prefix is not a match: that would also stop CVM, security-group and
 * read calls.
 *
 * Cloud storage has no entry. COS is outside the `callCloudApi` service allow-list.
 * `RunCommands` and `RunSql` stay out: they carry free-form commands, not one Action.
 */
export type CapiDestructiveCall = {
    service: string;
    action: string;
    messageKey: MessageKey;
    /** Omit to confirm every call of this pair. */
    when?: (args: Record<string, unknown>) => boolean;
    target: (args: Record<string, unknown>) => DestructiveTarget;
};

export const CAPI_DESTRUCTIVE_CALLS: readonly CapiDestructiveCall[] = [
    {
        service: "tcb",
        action: "DeleteFunction",
        messageKey: "confirmation.message.deleteFunction",
        target: (args) => ({ resource: asText(capiParams(args).FunctionName) }),
    },
    {
        service: "scf",
        action: "DeleteFunction",
        messageKey: "confirmation.message.deleteFunction",
        target: (args) => ({ resource: asText(capiParams(args).FunctionName) }),
    },
    {
        service: "tcb",
        action: "DeleteTable",
        messageKey: "confirmation.message.deleteCollection",
        target: (args) => ({ resource: asText(capiParams(args).TableName) }),
    },
    {
        service: "tcb",
        action: "DeleteItem",
        messageKey: "confirmation.message.deleteDocumentsOne",
        target: capiDeleteItemTarget,
    },
    {
        service: "tcb",
        action: "DestroyEnv",
        messageKey: "confirmation.message.destroyEnv",
        target: capiDestroyEnvTarget,
    },
    {
        service: "tcb",
        action: "DestroyPlatformEnv",
        messageKey: "confirmation.message.destroyEnv",
        target: capiDestroyEnvTarget,
    },
    {
        service: "tcb",
        action: "DestroyMySQL",
        messageKey: "confirmation.message.destroyMysqlEnv",
        target: capiDestroyMysqlTarget,
    },
    {
        service: "tcbr",
        action: "DeleteCloudRunServer",
        messageKey: "confirmation.message.deleteCloudRun",
        target: (args) => ({ resource: asText(capiParams(args).ServerName) }),
    },
    {
        service: "tcbr",
        action: "DeleteCloudRunVersions",
        messageKey: "confirmation.message.deleteCloudRun",
        when: (args) => capiParams(args).IsDeleteServer === true,
        target: (args) => ({ resource: capiCloudRunVersionServers(args) }),
    },
];

export function capiDestructiveKey(service: string, action: string): string {
    return `callCloudApi.${service}.${action}`;
}

/** Keys a skip-list entry may name: `tool.action`, or `callCloudApi.service.Action`. */
export function destructiveConfirmationKeys(): string[] {
    return [
        ...Object.keys(DESTRUCTIVE_ACTIONS),
        ...CAPI_DESTRUCTIVE_CALLS.map((spec) => capiDestructiveKey(spec.service, spec.action)),
    ];
}

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

function resolveCapiDestructive(args: Record<string, unknown>): ResolvedDestructiveAction | undefined {
    const service = asText(args.service)?.toLowerCase();
    const action = asText(args.action)?.toLowerCase();
    if (!service || !action) {
        return undefined;
    }
    const matched = CAPI_DESTRUCTIVE_CALLS.find(
        (spec) => spec.service.toLowerCase() === service && spec.action.toLowerCase() === action,
    );
    if (!matched || (matched.when && !matched.when(args))) {
        return undefined;
    }
    return {
        key: capiDestructiveKey(matched.service, matched.action),
        action: matched.action,
        spec: { messageKey: matched.messageKey, target: matched.target },
    };
}

/**
 * Decide whether this call is on the confirmation list.
 * Dedicated tools match `tool.action` exactly. `callCloudApi` matches an
 * explicit `service` + `Action` pair. Neither path guesses from a name prefix.
 */
export function resolveDestructiveAction(
    toolName: string,
    args: unknown,
): ResolvedDestructiveAction | undefined {
    const record = (args ?? {}) as Record<string, unknown>;
    if (toolName === "callCloudApi") {
        return resolveCapiDestructive(record);
    }
    const action = record.action;
    if (typeof action !== "string") {
        return undefined;
    }
    const key = `${toolName}.${action}`;
    const spec = DESTRUCTIVE_ACTIONS[key];
    return spec ? { key, action, spec } : undefined;
}
