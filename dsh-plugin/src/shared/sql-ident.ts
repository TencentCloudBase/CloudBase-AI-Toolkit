const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export type SqlRiskLevel =
  | "read_only"
  | "normal_write"
  | "schema_change"
  | "destructive"
  | "security_change"
  | "unknown_risk";

export interface SqlRiskAssessment {
  risk: SqlRiskLevel;
  readOnly: boolean;
  /** High-risk ops need explicit checkbox acknowledgement in the UI. */
  requiresAck: boolean;
  verb: string;
}

function stripLeadingSqlComments(sql: string): string {
  let normalized = sql.trim();
  while (normalized.length > 0) {
    if (normalized.startsWith("--")) {
      normalized = normalized.replace(/^--.*(?:\r?\n|$)/, "").trimStart();
      continue;
    }
    if (normalized.startsWith("#")) {
      normalized = normalized.replace(/^#.*(?:\r?\n|$)/, "").trimStart();
      continue;
    }
    if (normalized.startsWith("/*")) {
      normalized = normalized.replace(/^\/\*[\s\S]*?\*\//, "").trimStart();
      continue;
    }
    break;
  }
  return normalized;
}

function getSqlVerb(sql: string): string {
  const normalized = stripLeadingSqlComments(sql);
  const match = normalized.match(/^([a-zA-Z]+)/);
  return match?.[1]?.toUpperCase() ?? "";
}

function isReadOnlySql(sql: string): boolean {
  const normalized = stripLeadingSqlComments(sql);
  const verb = getSqlVerb(normalized);
  const readOnlyVerbs = new Set(["SELECT", "SHOW", "EXPLAIN", "WITH", "VALUES"]);
  if (!readOnlyVerbs.has(verb)) return false;
  return !/\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|REPLACE|RENAME|GRANT|REVOKE|COMMENT|VACUUM|ANALYZE|FOR\s+UPDATE|FOR\s+SHARE)\b/i.test(
    normalized,
  );
}

function isDestructiveSql(sql: string): boolean {
  const normalized = stripLeadingSqlComments(sql);
  const verb = getSqlVerb(normalized);
  if (["DROP", "TRUNCATE", "DELETE"].includes(verb)) return true;
  if (verb === "ALTER") return /\b(DROP|RENAME)\b/i.test(normalized);
  return false;
}

/** Lightweight SQL statement splitter (handles semicolons outside quotes). */
export function splitSqlStatements(sql: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    if (quote) {
      current += ch;
      if (ch === quote && sql[i - 1] !== "\\") quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === ";") {
      const trimmed = current.trim();
      if (trimmed.length > 0) parts.push(trimmed);
      current = "";
      continue;
    }
    current += ch;
  }
  const tail = current.trim();
  if (tail.length > 0) parts.push(tail);
  return parts;
}

/** Classify SQL write risk using verb/keyword heuristics (aligned with managePgDatabase). */
export function assessSqlRisk(sql: string): SqlRiskAssessment {
  const normalized = stripLeadingSqlComments(sql);
  const verb = getSqlVerb(normalized);

  if (!verb) {
    return { risk: "unknown_risk", readOnly: false, requiresAck: true, verb: "" };
  }

  if (isReadOnlySql(normalized)) {
    return { risk: "read_only", readOnly: true, requiresAck: false, verb };
  }

  if (isDestructiveSql(normalized)) {
    return { risk: "destructive", readOnly: false, requiresAck: true, verb };
  }

  if (
    /\b(GRANT|REVOKE|CREATE\s+POLICY|ALTER\s+POLICY|DROP\s+POLICY|ENABLE\s+ROW\s+LEVEL\s+SECURITY|DISABLE\s+ROW\s+LEVEL\s+SECURITY)\b/i.test(
      normalized,
    )
  ) {
    return { risk: "security_change", readOnly: false, requiresAck: true, verb };
  }

  if (["CREATE", "ALTER", "COMMENT"].includes(verb)) {
    return { risk: "schema_change", readOnly: false, requiresAck: true, verb };
  }

  if (["INSERT", "UPDATE", "DELETE", "MERGE"].includes(verb)) {
    return { risk: "normal_write", readOnly: false, requiresAck: false, verb };
  }

  return { risk: "unknown_risk", readOnly: false, requiresAck: true, verb };
}

/** Aggregate risk across a multi-statement SQL batch (highest severity wins). */
export function assessSqlBatchRisk(sql: string): SqlRiskAssessment {
  const statements = splitSqlStatements(sql);
  if (statements.length === 0) return assessSqlRisk("");
  let worst: SqlRiskAssessment = assessSqlRisk(statements[0] ?? "");
  const rank: Record<SqlRiskLevel, number> = {
    read_only: 0,
    normal_write: 1,
    schema_change: 2,
    security_change: 3,
    destructive: 4,
    unknown_risk: 2,
  };
  for (const statement of statements.slice(1)) {
    const next = assessSqlRisk(statement);
    if (rank[next.risk] > rank[worst.risk]) worst = next;
    if (next.requiresAck) worst = { ...worst, requiresAck: true };
  }
  return worst;
}

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
