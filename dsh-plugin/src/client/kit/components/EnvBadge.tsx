import * as React from "react";
import { KIT_EVENTS } from "../provider.js";
import { ensureStyles } from "../../styles.js";

export interface EnvBadgeProps {
  /** Optional static env id captured at tool-call time (fallback before events). */
  envId?: string;
  /** When true, show a subtle switching indicator. */
  switching?: boolean;
}

/**
 * Compact env pill for MCP toolview cards. Listens to env-bound / env-changed
 * kit events so cards update when the right panel switches environment.
 */
export function EnvBadge(props: EnvBadgeProps): React.ReactElement | null {
  ensureStyles();
  const [envId, setEnvId] = React.useState<string | undefined>(props.envId);
  const [switching, setSwitching] = React.useState(Boolean(props.switching));

  React.useEffect(() => {
    const sync = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (detail) {
        setEnvId(detail);
        setSwitching(false);
      }
    };
    const onChanging = () => setSwitching(true);
    window.addEventListener(KIT_EVENTS.envBound, sync);
    window.addEventListener(KIT_EVENTS.envChanged, sync);
    window.addEventListener(KIT_EVENTS.envChanging, onChanging);
    return () => {
      window.removeEventListener(KIT_EVENTS.envBound, sync);
      window.removeEventListener(KIT_EVENTS.envChanged, sync);
      window.removeEventListener(KIT_EVENTS.envChanging, onChanging);
    };
  }, []);

  React.useEffect(() => {
    if (props.envId) setEnvId(props.envId);
  }, [props.envId]);

  if (!envId) return null;

  const label = envId.length > 18 ? `${envId.slice(0, 8)}…${envId.slice(-6)}` : envId;

  return (
    <span className={`cb-env-badge${switching ? " switching" : ""}`} title={envId}>
      <span className="cb-env-badge-dot" aria-hidden />
      {label}
      {switching ? <span className="cb-env-badge-state">切换中</span> : null}
    </span>
  );
}
