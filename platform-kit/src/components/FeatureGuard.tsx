import * as React from "react";
import { EFeatureId, isFeatureAvailable } from "../core/features.js";
import type { EnvFeatureContext } from "../core/types.js";
import { useKit } from "../hooks/use-menu.js";

export interface FeatureGuardProps {
  feature: EFeatureId;
  featureCtx?: EnvFeatureContext;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function FeatureGuard(props: FeatureGuardProps): React.ReactElement {
  const kit = useKit();
  const ctx = props.featureCtx ?? kit.featureCtx;
  const allowed = isFeatureAvailable(props.feature, ctx);
  if (!allowed) {
    return (
      <div className="cb-kit-restricted">
        {props.fallback ?? kit.tr("feature.restricted")}
      </div>
    );
  }
  return <>{props.children}</>;
}
