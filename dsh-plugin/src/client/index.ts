import * as React from "react";
import { DATA_TABLE_TOOLS, DEPLOY_TOOLS } from "../shared/constants.js";
import { DataTableCard } from "./components/DataTableCard.js";
import { DeliverableRow } from "./components/DeliverableRow.js";
import { DeployPreviewCard } from "./components/DeployPreviewCard.js";
import { DetailsPanel } from "./components/DetailsPanel/index.js";
import { openDetails, registerKeyedSlot, registerNamedSlot, type SlotHost } from "./lib/slots.js";
import { getDataService } from "./lib/typert.js";
import { ensureStyles } from "./styles.js";

export const name = "cloudbase-dsh-plugin-client";
export const inject = ["slots", "layout", "cloudbaseData"];

function withData(ctx: SlotHost, Component: React.ComponentType<{ cloudbaseData?: ReturnType<typeof getDataService> }>) {
  return function Bound(props: Record<string, unknown>) {
    return React.createElement(Component, { ...props, cloudbaseData: getDataService(ctx) });
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

  registerNamedSlot(ctx, "conversation.chat.turnTail", "cloudbase-deliverable", DeliverableRow);

  const Panel = withData(ctx, DetailsPanel);
  for (const slotName of ["details", "conversation.details", "layout.details"]) {
    registerNamedSlot(ctx, slotName, "cloudbase-details", Panel);
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
