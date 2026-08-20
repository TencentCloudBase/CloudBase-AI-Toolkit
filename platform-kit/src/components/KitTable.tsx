import * as React from "react";

export interface KitTableRow {
  key: string;
  cells: React.ReactNode[];
  onClick?: () => void;
}

export interface KitTableProps {
  columns: string[];
  rows: KitTableRow[];
  empty: string;
  colsClass: "cols-4" | "cols-5" | "cols-6" | "cols-7";
}

export function KitTable(props: KitTableProps): React.ReactElement {
  if (props.rows.length === 0) {
    return <div className="cb-kit-restricted">{props.empty}</div>;
  }
  return (
    <div className="cb-kit-card cb-kit-table">
      <div className={`cb-kit-table-head ${props.colsClass}`}>
        {props.columns.map((col) => (
          <span key={col}>{col}</span>
        ))}
      </div>
      {props.rows.map((row) => (
        <button
          key={row.key}
          type="button"
          className={`cb-kit-table-row ${props.colsClass}${row.onClick ? "" : " static"}`}
          onClick={row.onClick}
        >
          {row.cells.map((cell, index) => (
            <span key={`${row.key}-${index}`}>{cell}</span>
          ))}
        </button>
      ))}
    </div>
  );
}
