const CLS_UNAVAILABLE_RE =
  /topic not exist|未接入日志|日志服务未开通|HTTP 404|ResourceNotFound|FailedOperation\.TopicNotExist|TopicNotExist/i;

export function isClsUnavailableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return CLS_UNAVAILABLE_RE.test(message);
}
