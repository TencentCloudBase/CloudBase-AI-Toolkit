import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import * as React from "react";
import {
  sqlAlterPolicy,
  sqlCreatePolicy,
  sqlDropPolicy,
  sqlListSchemaPolicies,
  sqlListSchemas,
  sqlListMigrations,
  sqlToggleRLS,
} from "../src/pg/sql.js";
import { bucketUserGrowth } from "../src/utils/insights.js";
import { buildLogQueryString, buildLogSearchFilters } from "../src/utils/log-filters.js";
import { ConfirmDialog } from "../src/components/ConfirmDialog.js";
import { AuthUsersPage } from "../src/components/auth/AuthUsersPage.js";
import { KitProvider } from "../src/hooks/use-menu.js";
import { RlsPolicyEditor } from "../src/components/database/DatabaseParts.js";
import type { PlatformProvider } from "../src/core/provider.js";

describe("ConfirmDialog", () => {
  it("calls onConfirm when confirm clicked", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Delete?"
        body="Sure?"
        onCancel={() => {}}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
    expect(onConfirm).toHaveBeenCalled();
  });
});

describe("RlsPolicyEditor templates", () => {
  const labels = {
    "db.policy.create": "Create",
    "db.policy.name": "Name",
    "db.policy.command": "Command",
    "db.policy.roles": "Roles",
    "db.policy.using": "Using",
    "db.policy.withCheck": "With check",
    "db.policy.preview": "Preview",
    "db.policy.confirm": "Save",
    "db.policy.templates": "Templates",
    "db.policy.form": "Form",
    "db.policy.templatePublicRead": "Public read",
    "common.cancel": "Cancel",
  };

  it("applies public read template", () => {
    render(
      <RlsPolicyEditor
        open
        schemaTable="public.todos"
        labels={labels}
        onClose={() => {}}
        onSubmit={async () => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /templates/i }));
    fireEvent.click(screen.getByRole("button", { name: /public read/i }));
    expect(screen.getByDisplayValue("true")).toBeTruthy();
  });
});

describe("AuthUsersPage pagination", () => {
  it("renders total and page controls", async () => {
    const users = Array.from({ length: 3 }, (_, i) => ({ uid: `u${i}`, name: `n${i}` }));
    render(
      <KitProvider
        locale="en"
        provider={{
          searchAppUsers: async () => ({ users, total: 45 }),
          setAppUserStatus: async () => undefined,
        } as unknown as PlatformProvider}
      >
        <AuthUsersPage />
      </KitProvider>,
    );
    expect(await screen.findByText(/45 total/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /previous/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /next/i })).toBeTruthy();
  });
});

describe("pg/sql", () => {
  it("generates schema policy list SQL", () => {
    expect(sqlListSchemaPolicies("public")).toContain("pg_policies");
    expect(sqlListSchemaPolicies("public")).toContain("schemaname = 'public'");
  });

  it("generates RLS toggle SQL", () => {
    expect(sqlToggleRLS("public.users", true)).toBe(
      'ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;',
    );
    expect(sqlToggleRLS("public.users", false)).toContain("DISABLE ROW LEVEL SECURITY");
  });

  it("generates policy CRUD SQL", () => {
    const create = sqlCreatePolicy({
      name: "select_own",
      schemaTable: "public.todos",
      command: "SELECT",
      roles: ["public"],
      using: "auth.uid() = user_id",
    });
    expect(create).toContain('CREATE POLICY "select_own"');
    expect(create).toContain("USING (auth.uid() = user_id)");

    const alter = sqlAlterPolicy({
      name: "select_own",
      schemaTable: "public.todos",
      command: "SELECT",
      roles: ["authenticated"],
      using: "true",
      previousName: "select_own",
    });
    expect(alter).toContain('ALTER POLICY "select_own"');

    expect(sqlDropPolicy("public.todos", "select_own")).toContain('DROP POLICY "select_own"');
  });

  it("generates schema and migration SQL", () => {
    expect(sqlListSchemas()).toContain("pg_namespace");
    expect(sqlListMigrations()).toContain("pg_migrations");
  });
});

describe("insights", () => {
  it("bucketUserGrowth accumulates by createdAt", () => {
    const now = new Date();
    const users = [
      { uid: "a", createdAt: new Date(now.getTime() - 86400000).toISOString() },
      { uid: "b", createdAt: now.toISOString() },
    ];
    const points = bucketUserGrowth(users, 7);
    expect(points[points.length - 1]).toBe(2);
  });
});

describe("logs filters", () => {
  it("combines service and level into queryString", () => {
    const q = buildLogQueryString("", "scf", "error");
    expect(q).toContain("src:app");
    expect(q).toContain("log:ERROR");
  });

  it("buildLogSearchFilters includes time range", () => {
    const filters = buildLogSearchFilters({
      queryString: "",
      service: "gateway",
      level: "all",
      timePreset: "4h",
    });
    expect(filters.queryString).toContain("logType:accesslog");
    expect(filters.startTime).toBeTruthy();
    expect(filters.endTime).toBeTruthy();
  });

  it("normalizes datetime-local custom range", () => {
    const filters = buildLogSearchFilters({
      queryString: "",
      service: "",
      level: "all",
      timePreset: "custom",
      customStart: "2026-08-20T10:00",
      customEnd: "2026-08-20T12:00",
    });
    expect(filters.startTime).toBe("2026-08-20 10:00:00");
    expect(filters.endTime).toBe("2026-08-20 12:00:00");
  });
});
