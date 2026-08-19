import * as React from "react";
import { DATA_TABLE_TOOLS, DEPLOY_TOOLS, URL_TOOLS } from "../shared/constants.js";
import { DataTableCard } from "./components/DataTableCard.js";
import { DeliverableRow } from "./components/DeliverableRow.js";
import { DeployPreviewCard } from "./components/DeployPreviewCard.js";
import { DetailsPanel } from "./components/DetailsPanel/index.js";
import { openDetails, registerKeyedSlot, registerNamedSlot, type SlotHost } from "./lib/slots.js";
import { getDataService } from "./lib/typert.js";
import { ensureStyles } from "./styles.js";

export const name = "cloudbase-dsh-plugin-client";
// connection 提供 /api RPC 通道（CloudBase 数据直调 host Remote，不依赖 ctx.remote 的
// 编译期固定能力集）。不能 inject "remote.cloudbaseData"（第三方贡献不可注入）。
export const inject = ["slots", "layout", "connection"];

function withData(
  ctx: SlotHost,
  Component: React.ComponentType<{ cloudbaseData?: ReturnType<typeof getDataService>; openDetails?: () => void }>,
) {
  return function Bound(props: Record<string, unknown>) {
    return React.createElement(Component, {
      ...props,
      cloudbaseData: getDataService(ctx),
      openDetails: () => ctx.layout?.openDetails?.(),
    });
  };
}

export function apply(ctx: SlotHost): void {
  ensureStyles();

  for (const toolName of DATA_TABLE_TOOLS) {
    registerKeyedSlot(ctx, "tool.call.toolview", toolName, DataTableCard);
    registerKeyedSlot(ctx, "tool.call.toolview", `mcp__cloudbase__${toolName}`, DataTableCard);
  }
  for (const toolName of DEPLOY_TOOLS) {
    registerKeyedSlot(ctx, "tool.call.toolview", toolName, DeployPreviewCard);
    registerKeyedSlot(ctx, "tool.call.toolview", `mcp__cloudbase__${toolName}`, DeployPreviewCard);
  }

  registerNamedSlot(ctx, "conversation.chat.turnTail", "cloudbase-deliverable", DeliverableRow, {
    // chain 槽需要 select 选择器：命中任意"返回 URL"的 CloudBase 部署工具才渲染交付物行。
    select: (owner) => {
      const turn = (owner as { turn?: Record<string, unknown> })?.turn;
      if (!turn) return null;
      const nodes = Array.isArray(turn.nodes) ? (turn.nodes as Array<Record<string, unknown>>) : [];
      const hasDeploy = nodes.some((node) =>
        URL_TOOLS.some((tool) => `${node.toolName ?? node.name ?? ""}`.includes(tool)),
      );
      return hasDeploy ? nodes : null;
    },
  });

  const Panel = withData(ctx, DetailsPanel);
  for (const slotName of ["details", "conversation.details", "layout.details"]) {
    // 用更低 priority shadow 原生 details 面板：登录后右侧栏即 CloudBase 面板。
    registerNamedSlot(ctx, slotName, "cloudbase-details", Panel, { priority: -10 });
  }

  void getDataService(ctx)
    ?.authStatus()
    .then((status) => {
      if (status.signedIn) openDetails(ctx);
    })
    .catch((error: unknown) => {
      console.warn(
        "[cloudbase] details auto-open skipped:",
        error instanceof Error ? error.message : String(error),
      );
    });
}

export { DataTableCard, DeployPreviewCard, DeliverableRow, DetailsPanel };
