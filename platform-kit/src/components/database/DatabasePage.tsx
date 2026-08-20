import * as React from "react";
import type { PlatformProvider } from "../../core/provider.js";
import type { PolicySummary } from "../../core/types.js";
import { EFeatureId } from "../../core/features.js";
import { useTables } from "../../hooks/use-platform.js";
import {
  usePgExtensions,
  usePgFunctions,
  usePgMigrations,
  usePgMutation,
  usePgRoles,
  useTableSchema,
} from "../../hooks/use-database.js";
import { useKit } from "../../hooks/use-menu.js";
import { FeatureGuard } from "../FeatureGuard.js";
import { ConfirmDialog } from "../ConfirmDialog.js";
import { sqlToggleRLS } from "../../pg/sql.js";
import { buildDropPolicySql, RlsPolicyEditor, TableDetailSheet, TableListPanel } from "./DatabaseParts.js";
import { SqlEditorPanel } from "./SqlEditorPanel.js";

export interface DatabasePageProps {
  provider?: PlatformProvider;
}

export function DatabasePage(props: DatabasePageProps): React.ReactElement {
  const kit = useKit();
  const provider = props.provider ?? kit.provider;
  const isPg = kit.featureCtx.isPostgresEnv ?? false;
  const tables = useTables(isPg ? provider : undefined);
  const [selected, setSelected] = React.useState<string | undefined>();
  const [activeTab, setActiveTab] = React.useState("structure");
  const [globalTab, setGlobalTab] = React.useState<string | undefined>();
  const [workspace, setWorkspace] = React.useState<"tables" | "sql">("tables");
  const schemaRes = useTableSchema(isPg ? provider : undefined, selected);
  const mutation = usePgMutation(provider);
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editPolicy, setEditPolicy] = React.useState<PolicySummary | undefined>();
  const [confirmRls, setConfirmRls] = React.useState<boolean | undefined>(undefined);
  const [confirmDropPolicy, setConfirmDropPolicy] = React.useState<PolicySummary | undefined>(undefined);

  const functions = usePgFunctions(isPg ? provider : undefined);
  const extensions = usePgExtensions(isPg ? provider : undefined);
  const roles = usePgRoles(isPg ? provider : undefined);
  const migrations = usePgMigrations(isPg ? provider : undefined);

  React.useEffect(() => {
    if (!selected && tables.data && tables.data.length > 0) {
      const first = tables.data.find((t) => t.kind === "table" || t.kind === "view");
      if (first) setSelected(`${first.schema}.${first.name}`);
    }
  }, [tables.data, selected]);

  const labels = React.useMemo(
    () => ({
      "db.tab.structure": kit.tr("db.tab.structure"),
      "db.tab.rls": kit.tr("db.tab.rls"),
      "db.tab.indexes": kit.tr("db.tab.indexes"),
      "db.tab.fks": kit.tr("db.tab.fks"),
      "db.tab.functions": kit.tr("db.tab.functions"),
      "db.tab.extensions": kit.tr("db.tab.extensions"),
      "db.tab.roles": kit.tr("db.tab.roles"),
      "db.tab.migrations": kit.tr("db.tab.migrations"),
      "db.rls.enable": kit.tr("db.rls.enable"),
      "db.rls.disable": kit.tr("db.rls.disable"),
      "db.rls.noPolicies": kit.tr("db.rls.noPolicies"),
      "db.policy.create": kit.tr("db.policy.create"),
      "db.policy.edit": kit.tr("db.policy.edit"),
      "db.policy.delete": kit.tr("db.policy.delete"),
      "db.policy.name": kit.tr("db.policy.name"),
      "db.policy.command": kit.tr("db.policy.command"),
      "db.policy.roles": kit.tr("db.policy.roles"),
      "db.policy.using": kit.tr("db.policy.using"),
      "db.policy.withCheck": kit.tr("db.policy.withCheck"),
      "db.policy.preview": kit.tr("db.policy.preview"),
      "db.policy.confirm": kit.tr("db.policy.confirm"),
      "db.policy.templates": kit.tr("db.policy.templates"),
      "db.policy.template.authRead": kit.tr("db.policy.template.authRead"),
      "db.policy.template.publicRead": kit.tr("db.policy.template.publicRead"),
      "db.policy.template.userFilter": kit.tr("db.policy.template.userFilter"),
      "common.loading": kit.tr("common.loading"),
      "common.empty": kit.tr("common.empty"),
      "common.cancel": kit.tr("common.cancel"),
    }),
    [kit],
  );

  const refreshSchema = () => {
    schemaRes.reload();
    tables.reload();
  };

  const handleToggleRls = (enable: boolean) => {
    setConfirmRls(enable);
  };

  const handleDeletePolicy = (policy: PolicySummary) => {
    setConfirmDropPolicy(policy);
  };

  if (!isPg) {
    return (
      <div className="cb-kit-page">
        <h2 className="cb-kit-page-title">{kit.tr("db.title")}</h2>
        <FeatureGuard feature={EFeatureId.POSTGRES_ENV} fallback={kit.tr("db.pgOnly")}>
          <div />
        </FeatureGuard>
        {tables.data && tables.data.length > 0 ? (
          <div className="cb-kit-card" style={{ marginTop: 12 }}>
            {tables.data.map((table) => (
              <div key={`${table.schema}.${table.name}`} style={{ padding: "8px 12px", borderBottom: "1px solid var(--cb-border)" }}>
                {table.schema}.{table.name}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="cb-kit-page" data-testid="cb-page-database">
      <div className="cb-kit-page-head">
        <h2 className="cb-kit-page-title">{kit.tr("db.title")}</h2>
        <div className="cb-kit-page-actions">
          <div className="cb-kit-tabs" style={{ marginBottom: 0 }}>
            <button type="button" className={workspace === "tables" ? "active" : ""} onClick={() => setWorkspace("tables")}>
              {kit.tr("db.tab.tables")}
            </button>
            <button type="button" className={workspace === "sql" ? "active" : ""} onClick={() => setWorkspace("sql")}>
              {kit.tr("db.tab.sql")}
            </button>
          </div>
        </div>
      </div>
      {workspace === "sql" ? (
        <SqlEditorPanel
          provider={provider}
          runLabel={kit.tr("db.sql.run")}
          hintLabel={kit.tr("db.sql.hint")}
          confirmWriteLabel={kit.tr("db.sql.confirmWrite")}
        />
      ) : (
        <>
      <div className="cb-kit-db-layout">
        <TableListPanel
          tables={tables.data ?? []}
          selected={selected}
          onSelect={(schemaTable) => {
            setSelected(schemaTable);
            setGlobalTab(undefined);
            setActiveTab("structure");
          }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          {globalTab ? (
            <div>
              <div className="cb-kit-tabs">
                {(["functions", "extensions", "roles", "migrations"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    className={globalTab === tab ? "active" : ""}
                    onClick={() => setGlobalTab(tab)}
                  >
                    {labels[`db.tab.${tab}`]}
                  </button>
                ))}
                <button type="button" onClick={() => setGlobalTab(undefined)}>← Tables</button>
              </div>
              {globalTab === "functions" ? (
                <div className="cb-kit-card">
                  {(functions.data ?? []).map((fn) => (
                    <div key={fn.name} style={{ padding: "8px 12px", borderBottom: "1px solid var(--cb-border)" }}>
                      <strong>{fn.name}</strong>
                      <span className="mono" style={{ marginLeft: 8, fontSize: 11 }}>{fn.returnType}</span>
                    </div>
                  ))}
                </div>
              ) : null}
              {globalTab === "extensions" ? (
                <div className="cb-kit-card">
                  {(extensions.data ?? []).map((ext) => (
                    <div key={ext.name} style={{ padding: "8px 12px", borderBottom: "1px solid var(--cb-border)" }}>
                      {ext.name} <span className="mono">{ext.version}</span>
                    </div>
                  ))}
                </div>
              ) : null}
              {globalTab === "roles" ? (
                <div className="cb-kit-card">
                  {(roles.data ?? []).map((role) => (
                    <div key={role.name} style={{ padding: "8px 12px", borderBottom: "1px solid var(--cb-border)" }}>
                      {role.name}
                    </div>
                  ))}
                </div>
              ) : null}
              {globalTab === "migrations" ? (
                <div className="cb-kit-card">
                  {(migrations.data ?? []).map((m) => (
                    <div key={m.version} style={{ padding: "8px 12px", borderBottom: "1px solid var(--cb-border)" }}>
                      <div><strong>{m.version}</strong> {m.name}</div>
                      {m.appliedAt ? <div style={{ fontSize: 11, color: "var(--cb-text-3)" }}>{m.appliedAt}</div> : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <TableDetailSheet
              schema={schemaRes.data}
              loading={schemaRes.loading}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              labels={labels}
              onToggleRls={handleToggleRls}
              onCreatePolicy={() => {
                setEditPolicy(undefined);
                setEditorOpen(true);
              }}
              onEditPolicy={(policy) => {
                setEditPolicy(policy);
                setEditorOpen(true);
              }}
              onDeletePolicy={handleDeletePolicy}
            />
          )}
        </div>
      </div>
      <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
        {(["functions", "extensions", "roles", "migrations"] as const).map((tab) => (
          <button key={tab} type="button" className="cb-kit-btn ghost" onClick={() => setGlobalTab(tab)}>
            {labels[`db.tab.${tab}`]}
          </button>
        ))}
      </div>
        </>
      )}

      {selected && workspace === "tables" ? (
        <RlsPolicyEditor
          open={editorOpen}
          schemaTable={selected}
          initial={editPolicy}
          labels={labels}
          pending={mutation.pending}
          onClose={() => setEditorOpen(false)}
          onSubmit={async (sql) => {
            await mutation.execute(sql);
            setEditorOpen(false);
            refreshSchema();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={confirmRls !== undefined}
        title={confirmRls ? labels["db.rls.enable"] : labels["db.rls.disable"]}
        body={confirmRls ? labels["db.rls.enable"] : labels["db.rls.disable"]}
        confirmLabel={kit.tr("common.confirm")}
        cancelLabel={labels["common.cancel"]}
        onCancel={() => setConfirmRls(undefined)}
        onConfirm={() => {
          if (!selected || confirmRls === undefined) return;
          void mutation.execute(sqlToggleRLS(selected, confirmRls)).then(() => {
            setConfirmRls(undefined);
            refreshSchema();
          });
        }}
      />

      <ConfirmDialog
        open={Boolean(confirmDropPolicy)}
        title={labels["db.policy.delete"]}
        body={kit.tr("gateway.deleteConfirm")}
        confirmLabel={kit.tr("common.delete")}
        cancelLabel={labels["common.cancel"]}
        danger
        onCancel={() => setConfirmDropPolicy(undefined)}
        onConfirm={() => {
          if (!selected || !confirmDropPolicy) return;
          void mutation
            .execute(buildDropPolicySql(selected, confirmDropPolicy.name))
            .then(() => {
              setConfirmDropPolicy(undefined);
              refreshSchema();
            });
        }}
      />
    </div>
  );
}
