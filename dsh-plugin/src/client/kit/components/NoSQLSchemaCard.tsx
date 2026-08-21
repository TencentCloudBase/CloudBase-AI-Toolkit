import * as React from "react";
import type { NoSQLSchemaSummary } from "../../lib/toolview-parsers.js";
import { ToolCardShell } from "./ToolCardShell.js";

export interface NoSQLSchemaCardProps {
  title: string;
  summary: NoSQLSchemaSummary;
  elapsed?: string;
}

export function NoSQLSchemaCard(props: NoSQLSchemaCardProps): React.ReactElement {
  const { summary } = props;
  return (
    <ToolCardShell title={props.title} badge="NoSQL" elapsed={props.elapsed} showEnvBadge>
      {summary.collectionName ? (
        <div className="cb-tv-section-head">
          <strong>{summary.collectionName}</strong>
          <span className="cb-tv-chip muted">{summary.action}</span>
        </div>
      ) : (
        <div className="cb-tv-section-head">
          <span className="cb-tv-chip muted">{summary.action}</span>
        </div>
      )}

      {summary.collections.length > 0 ? (
        <section className="cb-tv-section">
          <div className="cb-tree-sec">Collections</div>
          <ul className="cb-tv-impact-list">
            {summary.collections.map((col) => (
              <li key={col.name}>
                {col.name}
                {col.count !== undefined ? (
                  <span className="cb-cnt"> {col.count}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {summary.fields.length > 0 ? (
        <section className="cb-tv-section">
          <div className="cb-tree-sec">Fields</div>
          <div className="cb-tbl-wrap">
            <table className="cb-table">
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Type</th>
                </tr>
              </thead>
              <tbody>
                {summary.fields.map((field) => (
                  <tr key={field.name}>
                    <td>{field.name}</td>
                    <td>{field.type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {summary.collections.length === 0 && summary.fields.length === 0 ? (
        <div className="cb-placeholder">No collection schema in the response.</div>
      ) : null}
    </ToolCardShell>
  );
}
