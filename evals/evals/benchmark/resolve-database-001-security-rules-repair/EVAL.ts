// Scorer draft for resolve-database-001-security-rules-repair.
//
// The runner contract (types package, harness context) lands in an
// upcoming PR. The scenario starts from a seeded broken state: the
// collection's security rules allow read but reject create/update/delete
// for authenticated users. The scorer verifies the repair from the
// end-user side — not by inspecting the rules text, which would reward
// rule rewrites that don't work.
//
// Discriminating details:
//   - full CRUD must pass for a signed-in end user (read alone was
//     already working before the fix);
//   - anonymous access must stay rejected, so "open everything" is not
//     a passing fix;
//   - writes are verified against a seeded user identity, not an admin
//     credential, so a rules change that only works for admins fails.

interface CheckResult {
  name: string;
  passed: boolean;
  detail?: string;
}

interface EvalContext {
  envId: string;
  /** Sign in as the seeded end user; returns an authenticated SDK handle. */
  asEndUser: () => Promise<SdkHandle>;
  /** Open an unauthenticated (anonymous) SDK handle. */
  asAnonymous: () => Promise<SdkHandle>;
}

interface SdkHandle {
  collection(name: string): {
    create(doc: unknown): Promise<{ id: string }>;
    read(id: string): Promise<unknown | null>;
    update(id: string, patch: unknown): Promise<void>;
    remove(id: string): Promise<void>;
  };
}

const COLLECTION = 'notes';

export const scorer = async (ctx: EvalContext): Promise<CheckResult[]> => {
  const checks: CheckResult[] = [];
  const user = await ctx.asEndUser();
  const notes = user.collection(COLLECTION);

  const created = await notes.create({ title: 'post-fix', body: 'written by eval' });
  checks.push({
    name: 'end-user-can-create',
    passed: Boolean(created?.id),
    detail: 'create was the broken operation; it must work after the fix',
  });

  const readBack = created?.id ? await notes.read(created.id) : null;
  checks.push({
    name: 'end-user-can-read',
    passed: Boolean(readBack),
  });

  if (created?.id) {
    await notes.update(created.id, { title: 'post-fix-v2' });
    const updated = await notes.read(created.id);
    checks.push({
      name: 'end-user-can-update',
      passed: (updated as { title?: string } | null)?.title === 'post-fix-v2',
    });

    await notes.remove(created.id);
    const afterRemove = await notes.read(created.id);
    checks.push({
      name: 'end-user-can-delete',
      passed: afterRemove === null,
    });
  }

  const anon = await ctx.asAnonymous();
  let anonymousCreateThrew = false;
  try {
    await anon.collection(COLLECTION).create({ title: 'anon', body: 'should not pass' });
  } catch {
    anonymousCreateThrew = true;
  }
  checks.push({
    name: 'anonymous-still-rejected',
    passed: anonymousCreateThrew,
    detail: 'the fix must not open the collection to the world',
  });

  return checks;
};
