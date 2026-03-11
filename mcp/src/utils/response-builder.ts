/**
 * Standard response builder for MCP tools
 * Provides consistent return format across all tools
 */

/**
 * Next action suggestion for AI
 */
export interface NextAction {
  /** Tool name to call next */
  tool: string;
  /** Core parameters for the tool (AI can use directly or fill placeholders) */
  params?: Record<string, any>;
  /** Reason for this suggestion */
  reason: string;
  /** Priority level (optional) */
  priority?: 'high' | 'medium' | 'low';
}

/**
 * Standard tool result envelope
 */
export interface ToolResult<T = any> {
  /** Whether the operation succeeded */
  success: boolean;
  /** Result data */
  data: T;
  /** Human-readable message */
  message: string;
  /** Next action suggestions (only when necessary - avoid over-recommendation) */
  nextActions?: NextAction[];
}

/**
 * Build a standard tool result
 */
export function buildToolResult<T>(
  success: boolean,
  data: T,
  message: string,
  nextActions?: NextAction[]
): ToolResult<T> {
  return {
    success,
    data,
    message,
    nextActions: nextActions && nextActions.length > 0 ? nextActions : undefined
  };
}

/**
 * Build a success result
 */
export function successResult<T>(
  data: T,
  message: string,
  nextActions?: NextAction[]
): ToolResult<T> {
  return buildToolResult(true, data, message, nextActions);
}

/**
 * Build an error result
 */
export function errorResult<T = null>(
  message: string,
  data: T = null as T,
  nextActions?: NextAction[]
): ToolResult<T> {
  return buildToolResult(false, data, message, nextActions);
}

/**
 * Build a next action suggestion
 */
export function buildNextAction(
  tool: string,
  params: Record<string, any> | undefined,
  reason: string,
  priority?: 'high' | 'medium' | 'low'
): NextAction {
  const action: NextAction = { tool, reason };
  if (params && Object.keys(params).length > 0) {
    action.params = params;
  }
  if (priority) {
    action.priority = priority;
  }
  return action;
}

/**
 * Convert ToolResult to MCP JSON response format
 */
export function toMCPResponse<T>(result: ToolResult<T>): {
  content: Array<{ type: 'text'; text: string }>;
} {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(result, null, 2)
      }
    ]
  };
}

/**
 * Helper: Build nextAction to recommend reading documentation
 */
export function recommendDocs(
  skillName: string,
  reason: string,
  priority: 'high' | 'medium' | 'low' = 'high'
): NextAction {
  return buildNextAction(
    'searchKnowledgeBase',
    { mode: 'skills', skillName },
    reason,
    priority
  );
}

/**
 * Helper: Build error result with documentation recommendation
 */
export function errorWithDocs<T = null>(
  message: string,
  skillName: string,
  docsReason: string,
  data: T = null as T,
  additionalActions?: NextAction[]
): ToolResult<T> {
  const actions = [recommendDocs(skillName, docsReason)];
  if (additionalActions) {
    actions.push(...additionalActions);
  }
  return errorResult(message, data, actions);
}

/**
 * Helper: Check if a value is a valid ToolResult
 */
export function isToolResult(value: any): value is ToolResult {
  return (
    value !== null &&
    value !== undefined &&
    typeof value === 'object' &&
    typeof value.success === 'boolean' &&
    'data' in value &&
    typeof value.message === 'string'
  );
}

