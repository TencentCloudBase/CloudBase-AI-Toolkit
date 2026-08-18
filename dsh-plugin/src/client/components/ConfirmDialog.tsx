import * as React from "react";
import { IconWarn } from "../lib/icons.js";
import { ensureStyles } from "../styles.js";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body: string;
  meta?: string[];
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmDialog(props: ConfirmDialogProps): React.ReactElement | null {
  ensureStyles();
  if (!props.open) return null;
  return (
    <div className="cb-mask" role="dialog" aria-modal="true">
      <div className="cb-dialog">
        <div className="cb-dialog-h">
          <IconWarn />
          {props.title}
        </div>
        <div className="cb-dialog-b">
          {props.body}
          {props.meta && props.meta.length > 0 ? (
            <div className="cb-hint" style={{ marginTop: 10, display: "flex", gap: 14 }}>
              {props.meta.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          ) : null}
        </div>
        <div className="cb-dialog-a">
          <button className="cb-btn" type="button" onClick={props.onCancel}>
            取消
          </button>
          <button className="cb-btn primary" type="button" onClick={props.onConfirm}>
            确认执行
          </button>
        </div>
      </div>
    </div>
  );
}
