import * as React from "react";
import { parseNoSqlSchema, type ToolBlock } from "../../lib/parse-tool-result.js";
import { ToolCardShell } from "./ToolCardShell.js";

export interface NoSQLSchemaCardProps {
  toolName?: string;
  block?: ToolBlock;
}

export function NoSQLSchemaCard(props: NoSQLSchemaCardProps): React.ReactElement {
  const toolName = props.toolName ?? props.block?.toolName ?? "readNoSqlDatabaseStructure";
  const parsed = parseNoSqlSchema(props.block);

  return (
    <ToolCardShell title={`${toolName} · ${parsed.action}`} subtitle={`${parsed.collections.length} 个集合`}>
      {parsed.collections.length === 0 ? (
        <div className="cb-placeholder">没有可展示的 NoSQL 集合结构。</div>
      ) : (
        parsed.collections.map((collection) => (
          <section key={collection.name} className="cb-schema-sec">
            <div className="cb-schema-title">
              {collection.name}
              {typeof collection.count === "number" ? ` · ${collection.count} docs` : ""}
            </div>
            {collection.fields && collection.fields.length > 0 ? (
              <div className="cb-tbl-wrap">
                <table className="cb-table">
                  <thead>
                    <tr>
                      <th>字段</th>
                      <th>类型</th>
                    </tr>
                  </thead>
                  <tbody>
                    {collection.fields.map((field) => (
                      <tr key={field.name}>
                        <td>{field.name}</td>
                        <td>{field.type ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="cb-chip-row">
                <span className="cb-chip">集合已列出，无字段详情</span>
              </div>
            )}
          </section>
        ))
      )}
    </ToolCardShell>
  );
}
