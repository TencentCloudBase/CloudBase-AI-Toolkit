import * as React from "react";
import type { DeploymentRecord } from "../core/types.js";
import { ConfirmDialog } from "./ConfirmDialog.js";

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
    return <div style={{ padding: 12, color: "var(--cb-text-3)", fontSize: 12 }}>…</div>;
  }
  if (props.error) {
    return <div style={{ padding: 12, color: "var(--cb-danger)", fontSize: 12 }}>{props.error}</div>;
  }

  const label = (status: DeploymentRecord["status"]) =>
    props.statusLabels?.[status] ?? status;

  return (
    <div className="cb-kit-section">
      {props.title ? <div className="cb-kit-section-h">{props.title}</div> : null}
      <div className="cb-kit-timeline">
        {props.records.length === 0 ? (
          <div className="cb-kit-restricted" style={{ margin: 0 }}>—</div>
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
                  <span style={{ fontWeight: 600 }}>{record.resourceName}</span>
                  <span style={{ color: "var(--cb-text-3)", fontSize: 11 }}>{record.resourceType}</span>
                  <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--cb-text-3)", fontFamily: "var(--cb-mono)" }}>
                    {record.deployedAt ?? "—"}
                  </span>
                </button>
                {isOpen ? (
                  <div className="cb-kit-deploy-body">
                    {record.previewUrl ? (
                      <div style={{ marginBottom: 8 }}>
                        <a
                          href={record.previewUrl}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: "var(--cb-blue)", fontFamily: "var(--cb-mono)", fontSize: 11.5 }}
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
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 10.5, color: "var(--cb-text-3)", marginBottom: 4 }}>
                          {props.expandLabel}
                        </div>
                        {record.relatedResources.map((rel) => (
                          <div key={`${rel.type}:${rel.name}`} style={{ fontFamily: "var(--cb-mono)", fontSize: 11 }}>
                            {rel.type}: {rel.name}
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {props.onRollback && record.status === "success" ? (
                      <button
                        type="button"
                        className="cb-kit-btn ghost"
                        disabled={rolling === record.id}
                        onClick={() => setRollbackTarget(record)}
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
        confirmLabel={props.rollbackLabel ?? "Rollback"}
        danger
        pending={Boolean(rollbackTarget && rolling === rollbackTarget.id)}
        onCancel={() => setRollbackTarget(undefined)}
        onConfirm={() => {
          if (!rollbackTarget || !props.onRollback) return;
          setRolling(rollbackTarget.id);
          void props
            .onRollback(rollbackTarget)
            .finally(() => {
              setRolling(undefined);
              setRollbackTarget(undefined);
            });
        }}
      />
    </div>
  );
}
