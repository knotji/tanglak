import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("reconciliation_candidates RLS migration", () => {
  const migration = readFileSync(
    join(process.cwd(), "supabase/migrations/202607130002_reconciliation_candidates.sql"),
    "utf8",
  );
  const sqlOnly = migration
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  it("enables row level security on the new table", () => {
    expect(migration).toContain("alter table public.reconciliation_candidates enable row level security");
  });

  it("scopes every policy through auth.uid() = user_id", () => {
    expect(migration).toContain('for select\n  using (auth.uid() = user_id)');
    expect(migration).toContain('for insert\n  with check (auth.uid() = user_id)');
    expect(migration).toContain('for update\n  using (auth.uid() = user_id)\n  with check (auth.uid() = user_id)');
  });

  it("never grants a broad using(true)/with check(true) policy", () => {
    expect(sqlOnly).not.toMatch(/using\s*\(\s*true\s*\)/i);
    expect(sqlOnly).not.toMatch(/with check\s*\(\s*true\s*\)/i);
  });

  it("never defines a for all or for delete policy", () => {
    expect(sqlOnly).not.toMatch(/for all/i);
    expect(sqlOnly.match(/for delete/gi) ?? []).toHaveLength(0);
  });

  it("is additive only -- no drop table/column outside the documented rollback comment", () => {
    expect(sqlOnly).not.toMatch(/drop table/i);
    expect(sqlOnly).not.toMatch(/drop column/i);
  });

  it("reuses the existing autopilot_confidence_level enum rather than adding a second confidence scale", () => {
    expect(migration).toContain("public.autopilot_confidence_level");
  });

  it("enforces idempotency at the database level with a unique index", () => {
    expect(migration).toMatch(/create unique index .*idempotency_key/);
  });

  it("rejects empty source transaction id arrays with cardinality, not nullable array_length", () => {
    expect(migration).toContain(
      "constraint reconciliation_candidates_source_ids_nonempty check (cardinality(source_transaction_ids) > 0)",
    );
    expect(migration).not.toContain("array_length(source_transaction_ids, 1) > 0");
  });
});
