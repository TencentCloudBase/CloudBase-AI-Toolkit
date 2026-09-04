/**
 * Shared SQL risk heuristics.
 *
 * Extracted from databasePG.ts so both the interactive PG execute path and the
 * declarative deploy path classify destructive SQL with the *same* rules,
 * avoiding drift between two independent detectors.
 *
 * These are conservative lexical heuristics, not a full SQL parser: they strip
 * leading comments, read the leading verb, and match destructive keywords. They
 * are meant to decide whether an *extra* human confirmation is warranted, not to
 * be a security boundary.
 */

/** Strip leading line (`--`, `#`) and block (`/* *​/`) comments and whitespace. */
export function stripLeadingSqlComments(sql: string): string {
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

/** Return the leading SQL verb (uppercased), ignoring leading comments. */
export function getSqlVerb(sql: string): string {
  const normalized = stripLeadingSqlComments(sql);
  const match = normalized.match(/^([a-zA-Z]+)/);
  return match ? match[1].toUpperCase() : "";
}

/**
 * Whether a *single* SQL statement is destructive (drops/truncates data or
 * removes/renames schema objects).
 */
export function isDestructiveSql(sql: string): boolean {
  const normalized = stripLeadingSqlComments(sql);
  const verb = getSqlVerb(normalized);

  if (["DROP", "TRUNCATE", "DELETE"].includes(verb)) {
    return true;
  }

  if (verb === "ALTER") {
    return /\b(DROP|RENAME)\b/i.test(normalized);
  }

  return false;
}

/**
 * Split a possibly multi-statement SQL script into individual statements.
 *
 * Naive split on `;` at statement boundaries, but aware of single/double quotes,
 * line/block comments, and PostgreSQL dollar-quoted strings ($$ ... $$ or
 * $tag$ ... $tag$) so semicolons inside string bodies / function definitions do
 * not split a statement. Good enough for the conservative destructive scan; not
 * a full parser.
 */
export function splitSqlStatements(sqlText: string): string[] {
  const statements: string[] = [];
  let current = "";
  let i = 0;
  const n = sqlText.length;

  while (i < n) {
    const ch = sqlText[i];
    const next = sqlText[i + 1];

    // line comment -- ... (to end of line)
    if (ch === "-" && next === "-") {
      const end = sqlText.indexOf("\n", i);
      const stop = end === -1 ? n : end + 1;
      current += sqlText.slice(i, stop);
      i = stop;
      continue;
    }

    // block comment /* ... */
    if (ch === "/" && next === "*") {
      const end = sqlText.indexOf("*/", i + 2);
      const stop = end === -1 ? n : end + 2;
      current += sqlText.slice(i, stop);
      i = stop;
      continue;
    }

    // single- or double-quoted string
    if (ch === "'" || ch === '"') {
      const quote = ch;
      current += ch;
      i += 1;
      while (i < n) {
        current += sqlText[i];
        // handle escaped quote by doubling ('' or "")
        if (sqlText[i] === quote) {
          if (sqlText[i + 1] === quote) {
            current += sqlText[i + 1];
            i += 2;
            continue;
          }
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }

    // dollar-quoted string: $$ ... $$ or $tag$ ... $tag$
    if (ch === "$") {
      const tagMatch = sqlText.slice(i).match(/^\$([a-zA-Z_][a-zA-Z0-9_]*)?\$/);
      if (tagMatch) {
        const tag = tagMatch[0];
        const end = sqlText.indexOf(tag, i + tag.length);
        const stop = end === -1 ? n : end + tag.length;
        current += sqlText.slice(i, stop);
        i = stop;
        continue;
      }
    }

    if (ch === ";") {
      if (current.trim().length > 0) {
        statements.push(current.trim());
      }
      current = "";
      i += 1;
      continue;
    }

    current += ch;
    i += 1;
  }

  if (current.trim().length > 0) {
    statements.push(current.trim());
  }

  return statements;
}

/**
 * Scan a (possibly multi-statement) SQL script and return the destructive
 * statements found. Empty array means no destructive statement detected.
 */
export function findDestructiveStatements(sqlText: string): string[] {
  return splitSqlStatements(sqlText).filter((stmt) => isDestructiveSql(stmt));
}
