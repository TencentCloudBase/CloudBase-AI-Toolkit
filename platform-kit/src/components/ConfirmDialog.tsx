import * as React from "react";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  pending?: boolean;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmDialog(props: ConfirmDialogProps): React.ReactElement | null {
  if (!props.open) return null;
  return (
    <div className="cb-kit-drawer-backdrop" role="presentation" onClick={props.onCancel}>
      <div
        className="cb-kit-confirm"
        data-testid="cb-kit-confirm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cb-kit-confirm-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="cb-kit-confirm-title">{props.title}</h3>
        <div className="cb-kit-confirm-body">{props.body}</div>
        <div className="cb-kit-drawer-actions">
          <button type="button" className="cb-kit-btn ghost" onClick={props.onCancel} disabled={props.pending}>
            {props.cancelLabel ?? "Cancel"}
          </button>
          <button
            type="button"
            className={`cb-kit-btn${props.danger ? " danger" : ""}`}
            onClick={props.onConfirm}
            disabled={props.pending}
          >
            {props.confirmLabel ?? "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
