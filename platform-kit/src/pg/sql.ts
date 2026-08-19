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
