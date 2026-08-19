import * as React from "react";
import type { SchemaSummary } from "../../lib/toolview-parsers.js";
import { ToolCardShell } from "./ToolCardShell.js";

export interface SchemaCardProps {
  title: string;
  schema: SchemaSummary;
  elapsed?: string;
}

export function SchemaCard(props: SchemaCardProps): React.ReactElement {
  const { schema } = props;
  return (
    <ToolCardShell title={props.title} badge="Schema" elapsed={props.elapsed} showEnvBadge>
      {schema.objectName ? (
        <div className="cb-tv-section-head">
          <strong>{schema.objectName}</strong>
          {schema.rowCount !== undefined ? (
            <span className="cb-tv-chip muted">{schema.rowCount} rows</span>
          ) : null}
          {schema.rlsEnabled ? <span className="cb-tv-chip warn">RLS enabled</span> : null}
        </div>
      ) : null}

      {schema.columns.length > 0 ? (
        <section className="cb-tv-section">
          <div className="cb-tree-sec">Columns</div>
          <div className="cb-tbl-wrap">
            <table className="cb-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Nullable</th>
                  <th>Default</th>
                </tr>
              </thead>
              <tbody>
                {schema.columns.map((col) => (
                  <tr key={col.name}>
                    <td>{col.name}</td>
                    <td>{col.type}</td>
                    <td>{col.nullable ? "YES" : "NO"}</td>
                    <td className="cb-row-id">{col.defaultValue ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {schema.primaryKey.length > 0 ? (
        <section className="cb-tv-section">
          <div className="cb-tree-sec">Primary key</div>
          <div className="cb-tv-impact-row">
            {schema.primaryKey.map((col) => (
              <span key={col} className="cb-tv-chip">
                {col}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      {schema.indexes.length > 0 ? (
        <section className="cb-tv-section">
          <div className="cb-tree-sec">Indexes</div>
          <ul className="cb-tv-impact-list">
            {schema.indexes.map((idx) => (
              <li key={idx.name}>
                <strong>{idx.name}</strong>
                {idx.definition ? <span className="cb-row-id"> — {idx.definition}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {schema.foreignKeys.length > 0 ? (
        <section className="cb-tv-section">
          <div className="cb-tree-sec">Foreign keys</div>
          <ul className="cb-tv-impact-list">
            {schema.foreignKeys.map((fk) => (
              <li key={`${fk.column}-${fk.references}`}>
                {fk.column} → {fk.references}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {schema.policies.length > 0 ? (
        <section className="cb-tv-section">
          <div className="cb-tree-sec">RLS policies</div>
          <ul className="cb-tv-impact-list">
            {schema.policies.map((p) => (
              <li key={p.name}>
                {p.name}
                {p.command ? ` (${p.command})` : ""}
                {p.roles?.length ? ` · ${p.roles.join(", ")}` : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </ToolCardShell>
  );
}
