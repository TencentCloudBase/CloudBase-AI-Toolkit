import * as React from "react";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body: string;
  confirmLabel?: string;
  cancelLabel?: string;
  pending?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmDialog(props: ConfirmDialogProps): React.ReactElement | null {
  if (!props.open) return null;
  return (
    <div className="cb-kit-drawer-backdrop" role="presentation" onClick={props.onCancel}>
      <div
        className="cb-kit-drawer cb-kit-confirm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cb-kit-confirm-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="cb-kit-confirm-title">{props.title}</h3>
        <p className="cb-kit-confirm-body">{props.body}</p>
        <div className="cb-kit-drawer-actions">
          <button type="button" className="cb-kit-btn ghost" onClick={props.onCancel} disabled={props.pending}>
            {props.cancelLabel ?? "Cancel"}
          </button>
          <button type="button" className="cb-kit-btn" onClick={props.onConfirm} disabled={props.pending}>
            {props.confirmLabel ?? "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
