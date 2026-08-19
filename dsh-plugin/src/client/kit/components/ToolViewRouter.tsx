import * as React from "react";
import { DataTableCard } from "../../components/DataTableCard.js";
import { type ToolBlock } from "../../lib/parse-tool-result.js";
import { resolveToolViewKind, type ToolViewCardKind } from "../../lib/toolview-routing.js";
import { AuthStatusCard } from "./AuthStatusCard.js";
import { DdlCard } from "./DdlCard.js";
import { EnvBoundCard } from "./EnvBoundCard.js";
import { MutationCard } from "./MutationCard.js";
import { NoSQLSchemaCard } from "./NoSQLSchemaCard.js";
import { PrivilegesCard } from "./PrivilegesCard.js";
import { SchemaCard } from "./SchemaCard.js";

export interface ToolViewRouterProps {
  callId?: string;
  toolName?: string;
  block?: ToolBlock;
}

type ToolViewComponent = React.ComponentType<ToolViewRouterProps>;

const CARD_BY_KIND: Record<ToolViewCardKind, ToolViewComponent> = {
  "data-table": DataTableCard,
  ddl: DdlCard,
  mutation: MutationCard,
  privileges: PrivilegesCard,
  schema: SchemaCard,
  "nosql-schema": NoSQLSchemaCard,
  "env-bound": EnvBoundCard,
  "auth-status": AuthStatusCard,
};

export function resolveToolViewComponent(toolName: string, block?: ToolBlock): ToolViewComponent {
  return CARD_BY_KIND[resolveToolViewKind(toolName, block)];
}

export function ToolViewRouter(props: ToolViewRouterProps): React.ReactElement {
  const toolName = props.toolName ?? props.block?.toolName ?? props.block?.name ?? "query";
  const Component = resolveToolViewComponent(toolName, props.block);
  return React.createElement(Component, props);
}
