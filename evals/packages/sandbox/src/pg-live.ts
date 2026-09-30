import { createRequire } from 'node:module';

export interface LiveCreds {
  envId: string;
  secretId: string;
  secretKey: string;
}

interface NoteRow {
  id: string;
  orgId: string;
  authorId: string;
  body: string;
}

interface NotesApi {
  read(): Promise<NoteRow[]>;
  insert(note: Omit<NoteRow, 'id'>): Promise<NoteRow | null>;
  update(id: string, body: string): Promise<boolean>;
  remove(id: string): Promise<boolean>;
}

interface TenantRef {
  id: string;
  orgId: string;
}
const TCB_VERSION = '2018-06-08';
const LOWCODE_VERSION = '2021-01-08';
const PASSWORD = 'EvalCross1a';

const ACCOUNTS = [
  { username: 'user-a', orgId: 'org-a', noteId: 'a1', body: 'org a note' },
  { username: 'user-b', orgId: 'org-b', noteId: 'b1', body: 'org b note' },
] as const;

function gateway(envId: string): string {
  return `https://${envId}.api.tcloudbasegateway.com`;
}

function sqlLit(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

async function manager(creds: LiveCreds) {
  const loaded = await loadManager();
  const CloudBase = (loaded as { default?: new (config: LiveCreds) => CloudBaseApp }).default
    ?? (loaded as unknown as new (config: LiveCreds) => CloudBaseApp);
  return new CloudBase(creds);
}

async function loadManager(): Promise<unknown> {
  try {
    return await import('@cloudbase/manager-node');
  } catch {
    const root = process.env.CLOUDBASE_PKG_ROOT;
    if (!root) throw new Error('Cannot load @cloudbase/manager-node');
    return createRequire(root)('@cloudbase/manager-node');
  }
}

interface CloudBaseApp {
  commonService(service: string, version: string): {
    call(input: { Action: string; Param: Record<string, unknown> }): Promise<unknown>;
  };
  user: {
    describeUserList(input: { pageNo: number; pageSize: number; name: string }): Promise<unknown>;
  };
}

async function callTcb(app: CloudBaseApp, envId: string, action: string, param: Record<string, unknown>) {
  return app.commonService('tcb', TCB_VERSION).call({
    Action: action,
    Param: { EnvId: envId, ...param },
  });
}

async function publishableKey(app: CloudBaseApp, envId: string): Promise<string> {
  const tokenRes = await app.commonService('lowcode', LOWCODE_VERSION).call({
    Action: 'DescribeApiKeyTokens',
    Param: { EnvId: envId, KeyType: 'publish_key', PageNumber: 1, PageSize: 10 },
  }) as { Data?: { ApiKey?: string }[] };
  const key = tokenRes?.Data?.[0]?.ApiKey;
  if (!key) throw new Error('DescribeApiKeyTokens returned no publishable key');
  return key;
}

async function ensureUser(app: CloudBaseApp, envId: string, username: string): Promise<string> {
  const listed = await app.user.describeUserList({ pageNo: 1, pageSize: 20, name: username }) as {
    Data?: { UserList?: { Name?: string; Uid?: string }[] };
    UserList?: { Name?: string; Uid?: string }[];
  };
  const users = listed?.Data?.UserList ?? listed?.UserList ?? [];
  const existing = users.find((user) => user.Name === username);
  if (existing?.Uid) {
    await callTcb(app, envId, 'ModifyUser', {
      Uid: existing.Uid,
      Name: username,
      Password: PASSWORD,
      Type: 'externalUser',
      UserStatus: 'ACTIVE',
    });
    return existing.Uid;
  }
  const created = await callTcb(app, envId, 'CreateUser', {
    Name: username,
    Type: 'externalUser',
    Password: PASSWORD,
    UserStatus: 'ACTIVE',
  }) as { Data?: { Uid?: string }; Uid?: string };
  const uid = created?.Data?.Uid ?? created?.Uid;
  if (!uid) throw new Error(`CreateUser did not return a uid for ${username}`);
  return uid;
}

async function executeSql(app: CloudBaseApp, envId: string, sql: string): Promise<Record<string, string>[]> {
  const result = await callTcb(app, envId, 'ExecutePGSql', {
    Sql: sql,
    Role: 'cloudbase_admin',
  }) as { Response?: { Columns?: string[]; Rows?: string[] }; Columns?: string[]; Rows?: string[] };
  const body = result?.Response ?? result;
  const columns = body?.Columns ?? [];
  return (body?.Rows ?? []).map((rowText) => {
    const values = JSON.parse(rowText) as unknown[];
    const row: Record<string, string> = {};
    columns.forEach((column, index) => {
      row[column] = values[index] == null ? '' : String(values[index]);
    });
    return row;
  });
}

export async function adminQuery(creds: LiveCreds, sql: string): Promise<Record<string, string>[]> {
  const app = await manager(creds);
  return executeSql(app, creds.envId, sql);
}

async function signIn(envId: string, publishable: string, username: string): Promise<string> {
  const authUrl = `${gateway(envId)}/auth/v1/signin`;
  const response = await fetch(authUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: publishable,
      authorization: `Bearer ${publishable}`,
    },
    body: JSON.stringify({ username, password: PASSWORD }),
  });
  const text = await response.text();
  const parsed = text ? JSON.parse(text) as Record<string, unknown> : {};
  const token = accessTokenOf(parsed);
  if (!response.ok || !token) {
    const code = typeof parsed.code === 'string' ? parsed.code : String(response.status);
    throw new Error(`signInWithPassword failed for ${username}: ${code}`);
  }
  return token;
}

function accessTokenOf(parsed: Record<string, unknown>): string | undefined {
  if (typeof parsed.access_token === 'string') return parsed.access_token;
  const session = parsed.session as { access_token?: string } | undefined;
  if (session?.access_token) return session.access_token;
  const data = parsed.data as { session?: { access_token?: string } } | undefined;
  return data?.session?.access_token;
}

async function seedMembership(app: CloudBaseApp, envId: string, pairs: { username: string; uid: string; orgId: string; noteId: string; body: string }[]) {
  await executeSql(app, envId, `
    create table if not exists public.org_members (
      user_id text not null,
      org_id text not null,
      primary key (user_id, org_id)
    );
    create table if not exists public.notes (
      id text primary key,
      org_id text not null,
      author_id text not null,
      body text not null
    );
  `);
  for (const pair of pairs) {
    for (const userId of [pair.username, pair.uid]) {
      await executeSql(app, envId, `
        insert into public.org_members (user_id, org_id)
        select ${sqlLit(userId)}, ${sqlLit(pair.orgId)}
        where not exists (
          select 1 from public.org_members
          where user_id = ${sqlLit(userId)} and org_id = ${sqlLit(pair.orgId)}
        );
      `);
    }
    await executeSql(app, envId, `
      insert into public.notes (id, org_id, author_id, body)
      select ${sqlLit(pair.noteId)}, ${sqlLit(pair.orgId)}, ${sqlLit(pair.username)}, ${sqlLit(pair.body)}
      where not exists (select 1 from public.notes where id = ${sqlLit(pair.noteId)});
    `);
  }
}

/** 每个租户单独登录。数据面是 PostgREST，RLS 滤掉的写入记为空结果。 */
export async function openLiveNotes(creds: LiveCreds): Promise<(tenant: TenantRef) => Promise<NotesApi>> {
  const app = await manager(creds);
  const publishable = await publishableKey(app, creds.envId);
  const sessions = new Map<string, string>();
  const seeded = [];
  for (const account of ACCOUNTS) {
    const uid = await ensureUser(app, creds.envId, account.username);
    const token = await signIn(creds.envId, publishable, account.username);
    sessions.set(account.username, token);
    seeded.push({ ...account, uid });
  }
  await seedMembership(app, creds.envId, seeded);
  const baseUrl = `${gateway(creds.envId)}/v1/rdb/rest/v1`;
  return async (tenant) => notesApi(baseUrl, sessions.get(tenant.id) ?? '');
}

function notesApi(baseUrl: string, accessToken: string): NotesApi {
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
    if (!response.ok) return [];
    if (Array.isArray(parsed)) return parsed as Record<string, string>[];
    if (parsed && typeof parsed === 'object') return [parsed as Record<string, string>];
    return [];
  }
  const mapNote = (row: Record<string, string>): NoteRow => ({
    id: row.id,
    orgId: row.org_id,
    authorId: row.author_id,
    body: row.body,
  });
  return {
    async read() {
      return (await call('GET', '/notes?select=id,org_id,author_id,body')).map(mapNote);
    },
    async insert(note) {
      const rows = await call('POST', '/notes', {
        id: `n-${crypto.randomUUID()}`,
        org_id: note.orgId,
        author_id: note.authorId,
        body: note.body,
      });
      return rows[0] ? mapNote(rows[0]) : null;
    },
    async update(id, body) {
      const rows = await call('PATCH', `/notes?id=eq.${encodeURIComponent(id)}`, { body });
      return rows.length > 0;
    },
    async remove(id) {
      const rows = await call('DELETE', `/notes?id=eq.${encodeURIComponent(id)}`);
      return rows.length > 0;
    },
  };
}
