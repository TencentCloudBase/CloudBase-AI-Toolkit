import * as React from "react";
import { IconCheck, IconExternal } from "../lib/icons.js";
import { parseDeploy, type ToolBlock } from "../lib/parse-tool-result.js";
import { ensureStyles } from "../styles.js";

export interface DeployPreviewCardProps {
  callId?: string;
  toolName?: string;
  block?: ToolBlock;
}

export function DeployPreviewCard(props: DeployPreviewCardProps): React.ReactElement {
  ensureStyles();
  const toolName = props.toolName ?? props.block?.toolName ?? "manageHosting";
  const deploy = parseDeploy(props.block);
  const args = (props.block?.args ?? {}) as Record<string, unknown>;
  const isUpload = args.action === "upload" || Boolean(deploy.url);

  if (!isUpload && args.action && args.action !== "upload") {
    return (
      <div className="cb-root">
        <div className="cb-toolcard">
          <div className="cb-tc-head">
            <span className="cb-st">
              <IconCheck />
            </span>
            <span className="cb-name">{toolName} · {String(args.action)}</span>
          </div>
          <div className="cb-placeholder">该管理操作已完成。部署预览仅在 upload 后展示真实域名。</div>
        </div>
      </div>
    );
  }

  return (
    <div className="cb-root">
      <div className="cb-toolcard">
        <div className="cb-tc-head">
          <span className="cb-st">
            <IconCheck />
          </span>
          <span className="cb-name">{toolName} · deploy</span>
        </div>
        <div className="cb-preview">
          {deploy.url ? (
            <iframe className="cb-iframe" title="CloudBase preview" src={deploy.url} />
          ) : (
            <div className="cb-iframe" style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "#8a8f98" }}>
              等待真实域名（manageHosting upload 返回后在此预览）
            </div>
          )}
          <div className="cb-meta">
            <div>
              <div className="k">域名</div>
              <div className="v">
                {deploy.url ? (
                  <a className="cb-link" href={deploy.url} target="_blank" rel="noreferrer">
                    {deploy.domain}
                  </a>
                ) : (
                  "—"
                )}
              </div>
            </div>
            <div>
              <div className="k">最近部署</div>
              <div className="v">{deploy.deployedAt ?? "—"}</div>
            </div>
            <div>
              <div className="k">状态</div>
              <div className="v">
                <span className="cb-ok">
                  <IconCheck />
                  {deploy.statusLabel}
                </span>
              </div>
            </div>
            {deploy.url ? (
              <div>
                <a className="cb-btn" href={deploy.url} target="_blank" rel="noreferrer">
                  <IconExternal />
                  打开
                </a>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
