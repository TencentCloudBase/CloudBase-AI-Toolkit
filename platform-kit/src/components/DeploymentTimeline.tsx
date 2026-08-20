import * as React from "react";
import { ConfirmDialog } from "./ConfirmDialog.js";
import type { DeploymentRecord } from "../core/types.js";

export interface DeploymentTimelineProps {
  records: DeploymentRecord[];
  loading?: boolean;
  error?: string;
  title?: string;
  statusLabels?: Partial<Record<DeploymentRecord["status"], string>>;
  rollbackLabel?: string;
  rollbackConfirm?: string;
  expandLabel?: string;
  onPreview?: (record: DeploymentRecord) => void;
  onRollback?: (record: DeploymentRecord) => Promise<boolean>;
}

function statusClass(status: DeploymentRecord["status"]): string {
  return status;
}

export function DeploymentTimeline(props: DeploymentTimelineProps): React.ReactElement {
  const [expanded, setExpanded] = React.useState<string | undefined>(undefined);
  const [rolling, setRolling] = React.useState<string | undefined>(undefined);
  const [rollbackTarget, setRollbackTarget] = React.useState<DeploymentRecord | undefined>(undefined);

  if (props.loading) {
    return <div className="cb-kit-muted-block">…</div>;
  }
  if (props.error) {
    return <div className="cb-kit-danger-block">{props.error}</div>;
  }

  const label = (status: DeploymentRecord["status"]) =>
    props.statusLabels?.[status] ?? status;

  return (
    <div className="cb-kit-section">
      {props.title ? <div className="cb-kit-section-h">{props.title}</div> : null}
      <div className="cb-kit-timeline">
        {props.records.length === 0 ? (
          <div className="cb-kit-restricted tight">—</div>
        ) : (
          props.records.map((record) => {
            const isOpen = expanded === record.id;
            return (
              <div key={record.id} className="cb-kit-deploy">
                <button
                  type="button"
                  className="cb-kit-deploy-head"
                  onClick={() => setExpanded(isOpen ? undefined : record.id)}
                >
                  <span className={`cb-kit-badge ${statusClass(record.status)}`}>{label(record.status)}</span>
                  <span className="cb-kit-deploy-name">{record.resourceName}</span>
                  <span className="cb-kit-deploy-meta">{record.resourceType}</span>
                  <span className="cb-kit-deploy-time">
                    {record.deployedAt ?? "—"}
                  </span>
                </button>
                {isOpen ? (
                  <div className="cb-kit-deploy-body">
                    {record.previewUrl ? (
                      <div className="cb-kit-mb-sm">
                        <a
                          href={record.previewUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="cb-kit-preview-link"
                          onClick={(e) => {
                            if (props.onPreview) {
                              e.preventDefault();
                              props.onPreview(record);
                            }
                          }}
                        >
                          {record.previewUrl}
                        </a>
                      </div>
                    ) : null}
                    {record.relatedResources && record.relatedResources.length > 0 ? (
                      <div className="cb-kit-mb-sm">
                        <div className="cb-kit-muted">
                          {props.expandLabel}
                        </div>
                        {record.relatedResources.map((rel) => (
                          <div key={`${rel.type}:${rel.name}`} className="mono">
                            {rel.type}: {rel.name}
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {props.onRollback && record.status === "success" ? (
                      <button
                        type="button"
                        disabled={rolling === record.id}
                        onClick={() => setRollbackTarget(record)}
                        className="cb-kit-btn ghost"
                      >
                        {props.rollbackLabel}
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
      <ConfirmDialog
        open={Boolean(rollbackTarget)}
        title={props.rollbackLabel ?? "Rollback"}
        body={props.rollbackConfirm ?? "Rollback?"}
        pending={Boolean(rolling)}
        onCancel={() => setRollbackTarget(undefined)}
        onConfirm={() => {
          if (!rollbackTarget || !props.onRollback) return;
          const record = rollbackTarget;
          setRolling(record.id);
          void props
            .onRollback(record)
            .finally(() => {
              setRolling(undefined);
              setRollbackTarget(undefined);
            });
        }}
      />
    </div>
  );
}
