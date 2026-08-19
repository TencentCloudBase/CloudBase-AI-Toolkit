import * as React from "react";
import { DataTableCard, type DataTableCardProps } from "./DataTableCard.js";
import { AuthStatusCard } from "../kit/components/AuthStatusCard.js";
import { DdlCard } from "../kit/components/DdlCard.js";
import { EnvBoundCard } from "../kit/components/EnvBoundCard.js";
import { MutationCard } from "../kit/components/MutationCard.js";
import { NoSQLSchemaCard } from "../kit/components/NoSQLSchemaCard.js";
import { PrivilegesCard } from "../kit/components/PrivilegesCard.js";
import { SchemaCard } from "../kit/components/SchemaCard.js";
import { resolveToolViewKind } from "../lib/toolview-routing.js";
import {
  authStatusFromBlock,
  ddlImpactFromBlock,
  envBoundFromBlock,
  mutationFromBlock,
  nosqlSchemaFromBlock,
  schemaFromBlock,
  sqlFromBlock,
  toolLabel,
} from "../lib/toolview-parsers.js";
import type { ToolBlock } from "../lib/parse-tool-result.js";

export interface ToolViewRouterProps extends DataTableCardProps {}

function elapsedFromBlock(block?: ToolBlock): string | undefined {
  return typeof block?.durationMs === "number" ? `${(block.durationMs / 1000).toFixed(1)}s` : undefined;
}

/**
 * Routes MCP tool blocks to action-specific toolview cards, falling back to DataTableCard.
 */
export function ToolViewRouter(props: ToolViewRouterProps): React.ReactElement {
  const toolName = props.toolName ?? props.block?.toolName ?? props.block?.name ?? "tool";
  const kind = resolveToolViewKind(toolName, props.block);
  const title = toolLabel(toolName, props.block);
  const elapsed = elapsedFromBlock(props.block);

  switch (kind) {
    case "ddl": {
      const sql = sqlFromBlock(props.block) ?? "";
      return (
        <DdlCard title={title} sql={sql} impact={ddlImpactFromBlock(props.block)} elapsed={elapsed} />
      );
    }
    case "mutation":
      return <MutationCard title={title} summary={mutationFromBlock(props.block)} />;
    case "privileges": {
      const sql = sqlFromBlock(props.block) ?? "";
      return (
        <PrivilegesCard
          title={title}
          sql={sql}
          impact={ddlImpactFromBlock(props.block)}
          elapsed={elapsed}
        />
      );
    }
    case "schema":
      return (
        <SchemaCard title={title} schema={schemaFromBlock(props.block)} elapsed={elapsed} />
      );
    case "nosql-schema":
      return (
        <NoSQLSchemaCard
          title={title}
          summary={nosqlSchemaFromBlock(props.block)}
          elapsed={elapsed}
        />
      );
    case "env-bound":
      return <EnvBoundCard title={title} summary={envBoundFromBlock(props.block)} />;
    case "auth-status":
      return <AuthStatusCard title={title} summary={authStatusFromBlock(props.block)} />;
    default:
      return React.createElement(DataTableCard, props);
  }
}
