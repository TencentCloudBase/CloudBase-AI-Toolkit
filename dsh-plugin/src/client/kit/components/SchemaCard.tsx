import * as React from "react";
import { getBlockArgs, parseSchemaResult, parseTable, type ToolBlock } from "../../lib/parse-tool-result.js";
import { ResourceTable } from "./ResourceTable.js";
import { ToolCardShell } from "./ToolCardShell.js";

export interface SchemaCardProps {
  toolName?: string;
  block?: ToolBlock;
}

export function SchemaCard(props: SchemaCardProps): React.ReactElement {
  const toolName = props.toolName ?? props.block?.toolName ?? "queryPgDatabase";
  const args = getBlockArgs(props.block);
  const action = String(args.action ?? "schema");
  const schema = parseSchemaResult(props.block);

  if (action === "metadata" && schema.metadataObjects.length > 0) {
    const table = parseTable(props.block, toolName);
    return (
      <ResourceTable
        columns={table.columns.length > 0 ? table.columns : ["schemaTable", "kind", "estimatedRows", "columnCount"]}
        rows={table.rows.length > 0 ? table.rows : schema.metadataObjects}
        title={`${toolName} · metadata`}
        elapsed={table.elapsed}
        fileName={toolName}
      />
    );
  }

  const warnings: string[] = [];
  if (schema.rowLevelSecurityEnabled && schema.policies.length === 0) {
    warnings.push("RLS 已启用但未发现策略 — 客户端读写会被拒绝。");
  }

  return (
    <ToolCardShell
      title={`${toolName} · ${action}`}
      subtitle={schema.objectName ?? "schema"}
      warnings={warnings}
      tone={warnings.length > 0 ? "warn" : "ok"}
    >
      {schema.columns.length > 0 ? (
        <section className="cb-schema-sec">
          <div className="cb-schema-title">列</div>
          <div className="cb-tbl-wrap">
            <table className="cb-table">
              <thead>
                <tr>
                  <th>名称</th>
                  <th>类型</th>
                  <th>可空</th>
                  <th>主键</th>
                </tr>
              </thead>
              <tbody>
                {schema.columns.map((col) => (
                  <tr key={col.name}>
                    <td>{col.name}</td>
                    <td>{col.dataType}</td>
                    <td>{col.nullable ? "YES" : "NO"}</td>
                    <td>{col.primaryKey ? "PK" : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {schema.indexes.length > 0 ? (
        <section className="cb-schema-sec">
          <div className="cb-schema-title">索引</div>
          <div className="cb-chip-row">
            {schema.indexes.map((index) => (
              <span key={index.name} className="cb-chip">
                {index.name}
                {index.columns?.length ? ` (${index.columns.join(", ")})` : ""}
                {index.unique ? " · unique" : ""}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      {schema.foreignKeys.length > 0 ? (
        <section className="cb-schema-sec">
          <div className="cb-schema-title">外键</div>
          <div className="cb-tbl-wrap">
            <table className="cb-table">
              <thead>
                <tr>
                  <th>名称</th>
                  <th>列</th>
                  <th>引用</th>
                </tr>
              </thead>
              <tbody>
                {schema.foreignKeys.map((fk, index) => (
                  <tr key={fk.name ?? index}>
                    <td>{fk.name ?? "—"}</td>
                    <td>{fk.columns?.join(", ") ?? "—"}</td>
                    <td>{fk.references ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {schema.policies.length > 0 ? (
        <section className="cb-schema-sec">
          <div className="cb-schema-title">RLS 策略</div>
          <div className="cb-tbl-wrap">
            <table className="cb-table">
              <thead>
                <tr>
                  <th>策略</th>
                  <th>命令</th>
                  <th>角色</th>
                </tr>
              </thead>
              <tbody>
                {schema.policies.map((policy, index) => (
                  <tr key={policy.name ?? index}>
                    <td>{policy.name ?? "—"}</td>
                    <td>{policy.command ?? "—"}</td>
                    <td>{policy.roles?.join(", ") ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {schema.columns.length === 0 &&
      schema.indexes.length === 0 &&
      schema.foreignKeys.length === 0 &&
      schema.policies.length === 0 ? (
        <div className="cb-placeholder">没有可展示的结构信息。</div>
      ) : null}
    </ToolCardShell>
  );
}
