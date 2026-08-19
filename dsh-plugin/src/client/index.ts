import * as React from "react";
import { DATA_TABLE_TOOLS, DEPLOY_TOOLS, URL_TOOLS, WRITE_OP_TOOLS } from "../shared/constants.js";
import { DataTableCard } from "./components/DataTableCard.js";
import { makeWriteOpToolCard } from "./components/WriteOpToolCard.js";
import { DeliverableRow } from "./components/DeliverableRow.js";
import { DeployPreviewCard } from "./components/DeployPreviewCard.js";
import { DetailsPanel } from "./components/DetailsPanel/index.js";
import { EnvBoundRow } from "./components/EnvBoundRow.js";
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

  const WriteOpCard = makeWriteOpToolCard(getDataService(ctx));
  for (const toolName of WRITE_OP_TOOLS) {
    registerKeyedSlot(ctx, "tool.call.toolview", toolName, WriteOpCard);
    registerKeyedSlot(ctx, "tool.call.toolview", `mcp__cloudbase__${toolName}`, WriteOpCard);
  }

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

  // 环境绑定联动：模型调用 auth set_env 后，EnvBoundRow 渲染"已绑定环境"并
  // 派发 env-bound 事件，让右侧 EnvSelector 与 MCP 绑定状态保持一致。
  registerNamedSlot(ctx, "conversation.chat.turnTail", "cloudbase-env-bound", EnvBoundRow, {
    select: (owner) => {
      const turn = (owner as { turn?: Record<string, unknown> })?.turn;
      if (!turn) return null;
      const nodes = Array.isArray(turn.nodes) ? (turn.nodes as Array<Record<string, unknown>>) : [];
      const hasSetEnv = nodes.some((node) => {
        const name = `${node.toolName ?? node.name ?? ""}`;
        if (!name.includes("auth")) return false;
        const args = (node.args ?? (node.block as Record<string, unknown> | undefined)?.args ?? {}) as Record<
          string,
          unknown
        >;
        return args.action === "set_env";
      });
      return hasSetEnv ? nodes : null;
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
