export type ToolPayload = Record<string, unknown>;

export type ToolNextStep = {
  tool?: string;
  action: string;
  required_params?: string[];
  suggested_args?: Record<string, unknown>;
};

export function buildJsonToolResult(payload: ToolPayload) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(payload, null, 2),
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
