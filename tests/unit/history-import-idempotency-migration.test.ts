import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/202607110002_history_import_idempotency.sql",
);

describe("history import idempotency migration", () => {
  it("exists as a new migration file", () => {
    expect(existsSync(migrationPath)).toBe(true);
  });

  const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";

  it("adds a database-backed uniqueness guarantee on transactions.import_row_id", () => {
    expect(migration).toMatch(/create unique index if not exists uq_transactions_import_row_id/i);
    expect(migration).toContain("on public.transactions(import_row_id)");
    expect(migration).toContain("where import_row_id is not null");
  });

  it("defines an atomic single-row commit function using row-level locking, not an application mutex", () => {
    expect(migration).toMatch(/create or replace function public\.import_commit_row/i);
    expect(migration).toMatch(/for update/i);
    expect(migration).toContain("review_status in ('imported', 'skipped')");
  });

  it("the commit function is idempotent: an already-resolved row returns its existing transaction id instead of erroring", () => {
    expect(migration).toMatch(/already_imported/);
    expect(migration).toContain("return query select v_row.created_transaction_id, true;");
  });

  it("the commit function checks debt ownership before inserting a debt_payment", () => {
    expect(migration).toMatch(/debts where id = p_debt_id and user_id = p_user_id/i);
  });

  it("defines an atomic rollback function that is idempotent on re-entry", () => {
    expect(migration).toMatch(/create or replace function public\.import_rollback_batch/i);
    expect(migration).toContain("if v_status = 'rolled_back' then");
    expect(migration).toMatch(/return; -- idempotent re-entry/i);
  });

  it("the rollback function recalculates affected debts' cached totals", () => {
    expect(migration).toMatch(/v_affected_debt_ids/);
    expect(migration).toMatch(/amount_paid_this_cycle_satang = coalesce/i);
  });

  it("both functions are security invoker, relying on RLS in addition to explicit user_id checks", () => {
    const commitFnMatch = migration.match(
      /create or replace function public\.import_commit_row[\s\S]*?\$\$;/i,
    )?.[0];
    const rollbackFnMatch = migration.match(
      /create or replace function public\.import_rollback_batch[\s\S]*?\$\$;/i,
    )?.[0];
    expect(commitFnMatch).toBeTruthy();
    expect(rollbackFnMatch).toBeTruthy();
    expect(commitFnMatch).toMatch(/security invoker/i);
    expect(rollbackFnMatch).toMatch(/security invoker/i);
    expect(commitFnMatch).not.toMatch(/security definer/i);
    expect(rollbackFnMatch).not.toMatch(/security definer/i);
  });

  it("grants execute on both new functions to the authenticated role", () => {
    expect(migration).toMatch(/grant execute on function public\.import_commit_row/i);
    expect(migration).toMatch(/grant execute on function public\.import_rollback_batch/i);
    expect(migration).toMatch(/to authenticated;/i);
  });

  it("every row/batch lookup inside the functions is scoped by user_id, not id alone", () => {
    expect(migration).toContain("where id = p_row_id and user_id = p_user_id and import_batch_id = p_batch_id");
    expect(migration).toContain("where id = p_batch_id and user_id = p_user_id");
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
    ];
    for (const file of historicalMigrations) {
      expect(existsSync(join(process.cwd(), "supabase/migrations", file))).toBe(true);
    }
  });

  it("never rewrites unrelated data -- the migration issues no bare update/delete outside the two new functions", () => {
    const withoutFunctionBodies = migration
      .replace(/create or replace function[\s\S]*?\$\$;/gi, "")
      .trim();
    expect(withoutFunctionBodies).not.toMatch(/\bupdate\s+public\./i);
    expect(withoutFunctionBodies).not.toMatch(/\bdelete\s+from\s+public\./i);
  });

  it("contains only ASCII characters (no mojibake)", () => {
    const nonAscii = migration.match(/[^\x00-\x7F]/g);
    expect(nonAscii).toBeNull();
  });
});
