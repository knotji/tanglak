import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("debt soft-delete migration", () => {
  const migration = readFileSync(
    join(process.cwd(), "supabase/migrations/202607140001_debt_soft_delete.sql"),
    "utf8",
  );

  it("adds an archival debt status instead of changing debt/payment foreign keys", () => {
    expect(migration).toContain("alter type public.debt_status add value if not exists 'deleted'");
    expect(migration).toContain("add column if not exists deleted_at timestamptz");
    expect(migration).toContain("where status <> 'deleted'");
    expect(migration).not.toContain("on delete cascade");
    expect(migration).not.toContain("alter table public.transactions");
  });
});
