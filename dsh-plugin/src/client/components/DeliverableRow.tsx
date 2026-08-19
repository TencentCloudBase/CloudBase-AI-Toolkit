import * as React from "react";
import { IconFile } from "../lib/icons.js";
import { parseDeploy, type ToolBlock } from "../lib/parse-tool-result.js";
import { ensureStyles } from "../styles.js";

export interface DeliverableRowProps {
  nodes?: Array<{ type?: string; toolName?: string; name?: string; block?: ToolBlock }>;
  /** chain 槽 select 的返回值注入为 matched。 */
  matched?: unknown;
  turn?: { nodes?: unknown[] };
  block?: ToolBlock;
}

export function DeliverableRow(props: DeliverableRowProps): React.ReactElement | null {
  ensureStyles();
  const matchedNodes = Array.isArray(props.matched)
    ? (props.matched as Array<{ type?: string; toolName?: string; name?: string; block?: ToolBlock }>)
    : [];
  const nodes = props.nodes ?? matchedNodes;
  const hosting = [...nodes]
    .reverse()
    .find((node) => (node.toolName ?? node.name ?? "").includes("manageHosting"));
  const deploy = parseDeploy(hosting?.block ?? props.block);
  if (!deploy.url && deploy.files.length === 0) return null;

  const files = deploy.files.length > 0 ? deploy.files.slice(0, 3) : ["dist/"];

  return (
    <div className="cb-root">
      <div className="cb-deliverable">
        <IconFile />
        <span>产物</span>
        <span>·</span>
        {files.map((file) => (
          <span className="f" key={file}>
            {file}
          </span>
        ))}
        {deploy.url ? (
          <>
            <span>·</span>
            <span>已部署 → </span>
            <a className="cb-link" href={deploy.url} target="_blank" rel="noreferrer">
              {deploy.domain}
            </a>
          </>
        ) : null}
      </div>
    </div>
  );
}
