import * as React from "react";
import type { ColumnSummary } from "../../../shared/types.js";
import { coerceFormValues, columnsToZodObject, mapPgTypeToFormKind } from "../../../shared/column-form.js";
import { ensureStyles } from "../../styles.js";

export interface DynamicFormProps {
  columns: ColumnSummary[];
  values: Record<string, unknown>;
  title?: string;
  submitLabel?: string;
  onCancel: () => void;
  onSubmit: (values: Record<string, unknown>) => void;
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value) || (typeof value === "object" && value !== null)) {
    return JSON.stringify(value);
  }
  return String(value);
}

/**
 * Zod-driven row editor. Input is column metadata + current values; no cloud binding.
 */
export function DynamicForm(props: DynamicFormProps): React.ReactElement {
  ensureStyles();
  const [draft, setDraft] = React.useState<Record<string, unknown>>(() => ({ ...props.values }));
  const [error, setError] = React.useState<string | undefined>(undefined);

  React.useEffect(() => {
    setDraft({ ...props.values });
  }, [props.values]);

  const submit = () => {
    const coerced = coerceFormValues(props.columns, draft);
    const parsed = columnsToZodObject(props.columns).safeParse(coerced);
    if (!parsed.success) {
      setError(parsed.error.issues.map((issue) => issue.message).join("; "));
      return;
    }
    setError(undefined);
    props.onSubmit(parsed.data as Record<string, unknown>);
  };

  return (
    <div className="cb-mask" role="dialog" aria-modal="true">
      <div className="cb-dialog cb-dialog-wide">
        <div className="cb-dialog-h">{props.title ?? "编辑行"}</div>
        <div className="cb-dialog-b cb-form">
          {props.columns.map((column) => {
            const kind = mapPgTypeToFormKind(column.dataType);
            const disabled = column.primaryKey || !column.isUpdatable;
            const value = displayValue(draft[column.name]);
            return (
              <label className="cb-field" key={column.name}>
                <span className="cb-field-label">
                  {column.name}
                  <span className="cb-field-type">
                    {column.dataType}
                    {column.primaryKey ? " · PK" : ""}
                    {column.nullable ? " · null" : ""}
                  </span>
                </span>
                {column.enums && column.enums.length > 0 ? (
                  <select
                    className="cb-select cb-field-input"
                    disabled={disabled}
                    value={value}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, [column.name]: event.target.value }))
                    }
                  >
                    {column.nullable ? <option value="">(null)</option> : null}
                    {column.enums.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                ) : kind === "boolean" ? (
                  <select
                    className="cb-select cb-field-input"
                    disabled={disabled}
                    value={value}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, [column.name]: event.target.value }))
                    }
                  >
                    {column.nullable ? <option value="">(null)</option> : null}
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                ) : (
                  <input
                    className="cb-webview-input cb-field-input"
                    disabled={disabled}
                    type={kind === "number" ? "number" : "text"}
                    value={value}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, [column.name]: event.target.value }))
                    }
                  />
                )}
              </label>
            );
          })}
          {error ? <div className="cb-error">{error}</div> : null}
        </div>
        <div className="cb-dialog-a">
          <button className="cb-btn" type="button" onClick={props.onCancel}>
            取消
          </button>
          <button className="cb-btn primary" type="button" onClick={submit}>
            {props.submitLabel ?? "生成 UPDATE"}
          </button>
        </div>
      </div>
    </div>
  );
}
