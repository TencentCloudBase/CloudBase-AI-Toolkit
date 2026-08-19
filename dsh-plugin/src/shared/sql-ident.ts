const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function quotePgIdent(name: string): string {
  if (!IDENT_RE.test(name)) {
    throw new Error(`Invalid PostgreSQL identifier: ${name}`);
  }
  return `"${name}"`;
}

export function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (Array.isArray(value)) return `ARRAY[${value.map((item) => sqlLiteral(item)).join(", ")}]`;
  return `'${String(value).replace(/'/g, "''")}'`;
}

export function quotePgTable(table: string): string {
  const parts = table.split(".").filter((part) => part.length > 0);
  if (parts.length === 0 || parts.length > 2) {
    throw new Error(`Invalid table reference: ${table}`);
  }
  const schema = parts.length === 2 ? parts[0] : "public";
  const name = parts.length === 2 ? parts[1] : parts[0];
  if (!schema || !name) {
    throw new Error(`Invalid table reference: ${table}`);
  }
  return `${quotePgIdent(schema)}.${quotePgIdent(name)}`;
}

export type SqlImpactKind = "ddl" | "dml" | "privilege" | "unknown";

export interface SqlImpactDetails {
  operation?: string;
  table?: string;
  column?: string;
  role?: string;
  privileges?: string[];
  index?: string;
  policy?: string;
}

export interface SqlImpact {
  kind: SqlImpactKind;
  verb: string;
  summary: string;
  warnings: string[];
  details: SqlImpactDetails;
}

function stripLeadingSqlComments(sql: string): string {
  let text = sql.trim();
  for (;;) {
    if (text.startsWith("--")) {
      const lineEnd = text.indexOf("\n");
      text = lineEnd === -1 ? "" : text.slice(lineEnd + 1).trimStart();
      continue;
    }
    if (text.startsWith("/*")) {
      const end = text.indexOf("*/");
      text = end === -1 ? "" : text.slice(end + 2).trimStart();
      continue;
    }
    break;
  }
  return text;
}

function getSqlVerb(sql: string): string {
  const normalized = stripLeadingSqlComments(sql);
  const match = normalized.match(/^([a-zA-Z]+)/);
  return match?.[1]?.toUpperCase() ?? "";
}

const IDENT = String.raw`(?:"[^"]+"|[A-Za-z_][A-Za-z0-9_$]*)`;
const QUALIFIED_IDENT = String.raw`${IDENT}(?:\.${IDENT})?`;

function unquoteIdent(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function matchQualifiedName(raw: string | undefined, defaultSchema = "public"): string | undefined {
  if (!raw) return undefined;
  const parts = raw.split(".").map((part) => unquoteIdent(part)).filter(Boolean);
  if (parts.length === 0) return undefined;
  if (parts.length === 1) return `${defaultSchema}.${parts[0]}`;
  return `${parts[0]}.${parts[1]}`;
}

function parseTargetTable(sql: string, defaultSchema = "public"): string | undefined {
  const normalized = stripLeadingSqlComments(sql);
  const patterns = [
    new RegExp(String.raw`\bcreate\s+(?:temporary\s+|temp\s+|unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?(${QUALIFIED_IDENT})`, "i"),
    new RegExp(String.raw`\balter\s+table\s+(?:if\s+exists\s+)?(${QUALIFIED_IDENT})`, "i"),
    new RegExp(String.raw`\bdrop\s+table\s+(?:if\s+exists\s+)?(${QUALIFIED_IDENT})`, "i"),
    new RegExp(String.raw`\btruncate\s+(?:table\s+)?(?:only\s+)?(${QUALIFIED_IDENT})`, "i"),
    new RegExp(String.raw`\b(?:insert\s+into|update|delete\s+from)\s+(${QUALIFIED_IDENT})`, "i"),
    new RegExp(String.raw`\bgrant\b[\s\S]*?\bon\s+(${QUALIFIED_IDENT})`, "i"),
    new RegExp(String.raw`\brevoke\b[\s\S]*?\bon\s+(${QUALIFIED_IDENT})`, "i"),
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    const table = matchQualifiedName(match?.[1], defaultSchema);
    if (table) return table;
  }
  return undefined;
}

function parseAlterColumn(sql: string): string | undefined {
  const normalized = stripLeadingSqlComments(sql);
  const addCol = normalized.match(
    new RegExp(String.raw`\balter\s+table\s+(?:if\s+exists\s+)?${QUALIFIED_IDENT}\s+add\s+(?:column\s+)?(${IDENT})`, "i"),
  );
  if (addCol?.[1]) return unquoteIdent(addCol[1]);
  const dropCol = normalized.match(
    new RegExp(String.raw`\balter\s+table\s+(?:if\s+exists\s+)?${QUALIFIED_IDENT}\s+drop\s+column\s+(?:if\s+exists\s+)?(${IDENT})`, "i"),
  );
  if (dropCol?.[1]) return unquoteIdent(dropCol[1]);
  return undefined;
}

function parseIndexName(sql: string): string | undefined {
  const normalized = stripLeadingSqlComments(sql);
  const match = normalized.match(
    new RegExp(String.raw`\bcreate\s+(?:unique\s+)?index\s+(?:if\s+not\s+exists\s+)?(${IDENT})`, "i"),
  );
  return match?.[1] ? unquoteIdent(match[1]) : undefined;
}

function parseGrantInfo(sql: string): { privileges: string[]; role?: string; table?: string } {
  const normalized = stripLeadingSqlComments(sql);
  const grantMatch = normalized.match(
    new RegExp(String.raw`\bgrant\s+(.+?)\s+on\s+(${QUALIFIED_IDENT})\s+to\s+(${IDENT})`, "i"),
  );
  if (grantMatch?.[1] && grantMatch[2] && grantMatch[3]) {
    const privileges = grantMatch[1]
      .split(",")
      .map((item) => item.trim().toUpperCase())
      .filter(Boolean);
    return {
      privileges,
      table: matchQualifiedName(grantMatch[2]),
      role: unquoteIdent(grantMatch[3]),
    };
  }
  const revokeMatch = normalized.match(
    new RegExp(String.raw`\brevoke\s+(.+?)\s+on\s+(${QUALIFIED_IDENT})\s+from\s+(${IDENT})`, "i"),
  );
  if (revokeMatch?.[1] && revokeMatch[2] && revokeMatch[3]) {
    const privileges = revokeMatch[1]
      .split(",")
      .map((item) => item.trim().toUpperCase())
      .filter(Boolean);
    return {
      privileges,
      table: matchQualifiedName(revokeMatch[2]),
      role: unquoteIdent(revokeMatch[3]),
    };
  }
  return { privileges: [] };
}

function parsePolicyName(sql: string): string | undefined {
  const normalized = stripLeadingSqlComments(sql);
  const match = normalized.match(
    new RegExp(String.raw`\b(?:create|alter|drop)\s+policy\s+(?:if\s+exists\s+)?(${IDENT})`, "i"),
  );
  return match?.[1] ? unquoteIdent(match[1]) : undefined;
}

function classifyImpactKind(sql: string, verb: string): SqlImpactKind {
  const normalized = stripLeadingSqlComments(sql);
  if (
    ["GRANT", "REVOKE"].includes(verb) ||
    /\b(CREATE\s+POLICY|ALTER\s+POLICY|DROP\s+POLICY|ENABLE\s+ROW\s+LEVEL\s+SECURITY|DISABLE\s+ROW\s+LEVEL\s+SECURITY)\b/i.test(
      normalized,
    )
  ) {
    return "privilege";
  }
  if (["INSERT", "UPDATE", "DELETE", "MERGE"].includes(verb)) {
    return "dml";
  }
  if (["CREATE", "ALTER", "DROP", "TRUNCATE", "COMMENT"].includes(verb)) {
    return "ddl";
  }
  return "unknown";
}

function buildSummary(kind: SqlImpactKind, verb: string, details: SqlImpactDetails): string {
  if (kind === "privilege") {
    if (details.operation?.includes("POLICY") && details.policy) {
      return `${details.operation} ${details.policy}${details.table ? ` on ${details.table}` : ""}`;
    }
    if (details.privileges?.length && details.table && details.role) {
      return `${verb} ${details.privileges.join(", ")} ON ${details.table} TO ${details.role}`;
    }
    if (details.operation) return details.operation;
    return `${verb} privilege change`;
  }
  if (kind === "dml") {
    return details.table ? `${verb} ${details.table}` : `${verb} rows`;
  }
  if (verb === "CREATE" && details.table) {
    return `CREATE TABLE ${details.table}`;
  }
  if (verb === "ALTER" && details.table) {
    if (details.column) return `ALTER TABLE ${details.table} · column ${details.column}`;
    if (details.index) return `ALTER TABLE ${details.table} · index ${details.index}`;
    return `ALTER TABLE ${details.table}`;
  }
  if (verb === "DROP" && details.table) {
    return `DROP TABLE ${details.table}`;
  }
  if (verb === "CREATE" && details.index) {
    return `CREATE INDEX ${details.index}`;
  }
  if (details.table) return `${verb} ${details.table}`;
  return verb ? `${verb} statement` : "SQL statement";
}

function buildWarnings(kind: SqlImpactKind, verb: string, sql: string): string[] {
  const warnings: string[] = [];
  const normalized = stripLeadingSqlComments(sql);
  if (kind === "ddl" && ["DROP", "TRUNCATE"].includes(verb)) {
    warnings.push("Destructive schema change — verify backups before proceeding.");
  }
  if (kind === "ddl" && verb === "ALTER") {
    warnings.push("Schema mutation may lock the target table briefly.");
  }
  if (kind === "privilege") {
    warnings.push("Security-sensitive change — confirm role and scope.");
  }
  if (kind === "dml" && verb === "DELETE") {
    warnings.push("Rows will be permanently removed unless rolled back.");
  }
  if (/\bENABLE\s+ROW\s+LEVEL\s+SECURITY\b/i.test(normalized)) {
    warnings.push("RLS enabled — create policies before client reads/writes.");
  }
  return warnings;
}

/**
 * Parse a SQL statement into a human-readable impact summary for toolview cards.
 */
export function parseDdlImpact(sql: string, defaultSchema = "public"): SqlImpact {
  const normalized = stripLeadingSqlComments(sql);
  const verb = getSqlVerb(normalized);
  const kind = classifyImpactKind(normalized, verb);
  const table = parseTargetTable(normalized, defaultSchema);
  const column = parseAlterColumn(normalized);
  const index = parseIndexName(normalized);
  const policy = parsePolicyName(normalized);
  const grantInfo = kind === "privilege" ? parseGrantInfo(normalized) : { privileges: [] as string[] };

  let operation: string | undefined;
  if (/\bENABLE\s+ROW\s+LEVEL\s+SECURITY\b/i.test(normalized)) {
    operation = "ENABLE ROW LEVEL SECURITY";
  } else if (/\bDISABLE\s+ROW\s+LEVEL\s+SECURITY\b/i.test(normalized)) {
    operation = "DISABLE ROW LEVEL SECURITY";
  } else if (policy) {
    operation = `${verb} POLICY`;
  } else if (verb === "CREATE" && index && !table) {
    operation = "CREATE INDEX";
  } else if (verb) {
    operation = verb;
  }

  const details: SqlImpactDetails = {
    operation,
    table: table ?? grantInfo.table,
    column,
    index,
    policy,
    role: grantInfo.role,
    privileges: grantInfo.privileges.length > 0 ? grantInfo.privileges : undefined,
  };

  return {
    kind,
    verb,
    summary: buildSummary(kind, verb, details),
    warnings: buildWarnings(kind, verb, normalized),
    details,
  };
}
