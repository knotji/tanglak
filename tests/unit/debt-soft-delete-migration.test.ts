import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("debt soft-delete migration", () => {
  const statusMigration = readFileSync(
    join(process.cwd(), "supabase/migrations/202607140001_debt_soft_delete_status.sql"),
    "utf8",
  ).replace(/\r\n/g, "\n");
  const schemaMigration = readFileSync(
    join(process.cwd(), "supabase/migrations/202607140002_debt_soft_delete.sql"),
    "utf8",
  ).replace(/\r\n/g, "\n");

  it("isolates the enum addition in the first migration", () => {
    expect(statusMigration).toContain("alter type public.debt_status add value if not exists 'deleted'");
    expect(statusMigration).not.toContain("where status <> 'deleted'");
    expect(statusMigration).not.toContain("create index");
    expect(statusMigration).not.toContain("add column if not exists deleted_at");
    expect(statusMigration).toContain("cannot remove enum labels directly");
  });

  it("puts deleted-dependent schema work in the second migration", () => {
    expect(schemaMigration).not.toContain("alter type public.debt_status add value");
    expect(schemaMigration).toContain("add column if not exists deleted_at timestamptz");
    expect(schemaMigration).toContain("where status <> 'deleted'");
    expect(schemaMigration).toContain("debts_user_active_idx");
    expect(schemaMigration).toContain("Drop debts_user_active_idx and debts.deleted_at");
  });

  it("does not change debt/payment foreign keys", () => {
    expect(statusMigration + schemaMigration).not.toContain("on delete cascade");
    expect(statusMigration + schemaMigration).not.toContain("alter table public.transactions");
  });
});
