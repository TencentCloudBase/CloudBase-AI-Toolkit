/**
 * In-process log of tool outcomes for an explicitly requested feedback draft.
 *
 * Keyed by the MCP server object. Hosted mode keeps one server instance per
 * credential, so entries from one credential cannot be read by another.
 * The buffer is bounded. Arguments are never stored.
 */

export type ToolOutcome = {
  toolName: string;
  durationMs: number;
  failed: boolean;
  at: string;
};

const MAX_OUTCOMES = 200;
const MAX_TOOL_NAME_LENGTH = 80;

const outcomesByServer = new WeakMap<object, ToolOutcome[]>();
const repeatPeakByServer = new WeakMap<object, number>();

export function recordToolOutcome(
  server: object,
  input: { toolName: string; durationMs: number; failed: boolean; at?: string },
): void {
  if (!server || typeof server !== "object") {
    return;
  }
  const toolName = typeof input.toolName === "string" ? input.toolName.trim() : "";
  if (!toolName) {
    return;
  }
  const durationMs = Number.isFinite(input.durationMs) && input.durationMs >= 0
    ? Math.round(input.durationMs)
    : 0;
  const at = typeof input.at === "string" && input.at.length > 0
    ? input.at
    : new Date().toISOString();
  const bucket = outcomesByServer.get(server) ?? [];
  bucket.push({
    toolName: toolName.slice(0, MAX_TOOL_NAME_LENGTH),
    durationMs,
    failed: input.failed === true,
    at,
  });
  if (bucket.length > MAX_OUTCOMES) {
    bucket.splice(0, bucket.length - MAX_OUTCOMES);
  }
  outcomesByServer.set(server, bucket);
}

export function readToolOutcomes(server: object): readonly ToolOutcome[] {
  if (!server || typeof server !== "object") {
    return [];
  }
  return outcomesByServer.get(server) ?? [];
}

export function noteRepeatCount(server: object, count: number): void {
  if (!server || typeof server !== "object") {
    return;
  }
  if (!Number.isFinite(count) || count <= 0) {
    return;
  }
  const rounded = Math.round(count);
  const current = repeatPeakByServer.get(server) ?? 0;
  if (rounded > current) {
    repeatPeakByServer.set(server, rounded);
  }
}

export function readRepeatPeak(server: object): number {
  if (!server || typeof server !== "object") {
    return 0;
  }
  return repeatPeakByServer.get(server) ?? 0;
}

export function clearToolOutcomes(server: object): void {
  if (!server || typeof server !== "object") {
    return;
  }
  outcomesByServer.delete(server);
  repeatPeakByServer.delete(server);
}

export const FEEDBACK_SESSION_LIMIT = MAX_OUTCOMES;
