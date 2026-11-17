/**
 * Compare trigger lists around a write so the caller can report what actually
 * changed. Creating a timer trigger goes through a replace-all backend path:
 * without a guard, a single-element create silently drops other triggers.
 */
export function diffTriggerLists(
  before: string[],
  after: string[],
  target: string,
): { removed: string[]; unexpected: string[] } {
  const removed = before.filter((name) => !after.includes(name));
  return {
    removed,
    unexpected: removed.filter((name) => name !== target),
  };
}

export interface TriggerCreationPlan {
  willRemove: string[];
  action: "create" | "replace" | "blocked";
}

/**
 * The backend replaces every timer trigger on the function with the submitted
 * array. Refuse a partial submission unless the caller explicitly opts in.
 */
export function planTriggerCreation(
  before: string[],
  planned: string[],
  replaceAll: boolean,
): TriggerCreationPlan {
  const willRemove = before.filter((name) => !planned.includes(name));
  if (willRemove.length === 0) {
    return { willRemove, action: "create" };
  }
  return { willRemove, action: replaceAll ? "replace" : "blocked" };
}

export function diffTriggerCreation(
  before: string[],
  after: string[],
): { added: string[]; removed: string[] } {
  return {
    added: after.filter((name) => !before.includes(name)),
    removed: before.filter((name) => !after.includes(name)),
  };
}
