import * as React from "react";
import { IconCheck, IconChevron, IconCopy, IconDownload } from "../lib/icons.js";
import {
  cellText,
  parseTable,
  toCsv,
  type ToolBlock,
} from "../lib/parse-tool-result.js";
import { ensureStyles } from "../styles.js";

export interface DataTableCardProps {
  callId?: string;
  toolName?: string;
  block?: ToolBlock;
}

export function DataTableCard(props: DataTableCardProps): React.ReactElement {
  ensureStyles();
  const toolName = props.toolName ?? props.block?.toolName ?? props.block?.name ?? "query";
  const table = parseTable(props.block, toolName);
  const [sortKey, setSortKey] = React.useState<string | undefined>(undefined);
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("asc");
  const [page, setPage] = React.useState(0);
  const [copied, setCopied] = React.useState(false);
  const pageSize = 20;

  const sorted = React.useMemo(() => {
    if (!sortKey) return table.rows;
    const copy = [...table.rows];
    copy.sort((a, b) => {
      const left = cellText(a[sortKey]);
      const right = cellText(b[sortKey]);
      return sortDir === "asc" ? left.localeCompare(right) : right.localeCompare(left);
    });
    return copy;
  }, [table.rows, sortKey, sortDir]);

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const view = sorted.slice(page * pageSize, (page + 1) * pageSize);

  const copyJson = async () => {
    await navigator.clipboard.writeText(JSON.stringify(table.rows, null, 2));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  const exportCsv = () => {
    const csv = toCsv(table.columns, table.rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${toolName}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="cb-root">
      <div className="cb-toolcard">
        <div className="cb-tc-head">
          <span className="cb-st">
            <IconCheck />
          </span>
          <span className="cb-name">{toolName}</span>
          <span className="cb-spacer" />
          {table.elapsed ? <span>{table.elapsed}</span> : null}
        </div>
        {table.columns.length === 0 ? (
          <div className="cb-placeholder">没有可展示的表格行。结果可能是空集或非表格结构。</div>
        ) : (
          <div className="cb-tbl-wrap">
            <table className="cb-table">
              <thead>
                <tr>
                  {table.columns.map((col) => (
                    <th
                      key={col}
                      onClick={() => {
                        if (sortKey === col) setSortDir(sortDir === "asc" ? "desc" : "asc");
                        else {
                          setSortKey(col);
                          setSortDir("asc");
                        }
                        setPage(0);
                      }}
                    >
                      {col}
                      {sortKey === col ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {view.map((row, index) => (
                  <tr key={index}>
                    {table.columns.map((col) => (
                      <td key={col} className={col === "id" ? "cb-row-id" : undefined}>
                        {cellText(row[col])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="cb-tfoot">
          <span className="cb-spacer">
            {table.rows.length} 行{table.elapsed ? ` · ${table.elapsed}` : ""}
          </span>
          <button className="cb-act" type="button" onClick={() => void copyJson()}>
            {copied ? <IconCheck /> : <IconCopy />}
            {copied ? "已复制" : "复制 JSON"}
          </button>
          <button className="cb-act" type="button" onClick={exportCsv}>
            <IconDownload />
            导出 CSV
          </button>
          <div className="cb-pg">
            <button
              className="cb-btn"
              type="button"
              disabled={page === 0}
              onClick={() => setPage(Math.max(0, page - 1))}
            >
              <IconChevron dir="left" />
            </button>
            <span>
              {page + 1}/{pages}
            </span>
            <button
              className="cb-btn"
              type="button"
              disabled={page + 1 >= pages}
              onClick={() => setPage(Math.min(pages - 1, page + 1))}
            >
              <IconChevron dir="right" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
