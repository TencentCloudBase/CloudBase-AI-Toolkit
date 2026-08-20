import * as React from "react";
import type { PolicyInput, PolicySummary, TableSchemaDetail, TableSummary } from "../../core/types.js";
import { sqlAlterPolicy, sqlCreatePolicy, sqlDropPolicy } from "../../pg/sql.js";

const POLICY_TEMPLATES = [
  {
    id: "authRead",
    labelKey: "db.policy.template.authRead",
    using: "auth.role() = 'authenticated'",
    withCheck: "",
  },
  {
    id: "publicRead",
    labelKey: "db.policy.template.publicRead",
    using: "true",
    withCheck: "",
  },
  {
    id: "userFilter",
    labelKey: "db.policy.template.userFilter",
    using: "auth.uid() = user_id",
    withCheck: "auth.uid() = user_id",
  },
] as const;

const DEFAULT_ROLES = ["public", "authenticated"];

export interface RlsPolicyEditorProps {
  open: boolean;
  schemaTable: string;
  initial?: PolicySummary;
  labels: Record<string, string>;
  onClose: () => void;
  onSubmit: (sql: string) => Promise<void>;
  pending?: boolean;
}

const COMMANDS = ["SELECT", "INSERT", "UPDATE", "DELETE", "ALL"];

export function RlsPolicyEditor(props: RlsPolicyEditorProps): React.ReactElement | null {
  const [name, setName] = React.useState("");
  const [command, setCommand] = React.useState("SELECT");
  const [selectedRoles, setSelectedRoles] = React.useState<string[]>(["public"]);
  const [using, setUsing] = React.useState("");
  const [withCheck, setWithCheck] = React.useState("");
  const [panel, setPanel] = React.useState<"form" | "templates">("form");
  const roleOptions = React.useMemo(() => {
    const fromInitial = props.initial?.roles ?? [];
    return [...new Set([...DEFAULT_ROLES, ...fromInitial])];
  }, [props.initial?.roles]);

  React.useEffect(() => {
    if (!props.open) return;
    setName(props.initial?.name ?? "");
    setCommand(props.initial?.command ?? "SELECT");
    setSelectedRoles(props.initial?.roles?.length ? [...props.initial.roles] : ["public"]);
    setUsing(props.initial?.using ?? "");
    setWithCheck(props.initial?.withCheck ?? "");
    setPanel("form");
  }, [props.open, props.initial]);

  if (!props.open) return null;

  const buildInput = (): PolicyInput & { previousName?: string } => ({
    name: name.trim(),
    schemaTable: props.schemaTable,
    command,
    roles: selectedRoles,
    using,
    withCheck,
    previousName: props.initial?.name,
  });

  const previewSql = (() => {
    try {
      const input = buildInput();
      if (!input.name) return "";
      return props.initial
        ? sqlAlterPolicy(input)
        : sqlCreatePolicy(input);
    } catch {
      return "";
    }
  })();

  return (
    <div className="cb-kit-drawer-backdrop" onClick={props.onClose}>
      <div className="cb-kit-drawer" onClick={(e) => e.stopPropagation()}>
        <h3>{props.initial ? props.labels["db.policy.edit"] : props.labels["db.policy.create"]}</h3>
        <div className="cb-kit-tabs">
          <button type="button" className={panel === "form" ? "active" : ""} onClick={() => setPanel("form")}>
            Form
          </button>
          <button type="button" className={panel === "templates" ? "active" : ""} onClick={() => setPanel("templates")}>
            {props.labels["db.policy.templates"] ?? "Templates"}
          </button>
        </div>
        {panel === "templates" ? (
          <div className="cb-kit-section">
            {POLICY_TEMPLATES.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                className="cb-kit-btn ghost"
                style={{ display: "block", width: "100%", marginBottom: 6, textAlign: "left" }}
                onClick={() => {
                  setUsing(tpl.using);
                  setWithCheck(tpl.withCheck);
                  setPanel("form");
                }}
              >
                {props.labels[tpl.labelKey] ?? tpl.id}
              </button>
            ))}
          </div>
        ) : null}
        {panel === "form" ? (
          <>
        <label className="cb-kit-field">
          <span>{props.labels["db.policy.name"]}</span>
          <input className="cb-kit-input" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="cb-kit-field">
          <span>{props.labels["db.policy.command"]}</span>
          <select className="cb-kit-select" value={command} onChange={(e) => setCommand(e.target.value)}>
            {COMMANDS.map((cmd) => (
              <option key={cmd} value={cmd}>{cmd}</option>
            ))}
          </select>
        </label>
        <label className="cb-kit-field">
          <span>{props.labels["db.policy.roles"]}</span>
          <div className="cb-kit-role-select">
            {roleOptions.map((role) => {
              const active = selectedRoles.includes(role);
              return (
                <button
                  key={role}
                  type="button"
                  className={`cb-kit-role-chip${active ? " active" : ""}`}
                  onClick={() =>
                    setSelectedRoles((prev) =>
                      active ? prev.filter((r) => r !== role) : [...prev, role],
                    )
                  }
                >
                  {role}
                </button>
              );
            })}
          </div>
        </label>
        <label className="cb-kit-field">
          <span>{props.labels["db.policy.using"]}</span>
          <textarea className="cb-kit-textarea" value={using} onChange={(e) => setUsing(e.target.value)} rows={3} />
        </label>
        <label className="cb-kit-field">
          <span>{props.labels["db.policy.withCheck"]}</span>
          <textarea className="cb-kit-textarea" value={withCheck} onChange={(e) => setWithCheck(e.target.value)} rows={3} />
        </label>
        {previewSql ? (
          <div className="cb-kit-field">
            <span>{props.labels["db.policy.preview"]}</span>
            <pre className="cb-kit-code">{previewSql}</pre>
          </div>
        ) : null}
        <div className="cb-kit-drawer-actions">
          <button type="button" className="cb-kit-btn ghost" onClick={props.onClose}>
            {props.labels["common.cancel"]}
          </button>
          <button
            type="button"
            className="cb-kit-btn"
            disabled={props.pending || !name.trim() || !previewSql}
            onClick={() => void props.onSubmit(previewSql)}
          >
            {props.labels["db.policy.confirm"]}
          </button>
        </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

export function buildDropPolicySql(schemaTable: string, policyName: string): string {
  return sqlDropPolicy(schemaTable, policyName);
}

export interface TableListPanelProps {
  tables: TableSummary[];
  selected?: string;
  onSelect: (schemaTable: string) => void;
}

export function TableListPanel(props: TableListPanelProps): React.ReactElement {
  const grouped = React.useMemo(() => {
    const tables = props.tables.filter((t) => t.kind === "table" || t.kind === "view");
    return tables.sort((a, b) => a.name.localeCompare(b.name));
  }, [props.tables]);

  return (
    <div className="cb-kit-db-list">
      {grouped.map((table) => {
        const schemaTable = `${table.schema}.${table.name}`;
        const active = props.selected === schemaTable;
        return (
          <button
            key={schemaTable}
            type="button"
            className={`cb-kit-db-item${active ? " active" : ""}`}
            onClick={() => props.onSelect(schemaTable)}
          >
            <span>{table.kind === "view" ? "▷" : "▸"} {table.name}</span>
            {table.rowCount !== undefined ? (
              <span className="sub">{table.rowCount}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export interface TableDetailSheetProps {
  schema?: TableSchemaDetail;
  loading?: boolean;
  activeTab: string;
  onTabChange: (tab: string) => void;
  labels: Record<string, string>;
  onToggleRls?: (enable: boolean) => void;
  onCreatePolicy?: () => void;
  onEditPolicy?: (policy: PolicySummary) => void;
  onDeletePolicy?: (policy: PolicySummary) => void;
  extraTabs?: React.ReactNode;
}

export function TableDetailSheet(props: TableDetailSheetProps): React.ReactElement {
  const tabs = ["structure", "rls", "indexes", "fks"];
  const schema = props.schema;
  const rlsOn = schema?.security.rowLevelSecurityEnabled;
  const noPolicies = rlsOn && (schema?.security.policies.length ?? 0) === 0;

  return (
    <div className="cb-kit-db-detail">
      {schema ? (
        <div className="cb-kit-db-detail-head">
          <code>{schema.schemaTable}</code>
          <span className={`cb-kit-badge ${rlsOn ? "success" : "unknown"}`}>
            RLS: {rlsOn ? "ON" : "OFF"}
          </span>
          {props.onToggleRls ? (
            <button
              type="button"
              className="cb-kit-btn ghost"
              onClick={() => props.onToggleRls?.(!rlsOn)}
            >
              {rlsOn ? props.labels["db.rls.disable"] : props.labels["db.rls.enable"]}
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="cb-kit-tabs">
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            className={props.activeTab === tab ? "active" : ""}
            onClick={() => props.onTabChange(tab)}
          >
            {props.labels[`db.tab.${tab}` as keyof typeof props.labels] ?? tab}
          </button>
        ))}
        {props.extraTabs}
      </div>

      {props.loading ? <div className="cb-kit-restricted">{props.labels["common.loading"]}</div> : null}

      {!props.loading && props.activeTab === "structure" && schema ? (
        <div className="cb-kit-card cb-kit-table">
          <div className="cb-kit-table-head cols-5">
            <span>Name</span><span>Type</span><span>Nullable</span><span>Default</span><span>PK</span>
          </div>
          {schema.columns.map((col) => (
            <div key={col.name} className="cb-kit-table-row static cols-5">
              <span>{col.name}</span>
              <span className="mono">{col.type}</span>
              <span>{col.nullable ? "YES" : "NO"}</span>
              <span className="mono">—</span>
              <span>{col.primaryKey ? "✓" : ""}</span>
            </div>
          ))}
        </div>
      ) : null}

      {!props.loading && props.activeTab === "indexes" && schema ? (
        <div className="cb-kit-card">
          {schema.indexes.map((idx) => (
            <div key={idx.name} style={{ padding: "8px 12px", borderBottom: "1px solid var(--cb-border)" }}>
              <div style={{ fontWeight: 600 }}>{idx.name}</div>
              <div className="mono" style={{ fontSize: 11 }}>{idx.definition}</div>
            </div>
          ))}
          {schema.indexes.length === 0 ? <div className="cb-kit-restricted">{props.labels["common.empty"]}</div> : null}
        </div>
      ) : null}

      {!props.loading && props.activeTab === "fks" && schema ? (
        <div className="cb-kit-card cb-kit-table">
          <div className="cb-kit-table-head cols-4">
            <span>Constraint</span><span>Column</span><span>References</span><span>Ref column</span>
          </div>
          {schema.foreignKeys.map((fk) => (
            <div key={fk.constraintName} className="cb-kit-table-row static cols-4">
              <span>{fk.constraintName}</span>
              <span>{fk.columnName}</span>
              <span>{fk.references}</span>
              <span>{fk.referencedColumn}</span>
            </div>
          ))}
          {schema.foreignKeys.length === 0 ? <div className="cb-kit-restricted">{props.labels["common.empty"]}</div> : null}
        </div>
      ) : null}

      {!props.loading && props.activeTab === "rls" && schema ? (
        <div>
          {noPolicies ? <div className="cb-kit-banner warn">{props.labels["db.rls.noPolicies"]}</div> : null}
          {props.onCreatePolicy ? (
            <button type="button" className="cb-kit-btn" style={{ marginBottom: 8 }} onClick={props.onCreatePolicy}>
              {props.labels["db.policy.create"]}
            </button>
          ) : null}
          {schema.security.policies.map((policy) => (
            <div key={policy.name} className="cb-kit-card" style={{ marginBottom: 8, padding: "10px 12px" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                <strong>{policy.name}</strong>
                <span className="cb-kit-badge unknown">{policy.command}</span>
                <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                  {props.onEditPolicy ? (
                    <button type="button" className="cb-kit-btn ghost" onClick={() => props.onEditPolicy?.(policy)}>
                      {props.labels["db.policy.edit"]}
                    </button>
                  ) : null}
                  {props.onDeletePolicy ? (
                    <button type="button" className="cb-kit-btn ghost" onClick={() => props.onDeletePolicy!(policy)}>
                      {props.labels["db.policy.delete"]}
                    </button>
                  ) : null}
                </span>
              </div>
              <div className="mono" style={{ fontSize: 11 }}>USING ({policy.using ?? "true"})</div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
