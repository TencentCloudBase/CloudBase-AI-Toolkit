import type { AgentUsage } from '../../core/src/types.ts';

interface StreamEvent {
  type?: string;
  message?: { usage?: { input_tokens?: number; output_tokens?: number } };
  usage?: { input_tokens?: number; output_tokens?: number };
}

function parseStreamLine(line: string): StreamEvent | undefined {
  try {
    return JSON.parse(line) as StreamEvent;
  } catch {
    return undefined;
  }
}

/** Claude Code `--output-format stream-json` usage. Sum assistant and result events only. */
export function parseClaudeStreamUsage(raw: string | undefined): AgentUsage | undefined {
  if (!raw) return undefined;
  let inputTokens = 0;
  let outputTokens = 0;
  let seen = false;
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    const event = parseStreamLine(line);
    if (!event) continue;
    const usage = event.message?.usage ?? event.usage;
    if (!usage) continue;
    if (event.type !== 'assistant' && event.type !== 'result') continue;
    seen = true;
    inputTokens += usage.input_tokens ?? 0;
    outputTokens += usage.output_tokens ?? 0;
  }
  return seen ? { inputTokens, outputTokens } : undefined;
}

export function parseClaudeStepCount(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  let steps = 0;
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    const event = parseStreamLine(line);
    if (event?.type === 'assistant') steps += 1;
  }
  return steps;
}
