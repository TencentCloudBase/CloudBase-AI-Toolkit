import * as React from "react";
import type { CloudBaseData, EnvInfoView } from "../../../shared/types.js";
import { IconCheck, IconCopy } from "../../lib/icons.js";
import { friendlyError } from "../../lib/parse-tool-result.js";

export function ConfigTab(props: { data?: CloudBaseData }): React.ReactElement {
  const [info, setInfo] = React.useState<EnvInfoView | undefined>(undefined);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!props.data) {
      setError("cloudbaseData 服务未注入。");
      return;
    }
    void props.data
      .envInfo()
      .then(setInfo)
      .catch((err: unknown) => setError(friendlyError(err instanceof Error ? err.message : String(err))));
  }, [props.data]);

  const copy = async () => {
    if (!info?.envId) return;
    await navigator.clipboard.writeText(info.envId);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className="cb-dpanel">
      {error ? <div className="cb-error">{error}</div> : null}
      <div className="cb-env-list">
        <div className="cb-env-row">
          <span className="k">环境 ID</span>
          <span className="v full">
            {info?.envId ?? "—"}
            <button className="cb-copy" type="button" onClick={() => void copy()} title="复制环境 ID">
              {copied ? <IconCheck /> : <IconCopy />}
            </button>
            {copied ? <span className="cb-toast">已复制</span> : null}
          </span>
        </div>
        <div className="cb-env-row">
          <span className="k">地域</span>
          <span className="v">{info?.regionLabel ?? "—"}</span>
        </div>
        <div className="cb-env-row">
          <span className="k">云函数</span>
          <span className="v">{info ? `${info.functionCount} 个` : "—"}</span>
        </div>
        <div className="cb-env-row">
          <span className="k">托管域名</span>
          <span className="v">{info ? `${info.hostingDomainCount} 个` : "—"}</span>
        </div>
        <div className="cb-env-row">
          <span className="k">时区</span>
          <span className="v">{info?.timezone ?? "—"}</span>
        </div>
        {info?.alias ? (
          <div className="cb-env-row">
            <span className="k">别名</span>
            <span className="v">{info.alias}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
