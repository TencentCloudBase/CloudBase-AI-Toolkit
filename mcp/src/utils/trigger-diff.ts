/**
 * Compare trigger lists around a delete so the caller can report what actually
 * disappeared. A delete-by-name must never silently take other triggers with it.
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
