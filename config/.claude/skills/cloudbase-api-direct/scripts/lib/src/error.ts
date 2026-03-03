interface Options {
  exit?: number;
  original?: Error | undefined;
  code?: string | number;
  requestId?: string;
  action?: string;
}

export class CloudBaseError extends Error {
  readonly exit: number;
  readonly message: string;
  readonly name = "CloudBaseError";
  readonly original: Error | undefined;
  readonly code: string | number;
  readonly requestId: string;
  readonly action: string;

  constructor(message: string, options: Options = {}) {
    super();
    const { code = "", action = "", original = null, requestId = "" } = options;
    this.message = action ? `[${action}] ${message}` : message;
    this.original = original;
    this.code = code;
    this.requestId = requestId;
    this.action = action;
  }
}
