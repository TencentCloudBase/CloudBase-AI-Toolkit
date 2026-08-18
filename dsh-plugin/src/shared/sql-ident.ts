const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function quotePgIdent(name: string): string {
  if (!IDENT_RE.test(name)) {
    throw new Error(`Invalid PostgreSQL identifier: ${name}`);
  }
  return `"${name}"`;
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
