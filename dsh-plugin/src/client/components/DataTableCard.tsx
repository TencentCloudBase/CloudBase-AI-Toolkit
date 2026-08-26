import * as React from "react";
import { parseTable, type ToolBlock } from "../lib/parse-tool-result.js";
import { ResourceTable } from "../kit/components/ResourceTable.js";

export interface DataTableCardProps {
  callId?: string;
  toolName?: string;
  block?: ToolBlock;
}

/**
 * MCP 工具结果的表格 toolview：把 tool block 解析为 columns/rows 后，
 * 交给通用 kit 组件 ResourceTable 渲染（排序/分页/复制/CSV）。
 */
export function DataTableCard(props: DataTableCardProps): React.ReactElement {
  const toolName = props.toolName ?? props.block?.toolName ?? props.block?.name ?? "query";
  const table = parseTable(props.block, toolName);
  return (
    <ResourceTable
      columns={table.columns}
      rows={table.rows}
      title={table.title}
      elapsed={table.elapsed}
      fileName={toolName}
      showEnvBadge
    />
  );
}
