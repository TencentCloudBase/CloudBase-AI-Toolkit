import * as React from "react";
import type { SecretItem } from "../../../shared/types.js";
import { IconPlus } from "../../lib/icons.js";

export interface SecretsPanelProps {
  secrets: SecretItem[];
  onPropose: (message: string) => void;
}

export function SecretsPanel(props: SecretsPanelProps): React.ReactElement {
  const [keyName, setKeyName] = React.useState("");
  const [value, setValue] = React.useState("");
  const [source, setSource] = React.useState(props.secrets[0]?.source ?? "");

  React.useEffect(() => {
    if (!source && props.secrets[0]?.source) setSource(props.secrets[0].source);
  }, [props.secrets, source]);

  const sources = Array.from(new Set(props.secrets.map((item) => item.source)));

  return (
    <div>
      <div className="cb-tree-sec">密钥 · 环境变量</div>
      <div className="cb-env-list" style={{ paddingTop: 4 }}>
        {props.secrets.map((item) => (
          <div className="cb-env-row" key={`${item.sourceKind}:${item.source}:${item.key}`}>
            <span className="k">
              {item.source}/{item.key}
            </span>
            <span className="v">
              {item.valueMasked}
              <button
                className="cb-mini"
                type="button"
                onClick={() =>
                  props.onPropose(
                    `请删除 ${item.sourceKind === "function" ? "云函数" : "云托管"} ${item.source} 的环境变量 ${item.key}。走 queryFunctions/manageFunctions 或 capi（service=scf/tcb），先确认再执行。`,
                  )
                }
              >
                删除
              </button>
            </span>
          </div>
        ))}
        {props.secrets.length === 0 ? (
          <div className="cb-placeholder">暂无环境变量（需已登录且有云函数/云托管）</div>
        ) : null}
      </div>
      <div className="cb-sql-bar">
        <select
          className="cb-select"
          value={source}
          onChange={(event) => setSource(event.target.value)}
        >
          {sources.length === 0 ? <option value="">选择来源</option> : null}
          {sources.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <input
          className="cb-webview-input"
          placeholder="KEY"
          value={keyName}
          onChange={(event) => setKeyName(event.target.value)}
        />
        <input
          className="cb-webview-input"
          placeholder="VALUE"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        <button
          className="cb-mini"
          type="button"
          disabled={!source || !keyName}
          onClick={() => {
            props.onPropose(
              `请为 ${source} 设置环境变量 ${keyName}=${value}。云函数走 manageFunctions(action=updateFunctionConfig)，云托管走 capi service=tcb。先确认再执行。`,
            );
            setKeyName("");
            setValue("");
          }}
        >
          <IconPlus /> 添加
        </button>
      </div>
    </div>
  );
}
