import * as React from "react";
import { IconCheck, IconChevron, IconCopy, IconDownload } from "../../lib/icons.js";
import { cellText, toCsv } from "../../lib/parse-tool-result.js";
import { ensureStyles } from "../../styles.js";
import { EnvBadge } from "./EnvBadge.js";

export interface ResourceTableProps {
  columns: string[];
  rows: Record<string, unknown>[];
  title: string;
  elapsed?: string;
  /** 导出 CSV 文件名（不含扩展名）。 */
  fileName?: string;
  /** Show live session env pill in the card header. */
  showEnvBadge?: boolean;
}

/**
 * 通用数据表格（kit 组件）：排序 / 分页 / 复制 JSON / 导出 CSV。
 * 不依赖任何云 provider —— 输入就是 columns + rows。
 */
export function ResourceTable(props: ResourceTableProps): React.ReactElement {
  ensureStyles();
  const { columns, rows, title, elapsed, fileName } = props;
  const [sortKey, setSortKey] = React.useState<string | undefined>(undefined);
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("asc");
  const [page, setPage] = React.useState(0);
  const [copied, setCopied] = React.useState(false);
  const pageSize = 20;

  const sorted = React.useMemo(() => {
    if (!sortKey) return rows;
    const copy = [...rows];
    copy.sort((a, b) => {
      const left = cellText(a[sortKey]);
      const right = cellText(b[sortKey]);
      return sortDir === "asc" ? left.localeCompare(right) : right.localeCompare(left);
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const view = sorted.slice(page * pageSize, (page + 1) * pageSize);

  const copyJson = async () => {
    await navigator.clipboard.writeText(JSON.stringify(rows, null, 2));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  const exportCsv = () => {
    const csv = toCsv(columns, rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileName ?? title}.csv`;
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
          <span className="cb-name">{title}</span>
          {props.showEnvBadge ? <EnvBadge /> : null}
          <span className="cb-spacer" />
          {elapsed ? <span>{elapsed}</span> : null}
        </div>
        {columns.length === 0 ? (
          <div className="cb-placeholder">没有可展示的表格行。结果可能是空集或非表格结构。</div>
        ) : (
          <div className="cb-tbl-wrap">
            <table className="cb-table">
              <thead>
                <tr>
                  {columns.map((col) => (
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
                    {columns.map((col) => (
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
            {rows.length} 行{elapsed ? ` · ${elapsed}` : ""}
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
