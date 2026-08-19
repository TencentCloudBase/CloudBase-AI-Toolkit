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

export type SqlStatementKind = "ddl" | "dml" | "privilege" | "other";

export interface GrantEntry {
  privilege: string;
  object: string;
  role: string;
}

export interface DdlImpactSummary {
  kind: SqlStatementKind;
  impacts: string[];
  tablesCreated: string[];
  tablesAltered: string[];
  tablesDropped: string[];
  indexesCreated: string[];
  foreignKeys: string[];
  grants: GrantEntry[];
  revokes: GrantEntry[];
  rlsChanges: string[];
  warning: boolean;
}

function unquoteIdent(raw: string): string {
  return raw.replace(/"/g, "").trim();
}

function parseGrantRevoke(
  sql: string,
  verb: "GRANT" | "REVOKE",
): GrantEntry[] {
  const entries: GrantEntry[] = [];
  const pattern =
    verb === "GRANT"
      ? /GRANT\s+([\w\s,]+?)\s+ON\s+([\w."']+(?:\.[\w."']+)?)\s+TO\s+([\w."']+)/gi
      : /REVOKE\s+([\w\s,]+?)\s+ON\s+([\w."']+(?:\.[\w."']+)?)\s+FROM\s+([\w."']+)/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(sql)) !== null) {
    entries.push({
      privilege: match[1]?.trim() ?? verb,
      object: unquoteIdent(match[2] ?? ""),
      role: unquoteIdent(match[3] ?? ""),
    });
  }
  return entries;
}

function parseStatementImpact(sql: string): Partial<DdlImpactSummary> {
  const normalized = stripLeadingSqlComments(sql);
  const verb = getSqlVerb(normalized);
  const impacts: string[] = [];
  const partial: Partial<DdlImpactSummary> = {
    impacts,
    tablesCreated: [],
    tablesAltered: [],
    tablesDropped: [],
    indexesCreated: [],
    foreignKeys: [],
    grants: [],
    revokes: [],
    rlsChanges: [],
    warning: false,
  };

  const createTable = normalized.match(
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?((?:[\w"]+\.)?[\w"]+)/i,
  );
  if (createTable?.[1]) {
    const name = unquoteIdent(createTable[1]);
    partial.tablesCreated?.push(name);
    impacts.push(`CREATE TABLE ${name}`);
    const fkMatches = normalized.matchAll(
      /REFERENCES\s+((?:[\w"]+\.)?[\w"]+)\s*\(([\w"]+)\)/gi,
    );
    for (const fk of fkMatches) {
      const ref = `${unquoteIdent(fk[1] ?? "")}(${unquoteIdent(fk[2] ?? "")})`;
      partial.foreignKeys?.push(ref);
      impacts.push(`FOREIGN KEY → ${ref}`);
    }
    return { ...partial, kind: "ddl", warning: assessSqlRisk(normalized).requiresAck };
  }

  const alterTable = normalized.match(/ALTER\s+TABLE\s+((?:[\w"]+\.)?[\w"]+)/i);
  if (alterTable?.[1]) {
    const name = unquoteIdent(alterTable[1]);
    partial.tablesAltered?.push(name);
    impacts.push(`ALTER TABLE ${name}`);
    if (/\bADD\s+COLUMN\b/i.test(normalized)) impacts.push("ADD COLUMN");
    if (/\bDROP\s+COLUMN\b/i.test(normalized)) {
      impacts.push("DROP COLUMN");
      partial.warning = true;
    }
    if (/\bENABLE\s+ROW\s+LEVEL\s+SECURITY\b/i.test(normalized)) {
      partial.rlsChanges?.push(`ENABLE RLS on ${name}`);
    }
    if (/\bDISABLE\s+ROW\s+LEVEL\s+SECURITY\b/i.test(normalized)) {
      partial.rlsChanges?.push(`DISABLE RLS on ${name}`);
    }
    return { ...partial, kind: "ddl", warning: assessSqlRisk(normalized).requiresAck };
  }

  const dropTable = normalized.match(/DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?((?:[\w"]+\.)?[\w"]+)/i);
  if (dropTable?.[1]) {
    const name = unquoteIdent(dropTable[1]);
    partial.tablesDropped?.push(name);
    impacts.push(`DROP TABLE ${name}`);
    return { ...partial, kind: "ddl", warning: true };
  }

  const createIndex = normalized.match(
    /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w"]+)\s+ON\s+((?:[\w"]+\.)?[\w"]+)/i,
  );
  if (createIndex?.[1] && createIndex?.[2]) {
    const idx = unquoteIdent(createIndex[1]);
    const table = unquoteIdent(createIndex[2]);
    partial.indexesCreated?.push(idx);
    impacts.push(`CREATE INDEX ${idx} ON ${table}`);
    return { ...partial, kind: "ddl", warning: false };
  }

  if (verb === "GRANT") {
    const grants = parseGrantRevoke(normalized, "GRANT");
    partial.grants = grants;
    for (const g of grants) {
      impacts.push(`GRANT ${g.privilege} ON ${g.object} TO ${g.role}`);
    }
    if (/\bROW\s+LEVEL\s+SECURITY\b/i.test(normalized)) {
      partial.rlsChanges?.push("GRANT (RLS-related)");
    }
    return { ...partial, kind: "privilege", warning: true };
  }

  if (verb === "REVOKE") {
    const revokes = parseGrantRevoke(normalized, "REVOKE");
    partial.revokes = revokes;
    for (const r of revokes) {
      impacts.push(`REVOKE ${r.privilege} ON ${r.object} FROM ${r.role}`);
    }
    return { ...partial, kind: "privilege", warning: true };
  }

  if (/\bCREATE\s+POLICY\b/i.test(normalized)) {
    const policy = normalized.match(/CREATE\s+POLICY\s+([\w"]+)/i)?.[1];
    partial.rlsChanges?.push(policy ? `CREATE POLICY ${unquoteIdent(policy)}` : "CREATE POLICY");
    impacts.push(partial.rlsChanges[partial.rlsChanges.length - 1] ?? "CREATE POLICY");
    return { ...partial, kind: "privilege", warning: true };
  }

  if (/\bDROP\s+POLICY\b/i.test(normalized)) {
    partial.rlsChanges?.push("DROP POLICY");
    impacts.push("DROP POLICY");
    return { ...partial, kind: "privilege", warning: true };
  }

  if (["INSERT", "UPDATE", "DELETE", "MERGE"].includes(verb)) {
    impacts.push(`${verb} (${normalized.length > 80 ? `${normalized.slice(0, 77)}…` : normalized})`);
    return { ...partial, kind: "dml", warning: verb === "DELETE" };
  }

  if (["CREATE", "ALTER", "DROP", "COMMENT", "TRUNCATE"].includes(verb)) {
    impacts.push(`${verb} statement`);
    return { ...partial, kind: "ddl", warning: assessSqlRisk(normalized).requiresAck };
  }

  impacts.push(verb ? `${verb} statement` : "SQL statement");
  return { ...partial, kind: "other", warning: assessSqlRisk(normalized).requiresAck };
}

/** Parse SQL batch into DDL/DML/privilege impact summaries for toolview cards. */
export function parseDdlImpact(sql: string): DdlImpactSummary {
  const statements = splitSqlStatements(sql);
  const empty: DdlImpactSummary = {
    kind: "other",
    impacts: [],
    tablesCreated: [],
    tablesAltered: [],
    tablesDropped: [],
    indexesCreated: [],
    foreignKeys: [],
    grants: [],
    revokes: [],
    rlsChanges: [],
    warning: false,
  };
  if (statements.length === 0) return empty;

  const merged: DdlImpactSummary = { ...empty };
  const kindRank: Record<SqlStatementKind, number> = {
    other: 0,
    dml: 1,
    ddl: 2,
    privilege: 3,
  };

  for (const statement of statements) {
    const part = parseStatementImpact(statement);
    merged.impacts.push(...(part.impacts ?? []));
    merged.tablesCreated.push(...(part.tablesCreated ?? []));
    merged.tablesAltered.push(...(part.tablesAltered ?? []));
    merged.tablesDropped.push(...(part.tablesDropped ?? []));
    merged.indexesCreated.push(...(part.indexesCreated ?? []));
    merged.foreignKeys.push(...(part.foreignKeys ?? []));
    merged.grants.push(...(part.grants ?? []));
    merged.revokes.push(...(part.revokes ?? []));
    merged.rlsChanges.push(...(part.rlsChanges ?? []));
    if (part.warning) merged.warning = true;
    const partKind = part.kind ?? "other";
    if (kindRank[partKind] >= kindRank[merged.kind]) {
      merged.kind = partKind;
    }
  }

  return merged;
}
