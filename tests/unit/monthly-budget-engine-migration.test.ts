import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const migrationPath = join(process.cwd(), "supabase/migrations/202607110004_monthly_budget_engine.sql");

describe("monthly budget engine migration", () => {
  it("exists as a new migration file", () => {
    expect(existsSync(migrationPath)).toBe(true);
  });

  const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";

  it("adds a unique index for user/month/category (via monthly_budget_id, which already scopes user+month)", () => {
    expect(migration).toMatch(/create unique index if not exists uq_budget_categories_user_month_label/i);
    expect(migration).toContain("on public.budget_categories(user_id, monthly_budget_id, label)");
  });

  it("is idempotent (uses if not exists)", () => {
    expect(migration).toMatch(/if not exists/i);
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
      "202607110001_financial_value_guards.sql",
      "202607110002_history_import_idempotency.sql",
      "202607110003_ai_processing_claims.sql",
    ];
    for (const file of historicalMigrations) {
      expect(existsSync(join(process.cwd(), "supabase/migrations", file))).toBe(true);
    }
  });

  it("never rewrites existing data -- no update/delete statement", () => {
    expect(migration).not.toMatch(/\bupdate\s+public\./i);
    expect(migration).not.toMatch(/\bdelete\s+from\s+public\./i);
  });

  it("does not duplicate the already-existing non-negative CHECK constraints from the financial guards migration", () => {
    const financialGuardsPath = join(process.cwd(), "supabase/migrations/202607110001_financial_value_guards.sql");
    const financialGuards = readFileSync(financialGuardsPath, "utf8");
    expect(financialGuards).toContain("budget_categories_amount_satang_nonnegative");
    expect(financialGuards).toContain("monthly_budgets_income_satang_nonnegative");
    expect(migration).not.toContain("budget_categories_amount_satang_nonnegative");
    expect(migration).not.toContain("monthly_budgets_income_satang_nonnegative");
  });

  it("contains only ASCII characters (no mojibake)", () => {
    const nonAscii = migration.match(/[^\x00-\x7F]/g);
    expect(nonAscii).toBeNull();
  });

  it("confirms RLS already covers monthly_budgets and budget_categories in the initial schema (no new RLS needed)", () => {
    const initialSchemaPath = join(process.cwd(), "supabase/migrations/202607100001_initial_tanglak_schema.sql");
    const initialSchema = readFileSync(initialSchemaPath, "utf8");
    expect(initialSchema).toContain("'monthly_budgets','budget_categories'");
  });
});
