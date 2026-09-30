import assert from 'node:assert/strict';
import test from 'node:test';
import {
  scoreCrossTenant,
  type Note,
  type NotesApi,
  type Tenant,
} from './EVAL.ts';

function world(rls: boolean, seed: Note[]) {
  const notes = seed.map((note) => ({ ...note }));
  return async (tenant: Tenant): Promise<NotesApi> => ({
    async read() {
      return notes.filter((note) => !rls || note.orgId === tenant.orgId);
    },
    async insert(note) {
      if (rls && note.orgId !== tenant.orgId) return null;
      const created = { ...note, id: `n-${notes.length}` };
      notes.push(created);
      return created;
    },
    async update(id, body) {
      const note = notes.find((item) => item.id === id);
      if (!note) return false;
      if (rls && (note.orgId !== tenant.orgId || note.authorId !== tenant.id)) return false;
      note.body = body;
      return true;
    },
    async remove(id) {
      const index = notes.findIndex((item) => item.id === id);
      if (index < 0) return false;
      const note = notes[index];
      if (rls && (note.orgId !== tenant.orgId || note.authorId !== tenant.id)) return false;
      notes.splice(index, 1);
      return true;
    },
  });
}

const seed: Note[] = [
  { id: 'a1', orgId: 'org-a', authorId: 'user-a', body: 'org a note' },
  { id: 'b1', orgId: 'org-b', authorId: 'user-b', body: 'org b note' },
];

test('open table fails the cross-tenant scorer', async () => {
  const checks = await scoreCrossTenant(world(false, seed));
  assert.equal(checks.every((check) => check.passed), false);
});

test('org-scoped table passes the cross-tenant scorer', async () => {
  const checks = await scoreCrossTenant(world(true, seed));
  assert.equal(checks.every((check) => check.passed), true);
});
