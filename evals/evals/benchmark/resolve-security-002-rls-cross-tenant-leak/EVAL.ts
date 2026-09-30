import type { CheckResult, EvalContext } from '../../../packages/core/src/types.ts';
import { openLiveNotes } from '../../../packages/sandbox/src/pg-live.ts';

export interface Note {
  id: string;
  orgId: string;
  authorId: string;
  body: string;
}

export interface Tenant {
  id: string;
  orgId: string;
}

export interface NotesApi {
  read(): Promise<Note[]>;
  insert(note: Omit<Note, 'id'>): Promise<Note | null>;
  update(id: string, body: string): Promise<boolean>;
  remove(id: string): Promise<boolean>;
}

const tenantA: Tenant = { id: 'user-a', orgId: 'org-a' };
const tenantB: Tenant = { id: 'user-b', orgId: 'org-b' };

export interface TenantPair {
  a: Tenant;
  b: Tenant;
}

/** 只查租户能做什么。身份来自登录 session 的 sub，不写死用户名。 */
export async function scoreCrossTenant(
  open: (tenant: Tenant) => Promise<NotesApi>,
  tenants: TenantPair = { a: tenantA, b: tenantB },
): Promise<CheckResult[]> {
  const a = await open(tenants.a);
  const b = await open(tenants.b);
  const aNotes = await a.read();
  const bNotes = await b.read();
  const own = aNotes.find((note) => note.orgId === tenants.a.orgId);
  const bOwn = bNotes.find((note) => note.authorId === tenants.b.id);
  const inserted = await a.insert({
    orgId: tenants.a.orgId,
    authorId: tenants.a.id,
    body: 'new',
  });
  const cross = await b.insert({
    orgId: tenants.a.orgId,
    authorId: tenants.b.id,
    body: 'intrude',
  });
  return [
    {
      name: 'tenant-a-sees-only-org-a',
      passed: aNotes.length > 0 && aNotes.every((note) => note.orgId === tenants.a.orgId),
    },
    {
      name: 'tenant-b-cannot-read-org-a',
      passed: bNotes.every((note) => note.orgId !== tenants.a.orgId),
    },
    {
      name: 'tenant-a-can-update-own',
      passed: own ? await a.update(own.id, 'updated') : false,
    },
    {
      name: 'tenant-b-cannot-update-org-a',
      passed: own ? (await b.update(own.id, 'stolen')) === false : false,
    },
    {
      name: 'tenant-b-cannot-delete-org-a',
      passed: own ? (await b.remove(own.id)) === false : false,
    },
    {
      name: 'tenant-b-can-delete-own',
      passed: bOwn ? await b.remove(bOwn.id) : false,
    },
    {
      name: 'tenant-a-can-insert-own-org',
      passed: inserted?.orgId === tenants.a.orgId,
    },
    {
      name: 'tenant-b-cannot-insert-into-org-a',
      passed: cross === null,
    },
  ];
}

function mapNote(row: Record<string, string>): Note {
  return {
    id: row.id,
    orgId: row.org_id,
    authorId: row.author_id,
    body: row.body,
  };
}

/**
 * app.rdb() 的数据面是 PostgREST。RLS 滤掉的写入返回 200 和空数组，记为未改到行。
 */
export function openAppRdb(
  baseUrl: string,
  tokenFor: (tenant: Tenant) => string,
): (tenant: Tenant) => Promise<NotesApi> {
  return async (tenant) => {
    const accessToken = tokenFor(tenant);
    const headers = {
      authorization: `Bearer ${accessToken}`,
      accept: 'application/json',
      'content-type': 'application/json',
      prefer: 'return=representation',
    };
    async function call(method: string, path: string, body?: unknown) {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await response.text();
      const parsed = text ? JSON.parse(text) : null;
      if (!response.ok) return { ok: false, rows: [] as Record<string, string>[] };
      if (Array.isArray(parsed)) return { ok: true, rows: parsed as Record<string, string>[] };
      if (parsed && typeof parsed === 'object') return { ok: true, rows: [parsed as Record<string, string>] };
      return { ok: true, rows: [] as Record<string, string>[] };
    }
    return {
      async read() {
        const result = await call('GET', '/notes?select=id,org_id,author_id,body');
        return result.rows.map(mapNote);
      },
      async insert(note) {
        const result = await call('POST', '/notes', {
          id: `n-${crypto.randomUUID()}`,
          org_id: note.orgId,
          author_id: note.authorId,
          body: note.body,
        });
        const row = result.rows[0];
        return row ? mapNote(row) : null;
      },
      async update(id, body) {
        const result = await call('PATCH', `/notes?id=eq.${encodeURIComponent(id)}`, { body });
        return result.rows.length > 0;
      },
      async remove(id) {
        const result = await call('DELETE', `/notes?id=eq.${encodeURIComponent(id)}`);
        return result.rows.length > 0;
      },
    };
  };
}

export const scorer = async (ctx?: EvalContext): Promise<CheckResult[]> => {
  if (!ctx?.live) {
    return [
      {
        name: 'cross-tenant-leak-closed',
        passed: false,
        detail: 'postgres adapter is not connected',
      },
    ];
  }
  const open = await openLiveNotes(ctx.live);
  return scoreCrossTenant(open);
};
