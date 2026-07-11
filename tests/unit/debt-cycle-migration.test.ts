import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/202607110007_debt_cycle_fields.sql"),
  "utf8",
);

describe("debt cycle migration", () => {
  it("adds additive active-cycle fields and constraints", () => {
    expect(migration).toContain("add column if not exists cycle_start_date date");
    expect(migration).toContain("add column if not exists cycle_end_date date");
    expect(migration).toContain("add column if not exists statement_date date");
    expect(migration).toContain("add column if not exists credit_limit_satang bigint");
    expect(migration).toContain("debts_cycle_date_order");
    expect(migration).toContain("debts_credit_limit_nonnegative");
  });

  it("scopes recalculation to Bangkok cycle boundaries", () => {
    expect(migration).toContain("Asia/Bangkok");
    expect(migration).toContain("cycle_start_date");
    expect(migration).toContain("cycle_end_date");
    expect(migration).toContain("t.occurred_at >=");
    expect(migration).toContain("t.occurred_at <");
  });

  it("keeps import RPCs aligned with cycle recalculation and account ownership", () => {
    expect(migration).toContain("perform public.recalculate_debt_paid_this_cycle(p_debt_id)");
    expect(migration).toContain("foreach v_debt_id in array v_affected_debt_ids loop");
    expect(migration).toContain("source account not found or not owned by user");
    expect(migration).toContain("destination account not found or not owned by user");
  });
});
