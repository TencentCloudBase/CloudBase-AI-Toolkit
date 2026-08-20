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
import { sqlToggleRLS } from "../../pg/sql.js";
import { buildDropPolicySql, RlsPolicyEditor, TableDetailSheet, TableListPanel } from "./DatabaseParts.js";
import { SqlEditorPanel } from "./SqlEditorPanel.js";
import { ConfirmDialog } from "../ConfirmDialog.js";

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
  const [confirm, setConfirm] = React.useState<
    | { kind: "rls"; enable: boolean }
    | { kind: "deletePolicy"; policy: PolicySummary }
    | undefined
  >();

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
      "db.policy.form": kit.tr("db.policy.form"),
      "db.policy.templateAuthRead": kit.tr("db.policy.templateAuthRead"),
      "db.policy.templatePublicRead": kit.tr("db.policy.templatePublicRead"),
      "db.policy.templateUserFilter": kit.tr("db.policy.templateUserFilter"),
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
    if (!selected) return;
    setConfirm({ kind: "rls", enable });
  };

  const handleDeletePolicy = (policy: PolicySummary) => {
    if (!selected) return;
    setConfirm({ kind: "deletePolicy", policy });
  };

  const runConfirm = async () => {
    if (!confirm || !selected) return;
    if (confirm.kind === "rls") {
      await mutation.execute(sqlToggleRLS(selected, confirm.enable));
    } else {
      await mutation.execute(buildDropPolicySql(selected, confirm.policy.name));
    }
    setConfirm(undefined);
    refreshSchema();
  };

  if (!isPg) {
    return (
      <div className="cb-kit-page">
        <h2 className="cb-kit-page-title">{kit.tr("db.title")}</h2>
        <FeatureGuard feature={EFeatureId.POSTGRES_ENV} fallback={kit.tr("db.pgOnly")}>
          <div />
        </FeatureGuard>
        {tables.data && tables.data.length > 0 ? (
          <div className="cb-kit-card cb-kit-mt-sm">
            {tables.data.map((table) => (
              <div key={`${table.schema}.${table.name}`} className="cb-kit-list-item">
                {table.schema}.{table.name}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="cb-kit-page">
      <div className="cb-kit-page-head">
        <h2 className="cb-kit-page-title">{kit.tr("db.title")}</h2>
        <div className="cb-kit-page-actions">
          <div className="cb-kit-tabs compact">
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
        <div className="cb-kit-flex-1">
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
                <button type="button" onClick={() => setGlobalTab(undefined)}>{kit.tr("db.backToTables")}</button>
              </div>
              {globalTab === "functions" ? (
                <div className="cb-kit-card">
                  {(functions.data ?? []).map((fn) => (
                    <div key={fn.name} className="cb-kit-list-item">
                      <strong>{fn.name}</strong>
                      <span className="mono cb-kit-ml-sm">{fn.returnType}</span>
                    </div>
                  ))}
                </div>
              ) : null}
              {globalTab === "extensions" ? (
                <div className="cb-kit-card">
                  {(extensions.data ?? []).map((ext) => (
                    <div key={ext.name} className="cb-kit-list-item">
                      {ext.name} <span className="mono">{ext.version}</span>
                    </div>
                  ))}
                </div>
              ) : null}
              {globalTab === "roles" ? (
                <div className="cb-kit-card">
                  {(roles.data ?? []).map((role) => (
                    <div key={role.name} className="cb-kit-list-item">
                      {role.name}
                    </div>
                  ))}
                </div>
              ) : null}
              {globalTab === "migrations" ? (
                <div className="cb-kit-card">
                  {(migrations.data ?? []).map((m) => (
                    <div key={m.version} className="cb-kit-list-item">
                      <div><strong>{m.version}</strong> {m.name}</div>
                      {m.appliedAt ? <div className="cb-kit-muted">{m.appliedAt}</div> : null}
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
      <div className="cb-kit-spread cb-kit-mt-sm">
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
          roleOptions={["public", "authenticated", ...(roles.data ?? []).map((r) => r.name)]}
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
        open={confirm?.kind === "rls"}
        title={confirm?.kind === "rls" && confirm.enable ? labels["db.rls.enable"] : labels["db.rls.disable"]}
        body={confirm?.kind === "rls" && confirm.enable ? labels["db.rls.enable"] : labels["db.rls.disable"]}
        confirmLabel={kit.tr("common.confirm")}
        cancelLabel={labels["common.cancel"]}
        pending={mutation.pending}
        onCancel={() => setConfirm(undefined)}
        onConfirm={() => void runConfirm()}
      />
      <ConfirmDialog
        open={confirm?.kind === "deletePolicy"}
        title={kit.tr("db.policy.delete")}
        body={kit.tr("gateway.deleteConfirm")}
        confirmLabel={kit.tr("common.confirm")}
        cancelLabel={labels["common.cancel"]}
        pending={mutation.pending}
        onCancel={() => setConfirm(undefined)}
        onConfirm={() => void runConfirm()}
      />
    </div>
  );
}
