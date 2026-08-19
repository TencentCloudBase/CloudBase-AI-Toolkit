import * as React from "react";
import { WriteOpCard, type WriteOpCardProps } from "../kit/components/WriteOpCard.js";
import { assessSqlBatchRisk } from "../../shared/sql-ident.js";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body: string;
  meta?: string[];
  onCancel: () => void;
  onConfirm: () => void;
}

/** @deprecated Prefer WriteOpCard for SQL write confirmations. */
export function ConfirmDialog(props: ConfirmDialogProps): React.ReactElement | null {
  if (!props.open) return null;
  const cardProps: WriteOpCardProps = {
    modal: true,
    title: props.title,
    subtitle: props.meta?.join(" · "),
    sql: props.body,
    risk: assessSqlBatchRisk(props.body),
    onSkip: props.onCancel,
    onRun: props.onConfirm,
  };
  return React.createElement(WriteOpCard, cardProps);
}
