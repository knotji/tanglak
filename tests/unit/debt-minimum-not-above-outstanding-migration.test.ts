import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/202607110008_debt_minimum_not_above_outstanding.sql"),
  "utf8",
);

describe("debt minimum-not-above-outstanding migration", () => {
  it("adds an additive, not-valid check constraint", () => {
    expect(migration).toContain("debts_minimum_not_above_outstanding");
    expect(migration).toContain("not valid");
    expect(migration).toContain(
      "minimum_payment_satang is null\n        or outstanding_balance_satang is null\n        or minimum_payment_satang <= outstanding_balance_satang",
    );
  });

  it("guards against re-adding the constraint if it already exists", () => {
    expect(migration).toContain("select 1 from pg_constraint");
    expect(migration).toContain("conname = 'debts_minimum_not_above_outstanding'");
  });

  it("does not rewrite or validate existing rows", () => {
    expect(migration).not.toMatch(/validate constraint debts_minimum_not_above_outstanding;\s*$/m);
    expect(migration).not.toContain("update public.debts");
    expect(migration).not.toContain("delete from public.debts");
  });

  it("does not modify historical migrations 006 or 007", () => {
    expect(migration).toContain("No historical migration file");
  });
});
