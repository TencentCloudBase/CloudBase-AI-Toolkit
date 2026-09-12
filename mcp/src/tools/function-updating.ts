/**
 * Guidance + bounded wait when a cloud function is not Active.
 * SCF rejects UpdateFunctionConfiguration / UpdateFunctionCode while Status=Updating.
 */

import { t } from "../i18n/index.js";

export const FUNCTION_UPDATING_ERROR_CODE = "FUNCTION_UPDATING";

/** Agents must wait at least this long before retrying the same write. */
export const FUNCTION_UPDATING_RETRY_AFTER_SECONDS = 10;

export const FUNCTION_BUSY_STATUSES = [
  "Updating",
  "Creating",
  "Publishing",
  "Deleting",
] as const;

export type FunctionBusyStatus = (typeof FUNCTION_BUSY_STATUSES)[number];

export const FUNCTION_UPDATING_WAIT = {
  intervalMs: 2000,
  maxAttempts: 5,
  timeoutMs: 12_000,
} as const;

export type FunctionUpdatingNextAction = {
  tool: string;
  action: string;
  reason: string;
  suggested_args?: Record<string, unknown>;
};

export type FunctionUpdatingPayload = {
  success: false;
  errorCode: typeof FUNCTION_UPDATING_ERROR_CODE;
  retryAfterSeconds: number;
  message: string;
  data: Record<string, unknown>;
  nextActions: FunctionUpdatingNextAction[];
};

/**
 * Injectable sleep for unit tests. Production uses setTimeout.
 * Tests must restore the original function in afterEach.
 */
export const functionUpdatingRuntime = {
  sleep: (ms: number) =>
    new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    }),
};

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function isFunctionBusyStatus(status: unknown): status is FunctionBusyStatus {
  if (typeof status !== "string") {
    return false;
  }
  return (FUNCTION_BUSY_STATUSES as readonly string[]).includes(status);
}

const UPDATING_ERROR_PATTERNS = [
  /当前函数处于\s*Updating/i,
  /函数处于\s*Updating/i,
  /currently\s+(?:in\s+)?updating/i,
  /function\s+is\s+(?:currently\s+)?updating/i,
  /Status\s*(?:is|=|:)?\s*Updating/i,
  /scf\/UpdateFunction(?:Configuration|Code).{0,80}Updating/i,
  /函数状态异常，检查超时/,
];

export function isFunctionUpdatingError(error: unknown): boolean {
  const message = getErrorMessage(error);
  return UPDATING_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

export function buildFunctionUpdatingMessage(params: {
  action: string;
  functionName?: string;
  status?: string;
  rawMessage?: string;
}): string {
  const namePart = params.functionName
    ? t("functionUpdating.namedFn", { fnName: params.functionName })
    : t("functionUpdating.targetFn");
  const statusPart = params.status
    ? t("functionUpdating.statusSuffix", { status: params.status })
    : "";
  const lines = [
    t("functionUpdating.notReady", {
      namePart,
      statusPart,
      action: params.action,
    }),
    t("functionUpdating.doNotRetryImmediately"),
    t("functionUpdating.waitAndRetry", {
      seconds: FUNCTION_UPDATING_RETRY_AFTER_SECONDS,
    }),
  ];
  if (params.rawMessage) {
    lines.push(t("functionUpdating.rawError", { message: params.rawMessage }));
  }
  return lines.join("\n");
}

export function buildFunctionUpdatingNextActions(params: {
  action: string;
  functionName?: string;
}): FunctionUpdatingNextAction[] {
  const functionName = params.functionName;
  return [
    {
      tool: "queryFunctions",
      action: "getFunctionDetail",
      reason: t("functionUpdating.reasonCheckStatus"),
      suggested_args: {
        action: "getFunctionDetail",
        ...(functionName ? { functionName } : {}),
      },
    },
    {
      tool: "manageFunctions",
      action: params.action,
      reason: t("functionUpdating.reasonRetryAfterWait", {
        seconds: FUNCTION_UPDATING_RETRY_AFTER_SECONDS,
      }),
      suggested_args: {
        action: params.action,
        ...(functionName ? { functionName } : {}),
      },
    },
  ];
}

export function buildFunctionUpdatingPayload(params: {
  action: string;
  functionName?: string;
  status?: string;
  rawMessage?: string;
  waitedAttempts?: number;
  timedOut?: boolean;
}): FunctionUpdatingPayload {
  return {
    success: false,
    errorCode: FUNCTION_UPDATING_ERROR_CODE,
    retryAfterSeconds: FUNCTION_UPDATING_RETRY_AFTER_SECONDS,
    message: buildFunctionUpdatingMessage(params),
    data: {
      action: params.action,
      ...(params.functionName ? { functionName: params.functionName } : {}),
      ...(params.status ? { status: params.status } : {}),
      retryAfterSeconds: FUNCTION_UPDATING_RETRY_AFTER_SECONDS,
      doNotRetryImmediately: true,
      ...(typeof params.waitedAttempts === "number"
        ? { waitedAttempts: params.waitedAttempts }
        : {}),
      ...(params.timedOut ? { waitTimedOut: true } : {}),
      ...(params.rawMessage ? { rawError: params.rawMessage.slice(0, 500) } : {}),
    },
    nextActions: buildFunctionUpdatingNextActions(params),
  };
}

export type WaitUntilFunctionActiveResult = {
  ready: boolean;
  status?: string;
  attempts: number;
  timedOut: boolean;
};

/**
 * Poll function Status until it leaves a busy state.
 * Always bounded: maxAttempts AND timeoutMs; never spins without a sleep between polls.
 */
export async function waitUntilFunctionActive(
  getStatus: () => Promise<string | undefined>,
  options: {
    initialStatus?: string;
    intervalMs?: number;
    maxAttempts?: number;
    timeoutMs?: number;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
  } = {},
): Promise<WaitUntilFunctionActiveResult> {
  const intervalMs = options.intervalMs ?? FUNCTION_UPDATING_WAIT.intervalMs;
  const maxAttempts = options.maxAttempts ?? FUNCTION_UPDATING_WAIT.maxAttempts;
  const timeoutMs = options.timeoutMs ?? FUNCTION_UPDATING_WAIT.timeoutMs;
  const sleep = options.sleep ?? ((ms: number) => functionUpdatingRuntime.sleep(ms));
  const now = options.now ?? Date.now;

  if (maxAttempts < 1) {
    throw new Error("waitUntilFunctionActive maxAttempts must be >= 1");
  }
  if (intervalMs < 0 || timeoutMs < 0) {
    throw new Error("waitUntilFunctionActive intervalMs/timeoutMs must be >= 0");
  }

  if (
    options.initialStatus !== undefined &&
    !isFunctionBusyStatus(options.initialStatus)
  ) {
    return {
      ready: true,
      status: options.initialStatus,
      attempts: 0,
      timedOut: false,
    };
  }

  const startedAt = now();
  let attempts = 0;
  let status: string | undefined = options.initialStatus;

  while (attempts < maxAttempts) {
    if (now() - startedAt >= timeoutMs) {
      return { ready: false, status, attempts, timedOut: true };
    }

    attempts += 1;
    status = await getStatus();
    if (!isFunctionBusyStatus(status)) {
      return { ready: true, status, attempts, timedOut: false };
    }

    if (attempts >= maxAttempts) {
      break;
    }
    if (now() - startedAt + intervalMs >= timeoutMs) {
      return { ready: false, status, attempts, timedOut: true };
    }
    await sleep(intervalMs);
  }

  return { ready: false, status, attempts, timedOut: false };
}
