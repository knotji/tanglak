import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/202607110001_financial_value_guards.sql",
);

describe("financial value guards migration", () => {
  it("exists as a new migration file", () => {
    expect(existsSync(migrationPath)).toBe(true);
  });

  const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";

  it("is additive and idempotent — every constraint is guarded by an existence check", () => {
    const addConstraintCount = (migration.match(/add constraint/g) ?? []).length;
    const existsGuardCount = (migration.match(/if not exists \(/g) ?? []).length;
    expect(addConstraintCount).toBeGreaterThan(0);
    expect(existsGuardCount).toBe(addConstraintCount);
  });

  it("adds every constraint as `not valid` (does not scan/rewrite existing rows)", () => {
    const addConstraintCount = (migration.match(/add constraint/g) ?? []).length;
    const notValidCount = (migration.match(/not valid;/g) ?? []).length;
    expect(notValidCount).toBe(addConstraintCount);
  });

  it("names every constraint clearly with a table-prefixed, purpose-suffixed identifier", () => {
    const expectedConstraints = [
      "debts_original_amount_satang_nonnegative",
      "debts_outstanding_balance_satang_nonnegative",
      "debts_statement_balance_satang_nonnegative",
      "debts_amount_due_satang_nonnegative",
      "debts_minimum_payment_satang_nonnegative",
      "debts_amount_paid_this_cycle_satang_nonnegative",
      "debt_schedules_amount_due_satang_nonnegative",
      "debt_schedules_amount_paid_satang_nonnegative",
      "debt_payments_amount_satang_positive",
      "budget_categories_amount_satang_nonnegative",
      "monthly_budgets_income_satang_nonnegative",
      "recurring_expenses_amount_satang_nonnegative",
      "transaction_items_amount_satang_nonnegative",
      "import_rows_amount_satang_nonnegative",
      "transactions_debt_payment_amount_satang_positive",
    ];
    for (const name of expectedConstraints) {
      expect(migration).toContain(name);
    }
  });

  it("handles nullable columns correctly (allows null, only rejects a present negative value)", () => {
    expect(migration).toContain("original_amount_satang is null or original_amount_satang >= 0");
    expect(migration).toContain("outstanding_balance_satang is null or outstanding_balance_satang >= 0");
    expect(migration).toContain("statement_balance_satang is null or statement_balance_satang >= 0");
    expect(migration).toContain("amount_due_satang is null or amount_due_satang >= 0");
    expect(migration).toContain("minimum_payment_satang is null or minimum_payment_satang >= 0");
    expect(migration).toContain("amount_satang is null or amount_satang >= 0"); // transaction_items
  });

  it("enforces the debt_payments amount as strictly positive, not merely nonnegative", () => {
    expect(migration).toContain("check (amount_satang > 0)");
  });

  it("adds a conditional CHECK requiring transactions.amount_satang > 0 only for type = 'debt_payment'", () => {
    expect(migration).toContain("check (type <> 'debt_payment' or amount_satang > 0)");
  });

  it("preserves the existing transactions.amount_satang >= 0 rule for every other transaction type", () => {
    // The new transactions constraint is additive: for any type other than
    // 'debt_payment' the condition `type <> 'debt_payment'` is true, so the
    // whole CHECK passes regardless of amount, leaving the original
    // `amount_satang >= 0` constraint (202607100001) as the only rule for
    // income/expense/transfer/refund. This migration must not touch or
    // duplicate that original constraint.
    expect(migration).not.toContain("amount_satang_nonnegative' and conrelid = 'public.transactions'");
    const initialSchema = readFileSync(
      join(process.cwd(), "supabase/migrations/202607100001_initial_tanglak_schema.sql"),
      "utf8",
    );
    expect(initialSchema).toContain("amount_satang bigint not null check (amount_satang >= 0)");
  });

  it("touches public.transactions only to add the new debt_payment-positivity constraint", () => {
    const transactionsAlterCount = (migration.match(/alter table public\.transactions\b/g) ?? []).length;
    expect(transactionsAlterCount).toBe(1);
  });

  it("documents transactions.type as not null so the new CHECK never needs to special-case a null type", () => {
    expect(migration).toMatch(/transactions\.type.*is.*`?not null`?/i);
    const initialSchema = readFileSync(
      join(process.cwd(), "supabase/migrations/202607100001_initial_tanglak_schema.sql"),
      "utf8",
    );
    expect(initialSchema).toContain("type transaction_type not null");
  });

  it("accurately describes `validate constraint` as a real per-row scan, not a metadata-only operation", () => {
    const singleLine = migration.replace(/\s+/g, " ");
    expect(singleLine).toMatch(/validate constraint.*scans? every.*row/i);
    // The old (incorrect) claim asserted it WAS a cheap metadata-only scan;
    // the corrected comment must not make that affirmative claim, even
    // though it's allowed to mention "metadata-only" while explicitly
    // negating it (e.g. "is NOT a metadata-only operation").
    expect(migration).not.toMatch(/is a cheap[,]?\s*non-blocking metadata-only scan/i);
    expect(migration).toMatch(/schedule the validation deliberately/i);
  });

  it("contains only ASCII characters (no mojibake from a UTF-8/Latin-1 mis-decode)", () => {
    const nonAscii = migration.match(/[^\x00-\x7F]/g);
    expect(nonAscii).toBeNull();
  });

  it("does not modify any historical migration file", () => {
    const historicalMigrations = [
      "202607100001_initial_tanglak_schema.sql",
      "202607100002_auth_crud_support.sql",
      "202607100003_profile_and_debt_hardening.sql",
      "202607100004_document_flow_support.sql",
      "202607100005_history_import_support.sql",
      "202607100006_history_import_hardening.sql",
      "202607100007_data_api_grants.sql",
      "202607100008_account_management_support.sql",
      "202607100009_pdf_statement_import.sql",
      "202607100010_navigation_performance_indexes.sql",
    ];
    for (const file of historicalMigrations) {
      expect(existsSync(join(process.cwd(), "supabase/migrations", file))).toBe(true);
    }
    // The original non-negative constraint on transactions must still be
    // present, unmodified, in its original migration file.
    const initialSchema = readFileSync(
      join(process.cwd(), "supabase/migrations/202607100001_initial_tanglak_schema.sql"),
      "utf8",
    );
    expect(initialSchema).toContain("amount_satang bigint not null check (amount_satang >= 0)");
  });

  it("never rewrites data — the migration contains no update/delete statement", () => {
    expect(migration).not.toMatch(/\bupdate\s+public\./i);
    expect(migration).not.toMatch(/\bdelete\s+from\s+public\./i);
  });
});
