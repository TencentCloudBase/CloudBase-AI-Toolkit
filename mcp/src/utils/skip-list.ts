/**
 * 逗号分隔的「跳过清单」解析与匹配（#1153 的破坏性确认护栏与凭证写入护栏共用）。
 *
 * 形态约定（两处保持一致）：**区分大小写、无通配**；条目可写 `工具名` 或 `工具名.action`。
 * 抽成共享函数是为了避免两份清单各写一套解析逻辑后漂移。
 */

/** 解析逗号分隔的清单；空值、空白项被丢弃。 */
export function parseSkipList(raw: string | undefined): string[] {
    if (!raw) {
        return [];
    }
    return raw
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
}

/** 本次调用是否命中清单：`工具名` 或 `工具名.action` 任一命中即算。 */
export function isSkippedByList(entries: string[], toolName: string, actionKey?: string): boolean {
    if (entries.includes(toolName)) {
        return true;
    }
    return actionKey !== undefined && entries.includes(actionKey);
}
