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
