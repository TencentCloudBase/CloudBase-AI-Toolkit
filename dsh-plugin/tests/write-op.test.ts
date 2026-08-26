import { describe, expect, it } from "vitest";
import { buildRunQueryMessage, extractWriteOp } from "../src/shared/write-op.js";

describe("extractWriteOp", () => {
  it("extracts managePgDatabase execute SQL", () => {
    const args = JSON.stringify({
      action: "execute",
      sql: "INSERT INTO public.todos (title) VALUES ('x')",
      confirm: false,
    });
    const op = extractWriteOp("mcp__cloudbase__managePgDatabase", args);
    expect(op?.toolName).toBe("managePgDatabase");
    expect(op?.sql).toContain("INSERT");
    expect(op?.confirmed).toBe(false);
    expect(op?.risk.readOnly).toBe(false);
  });

  it("returns null for read-only execute", () => {
    const args = JSON.stringify({ action: "execute", sql: "SELECT 1" });
    expect(extractWriteOp("managePgDatabase", args)).toBeNull();
  });

  it("extracts DROP TABLE as destructive", () => {
    const args = JSON.stringify({
      action: "execute",
      sql: "DROP TABLE public.todos",
      confirm: false,
    });
    const op = extractWriteOp("managePgDatabase", args);
    expect(op?.risk.risk).toBe("destructive");
    expect(op?.risk.requiresAck).toBe(true);
  });

  it("extracts GRANT statements", () => {
    const args = JSON.stringify({
      action: "execute",
      sql: "GRANT SELECT ON public.todos TO authenticated",
    });
    const op = extractWriteOp("managePgDatabase", args);
    expect(op?.risk.risk).toBe("security_change");
  });

  it("builds run query message for PG", () => {
    const op = extractWriteOp(
      "managePgDatabase",
      JSON.stringify({ action: "execute", sql: "DELETE FROM t WHERE id=1" }),
    );
    expect(op).not.toBeNull();
    const message = buildRunQueryMessage(op!);
    expect(message).toContain("managePgDatabase");
    expect(message).toContain("confirm=true");
    expect(message).toContain("DELETE");
  });
});
