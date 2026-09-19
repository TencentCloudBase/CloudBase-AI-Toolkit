export type ToolPayload = Record<string, unknown>;

export type ToolNextStep = {
  tool?: string;
  action: string;
  required_params?: string[];
  suggested_args?: Record<string, unknown>;
};

/**
 * JSON.stringify replacer: convert values that JSON cannot natively serialize
 * into safe primitives. Without this, a `bigint` (e.g. a backend row-count
 * returned as bigint) would make `JSON.stringify` throw
 * `TypeError: Do not know how to serialize a BigInt`, which escapes tool
 * handlers and surfaces to the client as the opaque MCP -32603 "Internal error"
 * with no underlying message or RequestId. See issue #1060.
 */
function safeJsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (typeof value === "function") {
    return undefined;
  }
  return value;
}

export function buildJsonToolResult(payload: ToolPayload) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(payload, safeJsonReplacer, 2),
      },
    ],
  };
}

/**
 * Detect tool results that carry a business-failure payload ({ success: false, ... }).
 * Checks structuredContent, the top level, and JSON-serializable text content items.
 */
export function isBusinessFailureToolResult(result: unknown): boolean {
  if (!result || typeof result !== "object") {
    return false;
  }
  const record = result as Record<string, unknown>;
  if (record.success === false) {
    return true;
  }
  if (
    record.structuredContent &&
    typeof record.structuredContent === "object" &&
    (record.structuredContent as Record<string, unknown>).success === false
  ) {
    return true;
  }
  const content = Array.isArray(record.content) ? record.content : [];
  for (const item of content) {
    if (!item || (item as Record<string, unknown>).type !== "text") {
      continue;
    }
    const text = (item as Record<string, unknown>).text;
    if (typeof text !== "string") {
      continue;
    }
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === "object" && parsed.success === false) {
        return true;
      }
    } catch {
      // Non-JSON text payloads carry no structured success flag.
    }
  }
  return false;
}

/**
 * Ensure MCP isError=true on business-failure results so clients don't misread
 * structured { success: false } payloads as successful calls.
 */
export function withBusinessFailureIsError<T>(result: T): T {
  if (!result || typeof result !== "object") {
    return result;
  }
  const record = result as Record<string, unknown>;
  if (record.isError === true || !isBusinessFailureToolResult(result)) {
    return result;
  }
  return { ...record, isError: true } as T;
}

/**
 * 纯文本失败回执：**必须显式带 `isError: true`**。
 *
 * 为什么需要它：`withBusinessFailureIsError` 只能识别结构化的 `{ success: false }`
 * 载荷（`isBusinessFailureToolResult` 会 JSON.parse 文本内容再嗅 `success`）。工具在自己
 * 的 catch 里返回 `{ content: [{ type: "text", text }] }` 这种**纯文本**回执时，文本不是
 * JSON，嗅探不到任何失败标记 → 客户端只看到 `isError: false`，把失败当成功处理。
 *
 * 实测（F7）：`queryEnv(action="usage")` 不带 envId 时抛出的引导文案就是这样返回的，
 * 只看 `isError` 的客户端会漏判。MCP 协议里 `isError` 是唯一可靠的失败标记，别省。
 */
export function buildTextErrorResult(text: string) {
  return {
    content: [
      {
        type: "text" as const,
        text,
      },
    ],
    isError: true as const,
  };
}

export class ToolPayloadError extends Error {
  payload: ToolPayload;

  constructor(payload: ToolPayload) {
    super(typeof payload.message === "string" ? payload.message : "Tool payload error");
    this.name = "ToolPayloadError";
    this.payload = payload;
  }
}

export function isToolPayloadError(error: unknown): error is ToolPayloadError {
  return error instanceof ToolPayloadError;
}

export function toolPayloadErrorToResult(error: unknown) {
  if (!isToolPayloadError(error)) {
    return null;
  }
  return buildJsonToolResult(error.payload);
}

export function buildAuthNextStep(
  action: string,
  options?: {
    requiredParams?: string[];
    suggestedArgs?: Record<string, unknown>;
  },
): ToolNextStep {
  return {
    tool: "auth",
    action,
    required_params: options?.requiredParams,
    suggested_args: options?.suggestedArgs ?? { action },
  };
}

export function throwToolPayloadError(payload: ToolPayload): never {
  throw new ToolPayloadError(payload);
}
