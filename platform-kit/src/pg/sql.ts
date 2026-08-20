import type { PolicyEditInput, PolicyInput } from "./types.js";

function quoteIdent(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function parseSchemaTable(schemaTable: string): { schema: string; table: string } {
  const parts = schemaTable.split(".");
  if (parts.length >= 2) {
    return { schema: parts[0]!, table: parts.slice(1).join(".") };
  }
  return { schema: "public", table: schemaTable };
}

function qualifiedTable(schemaTable: string): string {
  const { schema, table } = parseSchemaTable(schemaTable);
  return `${quoteIdent(schema)}.${quoteIdent(table)}`;
}

export function sqlListSchemaPolicies(schema = "public"): string {
  return `
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = '${schema.replace(/'/g, "''")}'
ORDER BY tablename, policyname;
`.trim();
}

export function sqlToggleRLS(schemaTable: string, enable: boolean): string {
  const action = enable ? "ENABLE" : "DISABLE";
  return `ALTER TABLE ${qualifiedTable(schemaTable)} ${action} ROW LEVEL SECURITY;`;
}

export function sqlDropPolicy(schemaTable: string, policyName: string): string {
  return `DROP POLICY ${quoteIdent(policyName)} ON ${qualifiedTable(schemaTable)};`;
}

function formatRoles(roles: string[]): string {
  if (roles.length === 0) return "PUBLIC";
  return roles.map((role) => (role.toLowerCase() === "public" ? "PUBLIC" : quoteIdent(role))).join(", ");
}

export function sqlCreatePolicy(input: PolicyInput): string {
  const permissive = input.permissive === false ? "RESTRICTIVE" : "PERMISSIVE";
  const parts = [
    `CREATE POLICY ${quoteIdent(input.name)} ON ${qualifiedTable(input.schemaTable)}`,
    `AS ${permissive}`,
    `FOR ${input.command.toUpperCase()}`,
    `TO ${formatRoles(input.roles)}`,
  ];
  if (input.using?.trim()) {
    parts.push(`USING (${input.using.trim()})`);
  }
  if (input.withCheck?.trim()) {
    parts.push(`WITH CHECK (${input.withCheck.trim()})`);
  }
  return `${parts.join(" ")};`;
}

export function sqlAlterPolicy(input: PolicyEditInput): string {
  const targetName = input.previousName ?? input.name;
  const clauses: string[] = [];
  if (input.name && input.previousName && input.name !== input.previousName) {
    clauses.push(`RENAME TO ${quoteIdent(input.name)}`);
  }
  if (input.command) {
    clauses.push(`FOR ${input.command.toUpperCase()}`);
  }
  if (input.roles.length > 0) {
    clauses.push(`TO ${formatRoles(input.roles)}`);
  }
  if (input.using !== undefined) {
    clauses.push(`USING (${input.using.trim() || "true"})`);
  }
  if (input.withCheck !== undefined) {
    clauses.push(`WITH CHECK (${input.withCheck.trim() || "true"})`);
  }
  if (clauses.length === 0) {
    throw new Error("No policy fields to alter");
  }
  return `ALTER POLICY ${quoteIdent(targetName)} ON ${qualifiedTable(input.schemaTable)} ${clauses.join(" ")};`;
}

export function sqlListFunctions(schema = "public"): string {
  return `
SELECT n.nspname AS schema, p.proname AS name, pg_get_function_result(p.oid) AS return_type,
       l.lanname AS language
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_language l ON l.oid = p.prolang
WHERE n.nspname = '${schema.replace(/'/g, "''")}'
  AND p.prokind = 'f'
ORDER BY p.proname;
`.trim();
}

export function sqlListExtensions(): string {
  return `
SELECT e.extname AS name, n.nspname AS schema, e.extversion AS version
FROM pg_extension e
JOIN pg_namespace n ON n.oid = e.extnamespace
ORDER BY e.extname;
`.trim();
}

export function sqlListRoles(): string {
  return `
SELECT rolname AS name, rolsuper AS superuser, rolcanlogin AS can_login
FROM pg_roles
WHERE rolname NOT LIKE 'pg_%'
ORDER BY rolname;
`.trim();
}

export function sqlListIndexes(schemaTable: string): string {
  const { schema, table } = parseSchemaTable(schemaTable);
  return `
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = '${schema.replace(/'/g, "''")}'
  AND tablename = '${table.replace(/'/g, "''")}'
ORDER BY indexname;
`.trim();
}

export function sqlListTables(): string {
  return `
SELECT n.nspname AS schema, c.relname AS name, c.relkind AS kind,
       c.reltuples AS estimated_rows
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r', 'v', 'p')
  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
ORDER BY n.nspname, c.relname;
`.trim();
}

export function sqlListSchemas(): string {
  return `
SELECT nspname AS name, nspowner::regrole::text AS owner
FROM pg_namespace
WHERE nspname NOT LIKE 'pg_%'
  AND nspname <> 'information_schema'
ORDER BY nspname;
`.trim();
}

export function sqlListTriggers(schema = "public"): string {
  return `
SELECT n.nspname AS schema, c.relname AS table_name, t.tgname AS name,
       pg_get_triggerdef(t.oid) AS definition
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE NOT t.tgisinternal
  AND n.nspname = '${schema.replace(/'/g, "''")}'
ORDER BY c.relname, t.tgname;
`.trim();
}

export function sqlListTypes(schema = "public"): string {
  return `
SELECT n.nspname AS schema, t.typname AS name, pg_catalog.format_type(t.oid, NULL) AS definition
FROM pg_type t
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = '${schema.replace(/'/g, "''")}'
  AND t.typtype IN ('e', 'c', 'd')
ORDER BY t.typname;
`.trim();
}

export function sqlListColumnPrivileges(schemaTable: string): string {
  const { schema, table } = parseSchemaTable(schemaTable);
  return `
SELECT grantee, column_name, privilege_type
FROM information_schema.column_privileges
WHERE table_schema = '${schema.replace(/'/g, "''")}'
  AND table_name = '${table.replace(/'/g, "''")}'
ORDER BY grantee, column_name;
`.trim();
}

export function sqlListMigrations(): string {
  return `
SELECT version, name, applied_at
FROM pg_migrations
ORDER BY version DESC
LIMIT 100;
`.trim();
}

export function sqlTableColumns(schemaTable: string): string {
  const { schema, table } = parseSchemaTable(schemaTable);
  return `
SELECT column_name, data_type, is_nullable, column_default,
       (SELECT COUNT(*) > 0 FROM pg_index i
        JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
        WHERE i.indrelid = (quote_ident('${schema.replace(/'/g, "''")}') || '.' || quote_ident('${table.replace(/'/g, "''")}'))::regclass
          AND i.indisprimary AND a.attname = c.column_name) AS is_pk
FROM information_schema.columns c
WHERE table_schema = '${schema.replace(/'/g, "''")}'
  AND table_name = '${table.replace(/'/g, "''")}'
ORDER BY ordinal_position;
`.trim();
}

export function sqlTableForeignKeys(schemaTable: string): string {
  const { schema, table } = parseSchemaTable(schemaTable);
  return `
SELECT con.conname AS constraint_name,
       att.attname AS column_name,
       fn.nspname || '.' || ft.relname AS references,
       fatt.attname AS referenced_column
FROM pg_constraint con
JOIN pg_class cl ON cl.oid = con.conrelid
JOIN pg_namespace n ON n.oid = cl.relnamespace
JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey)
JOIN pg_class ft ON ft.oid = con.confrelid
JOIN pg_namespace fn ON fn.oid = ft.relnamespace
JOIN pg_attribute fatt ON fatt.attrelid = con.confrelid AND fatt.attnum = ANY(con.confkey)
WHERE con.contype = 'f'
  AND n.nspname = '${schema.replace(/'/g, "''")}'
  AND cl.relname = '${table.replace(/'/g, "''")}';
`.trim();
}

export function sqlTableRlsStatus(schemaTable: string): string {
  const { schema, table } = parseSchemaTable(schemaTable);
  return `
SELECT c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS force_rls
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = '${schema.replace(/'/g, "''")}'
  AND c.relname = '${table.replace(/'/g, "''")}';
`.trim();
}

export function sqlWrapDdl(sql: string): string {
  const escaped = sql.replace(/'/g, "''");
  return `DO LANGUAGE plpgsql $$ BEGIN EXECUTE '${escaped}'; END $$;`;
}
