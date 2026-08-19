import * as React from "react";
import type { CloudBaseData, RowPage, TableSummary } from "../../../shared/types.js";
import { quotePgTable } from "../../../shared/sql-ident.js";
import { appendUserMessage } from "../../lib/typert.js";
import { IconPlus, IconPlay, IconSql, IconTable } from "../../lib/icons.js";
import { cellText, friendlyError } from "../../lib/parse-tool-result.js";
import { ConfirmDialog } from "../ConfirmDialog.js";
import { SqlEditor } from "./SqlEditor.js";

export function DatabaseTab(props: { data?: CloudBaseData }): React.ReactElement {
  const [tables, setTables] = React.useState<TableSummary[]>([]);
  const [selected, setSelected] = React.useState<TableSummary | undefined>(undefined);
  const [page, setPage] = React.useState<RowPage | undefined>(undefined);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [mode, setMode] = React.useState<"data" | "sql">("data");
  const [sql, setSql] = React.useState("SELECT * FROM public.todos LIMIT 20;");
  const [confirm, setConfirm] = React.useState<string | undefined>(undefined);
  const [pendingWrite, setPendingWrite] = React.useState<string | undefined>(undefined);

  React.useEffect(() => {
    if (!props.data) {
      setError("cloudbaseData 服务未注入。请确认 Host 插件已加载。");
      return;
    }
    void props.data
      .listTables()
      .then((list) => {
        setTables(list);
        setError(undefined);
        setSelected((current) => current ?? list[0]);
      })
      .catch((err: unknown) => setError(friendlyError(err instanceof Error ? err.message : String(err))));
  }, [props.data]);

  React.useEffect(() => {
    if (!props.data || !selected || mode !== "data") return;
    const qualified = `${selected.schema}.${selected.name}`;
    void props.data
      .readRows(qualified, { limit: 50 })
      .then(setPage)
      .catch((err: unknown) => setError(friendlyError(err instanceof Error ? err.message : String(err))));
  }, [props.data, selected, mode]);

  const grouped = {
    table: tables.filter((item) => item.kind === "table"),
    view: tables.filter((item) => item.kind === "view"),
    function: tables.filter((item) => item.kind === "function"),
  };

  const runSql = async () => {
    const write = /^\s*(insert|update|delete|alter|drop|create|truncate)/i.test(sql);
    if (write) {
      setPendingWrite(sql);
      setConfirm(sql);
      return;
    }
    if (!props.data) return;
    try {
      setPage(await props.data.runReadSql(sql));
      setError(undefined);
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : String(err)));
    }
  };

  const confirmWrite = async () => {
    if (!pendingWrite) return;
    await appendUserMessage(
      props.data,
      `请在 CloudBase PostgreSQL 中执行以下写操作，先确认权限再调用 managePgDatabase(action=execute, confirm=true):\n${pendingWrite}`,
    );
    setConfirm(undefined);
    setPendingWrite(undefined);
  };

  const insertRow = async () => {
    if (!selected) return;
    const table = quotePgTable(`${selected.schema}.${selected.name}`);
    setPendingWrite(`INSERT INTO ${table} DEFAULT VALUES;`);
    setConfirm(`INSERT INTO ${table} DEFAULT VALUES;`);
  };

  return (
    <div className="cb-dpanel">
      {mode === "sql" ? (
        <>
          <div className="cb-db-toolbar">
            <span>SQL</span>
            <span className="cb-spacer" />
            <button className="cb-mini" type="button" onClick={() => setMode("data")}>
              返回表
            </button>
          </div>
          <SqlEditor value={sql} onChange={setSql} />
          <div className="cb-sql-bar">
            <button className="cb-btn primary" type="button" onClick={() => void runSql()}>
              <IconPlay />
              运行
            </button>
            <span className="cb-hint">写操作将发送给模型确认后执行</span>
          </div>
          {error ? <div className="cb-error">{error}</div> : null}
          {page ? (
            <div className="cb-tbl-wrap">
              <table className="cb-table">
                <thead>
                  <tr>
                    {page.columns.map((col) => (
                      <th key={col}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {page.rows.map((row, index) => (
                    <tr key={index}>
                      {page.columns.map((col) => (
                        <td key={col}>{cellText(row[col])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      ) : (
        <div className="cb-db">
          <div className="cb-tree">
            <div className="cb-tree-sec">
              <IconTable /> Tables
            </div>
            {error && tables.length === 0 ? (
              <div className="cb-placeholder" style={{ margin: "8px", fontSize: "11px", textAlign: "left" }}>
                {error}
              </div>
            ) : null}
            {grouped.table.map((item) => (
              <button
                key={`${item.schema}.${item.name}`}
                className={`cb-tree-item${selected?.name === item.name ? " active" : ""}`}
                type="button"
                onClick={() => setSelected(item)}
              >
                <IconTable />
                <span>{item.name}</span>
                <span className="cb-cnt">{item.rowCount ?? ""}</span>
              </button>
            ))}
            {grouped.table.length === 0 && !error ? (
              <div className="cb-placeholder" style={{ margin: "8px" }}>
                暂无表（需已登录且环境已开通数据库）
              </div>
            ) : null}
            <div className="cb-tree-sec">Views</div>
            {grouped.view.map((item) => (
              <button
                key={`${item.schema}.${item.name}`}
                className="cb-tree-item"
                type="button"
                onClick={() => setSelected(item)}
              >
                {item.name}
              </button>
            ))}
            <div className="cb-tree-sec">Functions</div>
            {grouped.function.map((item) => (
              <button
                key={`${item.schema}.${item.name}`}
                className="cb-tree-item"
                type="button"
                onClick={() => setSelected(item)}
              >
                {item.name}
              </button>
            ))}
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
            <div className="cb-db-toolbar">
              <strong>{selected?.name ?? "未选择表"}</strong>
              <span>
                {selected?.columnCount ? `${selected.columnCount} 列` : ""}
                {selected?.rowCount !== undefined ? ` · ${selected.rowCount} 行` : ""}
              </span>
              <span className="cb-spacer" />
              <button className="cb-mini" type="button" onClick={() => setMode("sql")}>
                <IconSql /> SQL
              </button>
              {selected && selected.schema !== "document" ? (
                <>
                  <button className="cb-mini" type="button" onClick={() => void insertRow()}>
                    <IconPlus /> 行
                  </button>
                  <button
                    className="cb-mini"
                    type="button"
                    onClick={() => {
                      if (!selected) return;
                      const table = quotePgTable(`${selected.schema}.${selected.name}`);
                      setPendingWrite(`ALTER TABLE ${table} ADD COLUMN new_col text;`);
                      setConfirm(`ALTER TABLE ${table} ADD COLUMN new_col text;`);
                    }}
                  >
                    列
                  </button>
                </>
              ) : null}
            </div>
            {error ? <div className="cb-error">{error}</div> : null}
            {page && page.columns.length > 0 ? (
              <div className="cb-tbl-wrap">
                <table className="cb-table">
                  <thead>
                    <tr>
                      {page.columns.map((col) => (
                        <th key={col}>{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {page.rows.map((row, index) => (
                      <tr key={index}>
                        {page.columns.map((col) => (
                          <td key={col} className={col === "id" ? "cb-row-id" : undefined}>
                            {cellText(row[col])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="cb-placeholder">选择一张表以加载真实行数据。</div>
            )}
          </div>
        </div>
      )}
      <ConfirmDialog
        open={Boolean(confirm)}
        title="确认执行写操作"
        body={confirm ?? ""}
        meta={["经 CloudBase 权限模型", "写入会话后由模型确认执行"]}
        onCancel={() => setConfirm(undefined)}
        onConfirm={() => void confirmWrite()}
      />
    </div>
  );
}
