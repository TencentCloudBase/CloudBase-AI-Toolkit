import * as React from "react";
import { IconCheck, IconExternal } from "../lib/icons.js";
import { EnvBadge } from "../kit/components/EnvBadge.js";
import { parseDeploy, type ToolBlock } from "../lib/parse-tool-result.js";
import { recordDeployUrl } from "../lib/recent-deploys.js";
import { ensureStyles } from "../styles.js";

export interface DeployPreviewCardProps {
  callId?: string;
  toolName?: string;
  block?: ToolBlock;
}

/**
 * 通用"访问地址"预览卡片：覆盖所有返回真实 URL 的 CloudBase 工具
 * （manageHosting / manageCloudRun / manageFunctions / manageApps / manageGateway）。
 * 只要解析出 accessUrl 就展示 iframe 预览；管理类动作（删除/查询等）显示完成占位。
 */
const DEPLOY_ACTION = /upload|deploy|create|register|init|traffic|enable|publish/i;

export function DeployPreviewCard(props: DeployPreviewCardProps): React.ReactElement {
  ensureStyles();
  const toolName = props.toolName ?? props.block?.toolName ?? "manageHosting";
  const deploy = parseDeploy(props.block);
  const args = (props.block?.args ?? {}) as Record<string, unknown>;
  const action = typeof args.action === "string" ? args.action : "deploy";
  const isDeployAction = Boolean(deploy.url) || DEPLOY_ACTION.test(action);

  // 解析到 URL 后推到全局 recent-deploys 列表，PreviewTab 会自动加载；
  // 若为新 URL（首次出现），额外通知 DetailsPanel 激活右侧预览。
  React.useEffect(() => {
    if (deploy.url && recordDeployUrl(deploy.url)) {
      window.dispatchEvent(new CustomEvent("cloudbase-dsh:activate-preview", { detail: deploy.url }));
    }
  }, [deploy.url]);

  if (!isDeployAction) {
    return (
      <div className="cb-root">
        <div className="cb-toolcard">
          <div className="cb-tc-head">
            <span className="cb-st">
              <IconCheck />
            </span>
            <span className="cb-name">
              {toolName} · {action}
            </span>
            <EnvBadge />
            <span className="cb-spacer" />
          </div>
          <div className="cb-placeholder">该管理操作已完成。部署/发布动作返回访问地址后在此预览。</div>
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
          <span className="cb-name">
            {toolName} · {action}
          </span>
          <EnvBadge />
          <span className="cb-spacer" />
        </div>
        <div className="cb-preview">
          {deploy.url ? (
            <iframe className="cb-iframe" title="CloudBase preview" src={deploy.url} />
          ) : (
            <div
              className="cb-iframe"
              style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "#8a8f98" }}
            >
              等待真实访问地址（部署完成后在此预览）
            </div>
          )}
          <div className="cb-meta">
            <div>
              <div className="k">访问地址</div>
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
              <div className="k">更新时间</div>
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
