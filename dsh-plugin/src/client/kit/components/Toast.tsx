import * as React from "react";
import { IconWarn } from "../../lib/icons.js";
import { ensureStyles } from "../../styles.js";

export interface ToastProps {
  message: string;
  tone?: "error" | "info" | "warn";
  onClose?: () => void;
  /** 自动关闭毫秒数（0 = 不自动关）。 */
  autoCloseMs?: number;
}

/**
 * 通用 Toast 浮窗（kit 组件）：右下 Cookie 风格卡片，可选自动关闭。
 * 适合友好错误提示、状态变更通知，避免 inline 占位挤占主内容区。
 */
export function Toast(props: ToastProps): React.ReactElement {
  ensureStyles();
  const tone = props.tone ?? "info";

  React.useEffect(() => {
    if (!props.onClose || !props.autoCloseMs) return;
    const timer = window.setTimeout(props.onClose, props.autoCloseMs);
    return () => window.clearTimeout(timer);
  }, [props.onClose, props.autoCloseMs]);

  return (
    <div className="cb-toast" data-tone={tone} role="status">
      {tone === "warn" || tone === "error" ? <IconWarn /> : null}
      <span className="cb-toast-msg">{props.message}</span>
      {props.onClose ? (
        <button
          type="button"
          className="cb-toast-close"
          onClick={props.onClose}
          aria-label="关闭"
          title="关闭"
        >
          ×
        </button>
      ) : null}
    </div>
  );
}